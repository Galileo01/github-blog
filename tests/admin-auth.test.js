import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
  createSessionToken,
  expiredSessionCookie,
  parseCookies,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookie,
  timingSafeEqual,
  verifySessionToken,
} from '../functions/_shared/admin-auth.js';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

const secret = 'a-secure-test-secret-that-is-at-least-32-characters';

test('session token accepts valid payload and rejects malformed variants', async () => {
  const issuedAt = 1_000;
  const token = await createSessionToken(secret, issuedAt);

  assert.equal(await verifySessionToken(token, secret, issuedAt + 1), true);
  assert.equal(await verifySessionToken(token, 'different-secret', issuedAt + 1), false);
  assert.equal(await verifySessionToken(`${token}.extra`, secret, issuedAt + 1), false);
  assert.equal(await verifySessionToken(token, secret, issuedAt + SESSION_TTL_MS), false);
  assert.equal(await verifySessionToken('invalid', secret, issuedAt + 1), false);
});

test('timingSafeEqual handles equal and different-length strings', () => {
  assert.equal(timingSafeEqual('same', 'same'), true);
  assert.equal(timingSafeEqual('same', 'different'), false);
  assert.equal(timingSafeEqual('', 'x'), false);
});

test('cookie parser tolerates malformed percent encoding', () => {
  const request = new Request('https://example.com', {
    headers: { Cookie: `${SESSION_COOKIE}=%E0%A4%A; other=value` },
  });
  assert.deepEqual(parseCookies(request), {
    [SESSION_COOKIE]: '',
    other: 'value',
  });
});

test('session cookies use Secure on HTTPS and expire explicitly', () => {
  const httpsRequest = new Request('https://example.com/api/admin/login');
  const httpRequest = new Request('http://localhost:8788/api/admin/login');

  assert.match(sessionCookie('token', httpsRequest), /; Secure$/);
  assert.doesNotMatch(sessionCookie('token', httpRequest), /; Secure/);
  assert.match(expiredSessionCookie(httpsRequest), /Max-Age=0/);
});
