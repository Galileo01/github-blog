export const SESSION_COOKIE = 'admin_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(input) {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

export function timingSafeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(String(left));
  const rightBytes = new TextEncoder().encode(String(right));
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return mismatch === 0;
}

export function parseCookies(request) {
  const cookies = {};
  const header = request.headers.get('Cookie') || '';

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const name = trimmed.slice(0, separator);
    try {
      cookies[name] = decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      cookies[name] = '';
    }
  }

  return cookies;
}

export async function createSessionToken(secret, now = Date.now()) {
  const payload = base64UrlEncode(JSON.stringify({
    role: 'admin',
    iat: now,
    exp: now + SESSION_TTL_MS,
  }));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [payload, signature] = parts;

  try {
    const expected = await sign(payload, secret);
    if (!timingSafeEqual(signature, expected)) return false;

    const data = JSON.parse(base64UrlDecode(payload));
    return data.role === 'admin'
      && Number.isFinite(data.iat)
      && Number.isFinite(data.exp)
      && data.iat <= now
      && data.exp > now;
  } catch {
    return false;
  }
}

export async function isAuthenticated(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookies = parseCookies(request);
  return verifySessionToken(cookies[SESSION_COOKIE], env.ADMIN_SESSION_SECRET);
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure}`;
}

export function expiredSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}
