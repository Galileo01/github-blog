import { spawn } from 'node:child_process';
import {
  mkdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = ['dlx', 'wrangler@4.114.0'];
const databaseId = '11111111-1111-4111-8111-111111111111';
const stateDirectory = path.join(projectRoot, '.wrangler', 'state');
const localConfig = path.join(projectRoot, 'wrangler.local.example.toml');
const localEnvFile = path.join(stateDirectory, 'analytics-dev.env');
const adminPassword = process.env.ADMIN_PASSWORD || 'test-password';
const sessionSecret = process.env.ADMIN_SESSION_SECRET
  || 'local-development-session-secret-at-least-32-characters';

function pagesDevEnvironment() {
  const env = {
    CLOUDFLARE_INCLUDE_PROCESS_ENV: 'true',
  };
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'SHELL', 'USER', 'LANG', 'LC_ALL', 'TERM', 'PNPM_HOME']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function run(args, { nonInteractive = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: projectRoot,
      env: nonInteractive ? { ...process.env, CI: 'true' } : process.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`command failed (${signal || code}): pnpm ${args.join(' ')}`));
      }
    });
  });
}

function startPagesDev() {
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
    '8788',
    '--compatibility-date',
    '2026-07-28',
    '--env-file',
    localEnvFile,
  ], {
    cwd: projectRoot,
    env: pagesDevEnvironment(),
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }

  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0 || signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve();
      } else {
        reject(new Error(`wrangler pages dev failed (${signal || code})`));
      }
    });
  });
}

console.log('Building the Astro site...');
await run(['build']);

console.log('Applying local D1 migrations...');
await run([
  ...wrangler,
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--config',
  localConfig,
  '--persist-to',
  stateDirectory,
], { nonInteractive: true });

await mkdir(stateDirectory, { recursive: true });
await writeFile(localEnvFile, [
  `ADMIN_PASSWORD=${JSON.stringify(adminPassword)}`,
  `ADMIN_SESSION_SECRET=${JSON.stringify(sessionSecret)}`,
  '',
].join('\n'), { mode: 0o600 });

try {
  console.log('Starting Pages Functions at http://localhost:8788');
  console.log(
    process.env.ADMIN_PASSWORD
      ? 'Local analytics admin password: using ADMIN_PASSWORD from the environment'
      : 'Local analytics admin password: test-password'
  );
  await startPagesDev();
} finally {
  await unlink(localEnvFile).catch(() => {});
}
