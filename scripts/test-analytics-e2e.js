import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = ['dlx', 'wrangler@4.114.0'];
const databaseId = '11111111-1111-4111-8111-111111111111';
const adminPassword = 'test-password';
const sessionSecret = 'local-integration-session-secret-at-least-32-characters';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function tomlString(value) {
  return JSON.stringify(value);
}

async function getAvailablePort() {
  const server = net.createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error('unable to allocate a local test port');
  return port;
}

function runCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: projectRoot,
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`command failed (${signal || code}): pnpm ${args.join(' ')}\n${output}`));
      }
    });
  });
}

function pagesDevEnvironment() {
  const env = {
    CI: 'true',
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SHELL', 'USER', 'LANG', 'LC_ALL', 'TERM', 'PNPM_HOME']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function startPagesDev({ envFile, port, stateDirectory }) {
  const child = spawn('pnpm', [
    ...wrangler,
    'pages',
    'dev',
    'dist',
    '--d1',
    `DB=${databaseId}`,
    '--persist-to',
    stateDirectory,
    '--port',
    String(port),
    '--compatibility-date',
    '2026-07-28',
    '--log-level',
    'warn',
    '--env-file',
    envFile,
  ], {
    cwd: projectRoot,
    env: pagesDevEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const appendOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  return { child, getOutput: () => output };
}

async function waitUntilReady(server, baseUrl) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.child.exitCode !== null) {
      throw new Error(`wrangler pages dev exited before becoming ready\n${server.getOutput()}`);
    }

    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local server may still be starting.
    }
    await delay(200);
  }
  throw new Error(`wrangler pages dev did not become ready\n${server.getOutput()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    delay(3_000).then(() => false),
  ]);
  if (!stoppedGracefully && child.exitCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function request(baseUrl, requestPath, init) {
  const response = await fetch(`${baseUrl}${requestPath}`, init);
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`expected JSON from ${requestPath}, received: ${text.slice(0, 200)}`);
    }
  }

  return { response, body };
}

async function verifyApi(baseUrl) {
  const visitorId = '550e8400-e29b-41d4-a716-446655440000';
  const analyticsRequest = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: '/blog/hello-world/', visitorId }),
  };

  const first = await request(baseUrl, '/api/analytics', analyticsRequest);
  assert.equal(first.response.status, 200);
  assert.deepEqual(first.body, {
    recorded: true,
    page: '/blog/hello-world',
    pv: 2,
    uv: 2,
  });

  const duplicate = await request(baseUrl, '/api/analytics', {
    ...analyticsRequest,
    body: JSON.stringify({ page: '/blog/hello-world', visitorId }),
  });
  assert.equal(duplicate.response.status, 200);
  assert.deepEqual(duplicate.body, {
    recorded: false,
    page: '/blog/hello-world',
    pv: 2,
    uv: 2,
  });

  const pageStats = await request(baseUrl, '/api/analytics?page=/blog/hello-world');
  assert.equal(pageStats.response.status, 200);
  assert.deepEqual(pageStats.body, { page: '/blog/hello-world', pv: 2, uv: 2 });

  const invalidPage = await request(baseUrl, '/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: '/admin', visitorId }),
  });
  assert.equal(invalidPage.response.status, 400);

  const unauthenticated = await request(baseUrl, '/api/admin/analytics/summary');
  assert.equal(unauthenticated.response.status, 401);

  const wrongLogin = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  assert.equal(wrongLogin.response.status, 401);

  const login = await request(baseUrl, '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(login.response.status, 200);
  const setCookie = login.response.headers.get('set-cookie');
  assert.ok(setCookie?.includes('admin_session='));
  assert.ok(setCookie?.includes('HttpOnly'));
  assert.ok(!setCookie?.includes('Secure'));
  const sessionCookie = setCookie.split(';', 1)[0];
  const authenticated = { headers: { Cookie: sessionCookie } };

  const summary = await request(
    baseUrl,
    '/api/admin/analytics/summary?range=7d',
    authenticated
  );
  assert.equal(summary.response.status, 200);
  assert.deepEqual(summary.body, {
    range: '7d',
    pv: 8,
    uv: 3,
    pages: 5,
    viewsPerVisitor: 2.67,
  });

  const trends = await request(
    baseUrl,
    '/api/admin/analytics/trends?range=7d',
    authenticated
  );
  assert.equal(trends.response.status, 200);
  assert.equal(trends.body.range, '7d');
  assert.equal(trends.body.granularity, 'day');
  assert.equal(trends.body.rows.length, 7);
  assert.equal(trends.body.rows.at(-1).pv, 8);
  assert.equal(trends.body.rows.at(-1).uv, 3);

  const todayTrends = await request(
    baseUrl,
    '/api/admin/analytics/trends?range=today',
    authenticated
  );
  assert.equal(todayTrends.response.status, 200);
  assert.equal(todayTrends.body.granularity, 'hour');
  assert.equal(todayTrends.body.rows.length, 24);
  assert.equal(
    todayTrends.body.rows.reduce((sum, row) => sum + row.pv, 0),
    8
  );

  const allTrends = await request(
    baseUrl,
    '/api/admin/analytics/trends?range=all',
    authenticated
  );
  assert.equal(allTrends.response.status, 200);
  assert.equal(allTrends.body.granularity, 'week');
  assert.equal(
    allTrends.body.rows.reduce((sum, row) => sum + row.pv, 0),
    9
  );

  const popular = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=7d&limit=10',
    authenticated
  );
  assert.equal(popular.response.status, 200);
  assert.deepEqual(popular.body, {
    range: '7d',
    rows: [
      { page: '/', pv: 3, uv: 1 },
      { page: '/blog/mastra-assistant-client-tool', pv: 2, uv: 2 },
      { page: '/blog', pv: 1, uv: 1 },
      { page: '/blog/hello-world', pv: 1, uv: 1 },
      { page: '/projects', pv: 1, uv: 1 },
    ],
  });

  for (const range of ['today', 'month']) {
    const rangedSummary = await request(
      baseUrl,
      `/api/admin/analytics/summary?range=${range}`,
      authenticated
    );
    assert.equal(rangedSummary.response.status, 200);
    assert.deepEqual(rangedSummary.body, {
      range,
      pv: 8,
      uv: 3,
      pages: 5,
      viewsPerVisitor: 2.67,
    });
  }

  const distribution = await request(
    baseUrl,
    '/api/admin/analytics/distribution?range=7d&dimension=section&metric=pv',
    authenticated
  );
  assert.equal(distribution.response.status, 200);
  assert.deepEqual(distribution.body, {
    range: '7d',
    metric: 'pv',
    dimension: 'section',
    total: 8,
    totalItems: 4,
    rows: [
      { page: '博客（/blog/*）', pv: 3, uv: 3 },
      { page: '首页（/）', pv: 3, uv: 1 },
      { page: '博客列表（/blog）', pv: 1, uv: 1 },
      { page: '项目（/projects）', pv: 1, uv: 1 },
    ],
  });

  const blogByPv = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=7d&limit=1&path=%20BLOG%20&sort=pv&order=desc',
    authenticated
  );
  assert.equal(blogByPv.response.status, 200);
  assert.deepEqual(blogByPv.body, {
    range: '7d',
    rows: [
      { page: '/blog/mastra-assistant-client-tool', pv: 2, uv: 2 },
    ],
  });

  const distributionAfterPath = await request(
    baseUrl,
    '/api/admin/analytics/distribution?range=7d&dimension=section&metric=pv',
    authenticated
  );
  assert.deepEqual(distributionAfterPath.body, distribution.body);

  const byUv = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=7d&limit=10&sort=uv&order=desc',
    authenticated
  );
  assert.equal(byUv.response.status, 200);
  assert.deepEqual(byUv.body, {
    range: '7d',
    rows: [
      { page: '/blog/mastra-assistant-client-tool', pv: 2, uv: 2 },
      { page: '/', pv: 3, uv: 1 },
      { page: '/blog', pv: 1, uv: 1 },
      { page: '/blog/hello-world', pv: 1, uv: 1 },
      { page: '/projects', pv: 1, uv: 1 },
    ],
  });

  const uvDistribution = await request(
    baseUrl,
    '/api/admin/analytics/distribution?range=7d&dimension=section&metric=uv',
    authenticated
  );
  assert.equal(uvDistribution.response.status, 200);
  assert.deepEqual(uvDistribution.body, {
    range: '7d',
    metric: 'uv',
    dimension: 'section',
    total: 6,
    totalItems: 4,
    rows: [
      { page: '博客（/blog/*）', pv: 3, uv: 3 },
      { page: '首页（/）', pv: 3, uv: 1 },
      { page: '博客列表（/blog）', pv: 1, uv: 1 },
      { page: '项目（/projects）', pv: 1, uv: 1 },
    ],
  });

  const articleDistribution = await request(
    baseUrl,
    '/api/admin/analytics/distribution?range=7d&dimension=article&metric=pv',
    authenticated
  );
  assert.equal(articleDistribution.response.status, 200);
  assert.deepEqual(articleDistribution.body, {
    range: '7d',
    metric: 'pv',
    dimension: 'article',
    total: 3,
    totalItems: 2,
    rows: [
      { page: '/blog/mastra-assistant-client-tool', pv: 2, uv: 2 },
      { page: '/blog/hello-world', pv: 1, uv: 1 },
    ],
  });

  const ascending = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=7d&limit=10&sort=pv&order=asc',
    authenticated
  );
  assert.equal(ascending.response.status, 200);
  assert.deepEqual(ascending.body, {
    range: '7d',
    rows: [
      { page: '/blog', pv: 1, uv: 1 },
      { page: '/blog/hello-world', pv: 1, uv: 1 },
      { page: '/projects', pv: 1, uv: 1 },
      { page: '/blog/mastra-assistant-client-tool', pv: 2, uv: 2 },
      { page: '/', pv: 3, uv: 1 },
    ],
  });

  const noMatches = await request(
    baseUrl,
    '/api/admin/analytics/popular?path=missing',
    authenticated
  );
  assert.equal(noMatches.response.status, 200);
  assert.deepEqual(noMatches.body, {
    range: '7d',
    rows: [],
  });

  const allTime = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=all&limit=10',
    authenticated
  );
  assert.equal(allTime.response.status, 200);
  assert.equal(
    allTime.body.rows.find((row) => row.page === '/blog/hello-world')?.pv,
    2
  );

  const allSummary = await request(
    baseUrl,
    '/api/admin/analytics/summary?range=all',
    authenticated
  );
  assert.deepEqual(allSummary.body, {
    range: 'all',
    pv: 9,
    uv: 4,
    pages: 5,
    viewsPerVisitor: 2.25,
  });

  const invalidRange = await request(
    baseUrl,
    '/api/admin/analytics/popular?range=year',
    authenticated
  );
  assert.equal(invalidRange.response.status, 400);

  const invalidPathFilter = await request(
    baseUrl,
    '/api/admin/analytics/popular?path=hello_world',
    authenticated
  );
  assert.equal(invalidPathFilter.response.status, 400);

  const invalidTrendRange = await request(
    baseUrl,
    '/api/admin/analytics/trends?range=year',
    authenticated
  );
  assert.equal(invalidTrendRange.response.status, 400);

  const invalidDistributionMetric = await request(
    baseUrl,
    '/api/admin/analytics/distribution?metric=page',
    authenticated
  );
  assert.equal(invalidDistributionMetric.response.status, 400);

  const invalidDistributionDimension = await request(
    baseUrl,
    '/api/admin/analytics/distribution?dimension=path',
    authenticated
  );
  assert.equal(invalidDistributionDimension.response.status, 400);

  const logout = await request(baseUrl, '/api/admin/logout', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
  });
  assert.equal(logout.response.status, 200);
  assert.ok(logout.response.headers.get('set-cookie')?.includes('Max-Age=0'));
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'github-blog-analytics-'));
const stateDirectory = path.join(temporaryRoot, 'state');
const configPath = path.join(temporaryRoot, 'wrangler.toml');
const envFile = path.join(temporaryRoot, 'analytics-test.env');
const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
let server;

try {
  await writeFile(configPath, [
    'name = "github-blog-analytics-test"',
    `pages_build_output_dir = ${tomlString(path.join(projectRoot, 'dist'))}`,
    'compatibility_date = "2026-07-28"',
    '',
    '[[d1_databases]]',
    'binding = "DB"',
    'database_name = "github-blog-test"',
    `database_id = "${databaseId}"`,
    `migrations_dir = ${tomlString(path.join(projectRoot, 'migrations'))}`,
    '',
  ].join('\n'));
  await writeFile(envFile, [
    `ADMIN_PASSWORD=${JSON.stringify(adminPassword)}`,
    `ADMIN_SESSION_SECRET=${JSON.stringify(sessionSecret)}`,
    '',
  ].join('\n'), { mode: 0o600 });

  console.log('Applying migrations to an isolated local D1 database...');
  await runCommand([
    ...wrangler,
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    stateDirectory,
  ]);

  const secondMigration = await runCommand([
    ...wrangler,
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    stateDirectory,
  ]);
  assert.match(secondMigration, /No migrations to apply/i);

  console.log('Seeding deterministic analytics fixtures...');
  await runCommand([
    ...wrangler,
    'd1',
    'execute',
    'DB',
    '--local',
    '--config',
    configPath,
    '--persist-to',
    stateDirectory,
    '--command',
    `INSERT INTO pageviews (page, visitor_id, minute_bucket, created_at) VALUES
      ('/', '11111111-1111-4111-8111-111111111111', 1, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-3 minutes')),
      ('/', '11111111-1111-4111-8111-111111111111', 2, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-2 minutes')),
      ('/', '11111111-1111-4111-8111-111111111111', 3, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-1 minute')),
      ('/blog/mastra-assistant-client-tool', '11111111-1111-4111-8111-111111111111', 4, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-2 minutes')),
      ('/blog/mastra-assistant-client-tool', '22222222-2222-4222-8222-222222222222', 5, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-1 minute')),
      ('/projects', '11111111-1111-4111-8111-111111111111', 6, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-1 minute')),
      ('/blog', '11111111-1111-4111-8111-111111111111', 8, datetime(date('now', '+8 hours'), '-8 hours', '+12 hours', '-1 minute')),
      ('/blog/hello-world', '33333333-3333-4333-8333-333333333333', 7, datetime('now', '-40 days'));`,
  ]);

  console.log(`Starting Pages Functions on ${baseUrl}...`);
  server = startPagesDev({ envFile, port, stateDirectory });
  await waitUntilReady(server, baseUrl);
  await verifyApi(baseUrl);
  console.log('Pages Functions + D1 end-to-end test passed.');
} finally {
  await stopServer(server?.child);
  await rm(temporaryRoot, { recursive: true, force: true });
}
