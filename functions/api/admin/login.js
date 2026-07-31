import {
  createSessionToken,
  sessionCookie,
  timingSafeEqual,
} from '../../_shared/admin-auth.js';
import { json, methodNotAllowed, readJsonObject } from '../../_shared/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32) {
    return json({ error: 'admin authentication is not configured' }, { status: 500 });
  }

  const body = await readJsonObject(request, 1024);
  if (body.response) return body.response;
  if (typeof body.value.password !== 'string' || !timingSafeEqual(body.value.password, env.ADMIN_PASSWORD)) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await createSessionToken(env.ADMIN_SESSION_SECRET);
  return json(
    { ok: true },
    { headers: { 'Set-Cookie': sessionCookie(token, request) } }
  );
}
