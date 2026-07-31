import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { onRequest as login } from '../functions/api/admin/login.js';
import { onRequest as logout } from '../functions/api/admin/logout.js';
import { onRequest as middleware } from '../functions/api/admin/_middleware.js';
import { onRequest as distribution } from '../functions/api/admin/analytics/distribution.js';
import { onRequest as popular } from '../functions/api/admin/analytics/popular.js';
import { onRequest as summary } from '../functions/api/admin/analytics/summary.js';
import { onRequest as trends } from '../functions/api/admin/analytics/trends.js';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

const env = {
  ADMIN_PASSWORD: 'correct-password',
  ADMIN_SESSION_SECRET: 'a-secure-test-secret-that-is-at-least-32-characters',
};

function loginRequest(password) {
  return new Request('https://example.com/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

test('login creates an authenticated cookie and middleware accepts it', async () => {
  const response = await login({ request: loginRequest('correct-password'), env });
  assert.equal(response.status, 200);

  const setCookie = response.headers.get('Set-Cookie');
  assert.match(setCookie, /admin_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);

  let nextCalled = false;
  const protectedResponse = await middleware({
    request: new Request('https://example.com/api/admin/analytics/summary', {
      headers: { Cookie: setCookie.split(';')[0] },
    }),
    env,
    next() {
      nextCalled = true;
      return new Response('ok');
    },
  });
  assert.equal(nextCalled, true);
  assert.equal(await protectedResponse.text(), 'ok');
});

test('login rejects wrong or invalid input and requires strong configuration', async () => {
  assert.equal((await login({ request: loginRequest('wrong'), env })).status, 401);

  const nullBody = new Request('https://example.com/api/admin/login', {
    method: 'POST',
    body: 'null',
  });
  assert.equal((await login({ request: nullBody, env })).status, 400);

  assert.equal((await login({
    request: loginRequest('correct-password'),
    env: { ADMIN_PASSWORD: 'correct-password', ADMIN_SESSION_SECRET: 'short' },
  })).status, 500);
});

test('middleware rejects unauthenticated requests but keeps login and logout public', async () => {
  const unauthorized = await middleware({
    request: new Request('https://example.com/api/admin/analytics/summary'),
    env,
    next: () => new Response('unexpected'),
  });
  assert.equal(unauthorized.status, 401);

  for (const path of ['/api/admin/login', '/api/admin/logout']) {
    const response = await middleware({
      request: new Request(`https://example.com${path}`),
      env,
      next: () => new Response('public'),
    });
    assert.equal(await response.text(), 'public');
  }
});

test('logout expires the session cookie', async () => {
  const response = await logout({
    request: new Request('https://example.com/api/admin/logout', { method: 'POST' }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0/);
});

test('admin query endpoints reject invalid parameters before querying D1', async () => {
  const db = {
    prepare() {
      throw new Error('database should not be queried');
    },
  };

  const invalidLimit = await popular({
    request: new Request('https://example.com/api/admin/analytics/popular?limit=1.5'),
    env: { DB: db },
  });
  assert.equal(invalidLimit.status, 400);

  for (const query of [
    'path=hello_world',
    `path=${'a'.repeat(201)}`,
    'range=year',
    'range=toString',
    'sort=page',
    'order=sideways',
  ]) {
    const response = await popular({
      request: new Request(`https://example.com/api/admin/analytics/popular?${query}`),
      env: { DB: db },
    });
    assert.equal(response.status, 400);
  }

  for (const handler of [summary, trends, distribution]) {
    for (const range of ['year', 'toString']) {
      const response = await handler({
        request: new Request(`https://example.com/api/admin/analytics/test?range=${range}`),
        env: { DB: db },
      });
      assert.equal(response.status, 400);
    }
  }

  const invalidMetric = await distribution({
    request: new Request('https://example.com/api/admin/analytics/distribution?metric=page'),
    env: { DB: db },
  });
  assert.equal(invalidMetric.status, 400);

  const invalidDimension = await distribution({
    request: new Request('https://example.com/api/admin/analytics/distribution?dimension=path'),
    env: { DB: db },
  });
  assert.equal(invalidDimension.status, 400);
});

test('all-time trends select granularity through Beijing today and bind daily start dates', async () => {
  const createDb = ({ firstDay, today }) => {
    const calls = [];
    return {
      calls,
      prepare(sql) {
        const call = { sql, bindings: [] };
        calls.push(call);
        return {
          first: async () => ({ first_day: firstDay, today }),
          bind(...bindings) {
            call.bindings = bindings;
            return {
              all: async () => ({ results: [] }),
            };
          },
          all: async () => ({ results: [] }),
        };
      },
    };
  };

  const staleDb = createDb({
    firstDay: '2024-01-01',
    today: '2026-07-30',
  });
  const staleResponse = await trends({
    request: new Request('https://example.com/api/admin/analytics/trends?range=all'),
    env: { DB: staleDb },
  });
  assert.equal(staleResponse.status, 200);
  assert.equal((await staleResponse.json()).granularity, 'month');
  assert.match(staleDb.calls[1].sql, /WITH RECURSIVE months/);
  assert.deepEqual(staleDb.calls[1].bindings, ['2024-01-01']);

  const recentDb = createDb({
    firstDay: '2026-07-29',
    today: '2026-07-30',
  });
  const recentResponse = await trends({
    request: new Request('https://example.com/api/admin/analytics/trends?range=all'),
    env: { DB: recentDb },
  });
  assert.equal(recentResponse.status, 200);
  assert.equal((await recentResponse.json()).granularity, 'day');
  assert.match(recentDb.calls[1].sql, /SELECT date\(\?\)/);
  assert.deepEqual(recentDb.calls[1].bindings, ['2026-07-29']);
});
