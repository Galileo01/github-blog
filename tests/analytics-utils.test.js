import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeLikePattern,
  minuteBucket,
  normalizePage,
  normalizePathFilter,
  normalizeVisitorId,
  numberValue,
} from '../functions/_shared/analytics.js';
import {
  parseBoundedInteger,
  readJsonObject,
} from '../functions/_shared/http.js';

test('normalizePage accepts only supported canonical routes', () => {
  assert.equal(normalizePage('/'), '/');
  assert.equal(normalizePage('/blog'), '/blog');
  assert.equal(normalizePage('/blog/'), '/blog');
  assert.equal(normalizePage('/projects'), '/projects');
  assert.equal(normalizePage('/projects/'), '/projects');
  assert.equal(normalizePage('/blog/hello-world'), '/blog/hello-world');
  assert.equal(normalizePage('/blog/hello-world/'), '/blog/hello-world');

  assert.equal(normalizePage('/blog/Hello'), null);
  assert.equal(normalizePage('/blog/hello_world'), null);
  assert.equal(normalizePage('/blog/hello-world//'), null);
  assert.equal(normalizePage('/blog/hello?preview=1'), null);
  assert.equal(normalizePage('//example.com'), null);
  assert.equal(normalizePage('/admin/analytics'), null);
  assert.equal(normalizePage(' /blog/hello'), null);
});

test('normalizePathFilter normalizes safe literal path searches', () => {
  assert.equal(normalizePathFilter(null), '');
  assert.equal(normalizePathFilter(''), '');
  assert.equal(normalizePathFilter('  Hello-World  '), 'hello-world');
  assert.equal(normalizePathFilter('/BLOG/example'), '/blog/example');
  assert.equal(normalizePathFilter('a'.repeat(200)), 'a'.repeat(200));
});

test('normalizePathFilter rejects unsupported or oversized searches', () => {
  assert.equal(normalizePathFilter('a'.repeat(201)), null);
  assert.equal(normalizePathFilter('/blog?draft=true'), null);
  assert.equal(normalizePathFilter('hello_world'), null);
  assert.equal(normalizePathFilter({}), null);
});

test('escapeLikePattern escapes LIKE metacharacters literally', () => {
  assert.equal(escapeLikePattern(String.raw`100%_done\later`), String.raw`100\%\_done\\later`);
});

test('normalizeVisitorId accepts UUID v4 and canonicalizes case', () => {
  assert.equal(
    normalizeVisitorId('550E8400-E29B-41D4-A716-446655440000'),
    '550e8400-e29b-41d4-a716-446655440000'
  );
  assert.equal(normalizeVisitorId('550e8400-e29b-11d4-a716-446655440000'), null);
  assert.equal(normalizeVisitorId('not-a-uuid'), null);
  assert.equal(normalizeVisitorId(null), null);
});

test('minuteBucket uses server timestamp minutes', () => {
  assert.equal(minuteBucket(0), 0);
  assert.equal(minuteBucket(59_999), 0);
  assert.equal(minuteBucket(60_000), 1);
});

test('numberValue returns finite numbers only', () => {
  assert.equal(numberValue('12'), 12);
  assert.equal(numberValue(undefined), 0);
  assert.equal(numberValue(Number.NaN), 0);
});

test('parseBoundedInteger rejects NaN, fractions and out-of-range values', () => {
  const options = { defaultValue: 7, min: 1, max: 30 };
  assert.equal(parseBoundedInteger(null, options), 7);
  assert.equal(parseBoundedInteger('14', options), 14);
  assert.equal(parseBoundedInteger('abc', options), null);
  assert.equal(parseBoundedInteger('1.5', options), null);
  assert.equal(parseBoundedInteger('0', options), null);
  assert.equal(parseBoundedInteger('31', options), null);
});

test('readJsonObject validates shape and byte size', async () => {
  const valid = await readJsonObject(new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ page: '/' }),
  }));
  assert.deepEqual(valid.value, { page: '/' });

  const nullBody = await readJsonObject(new Request('https://example.com', {
    method: 'POST',
    body: 'null',
  }));
  assert.equal(nullBody.response.status, 400);

  const invalid = await readJsonObject(new Request('https://example.com', {
    method: 'POST',
    body: '{',
  }));
  assert.equal(invalid.response.status, 400);

  const oversized = await readJsonObject(new Request('https://example.com', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(100) }),
  }), 32);
  assert.equal(oversized.response.status, 413);
});
