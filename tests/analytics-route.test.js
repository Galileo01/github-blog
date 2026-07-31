import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../functions/api/analytics.js';

const visitorId = '550e8400-e29b-41d4-a716-446655440000';

class AnalyticsDb {
  rows = [];

  prepare(sql) {
    const database = this;
    return {
      values: [],
      bind(...values) {
        this.values = values;
        return this;
      },
      async run() {
        assert.match(sql, /INSERT OR IGNORE INTO pageviews/);
        const [page, id, bucket] = this.values;
        const duplicate = database.rows.some(
          (row) => row.page === page && row.visitorId === id && row.bucket === bucket
        );
        if (!duplicate) database.rows.push({ page, visitorId: id, bucket });
        return { meta: { changes: duplicate ? 0 : 1 } };
      },
      async first() {
        assert.match(sql, /count\(\*\) AS pv/);
        const [page] = this.values;
        const rows = database.rows.filter((row) => row.page === page);
        return {
          pv: rows.length,
          uv: new Set(rows.map((row) => row.visitorId)).size,
        };
      },
    };
  }
}

function post(body, db) {
  return onRequest({
    request: new Request('https://example.com/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env: { DB: db },
  });
}

test('analytics route records once per minute bucket and returns current stats', async () => {
  const db = new AnalyticsDb();
  const first = await post({ page: '/blog/hello-world/', visitorId }, db);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    recorded: true,
    page: '/blog/hello-world',
    pv: 1,
    uv: 1,
  });

  const duplicate = await post({ page: '/blog/hello-world', visitorId }, db);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), {
    recorded: false,
    page: '/blog/hello-world',
    pv: 1,
    uv: 1,
  });
});

test('analytics route rejects invalid input without writing', async () => {
  const db = new AnalyticsDb();

  const invalidPage = await post({ page: '/admin/analytics', visitorId }, db);
  assert.equal(invalidPage.status, 400);

  const invalidVisitor = await post({ page: '/', visitorId: 'invalid' }, db);
  assert.equal(invalidVisitor.status, 400);

  const nullBody = await onRequest({
    request: new Request('https://example.com/api/analytics', {
      method: 'POST',
      body: 'null',
    }),
    env: { DB: db },
  });
  assert.equal(nullBody.status, 400);
  assert.equal(db.rows.length, 0);
});

test('analytics GET validates page and reports missing DB binding', async () => {
  const db = new AnalyticsDb();
  const valid = await onRequest({
    request: new Request('https://example.com/api/analytics?page=%2Fblog%2Fhello-world'),
    env: { DB: db },
  });
  assert.deepEqual(await valid.json(), {
    page: '/blog/hello-world',
    pv: 0,
    uv: 0,
  });

  const invalid = await onRequest({
    request: new Request('https://example.com/api/analytics?page=%2Ffake'),
    env: { DB: db },
  });
  assert.equal(invalid.status, 400);

  const missingDb = await onRequest({
    request: new Request('https://example.com/api/analytics?page=%2F'),
    env: {},
  });
  assert.equal(missingDb.status, 500);
});
