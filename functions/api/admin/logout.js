import { expiredSessionCookie } from '../../_shared/admin-auth.js';
import { json, methodNotAllowed } from '../../_shared/http.js';

export async function onRequest({ request }) {
  if (request.method !== 'POST') return methodNotAllowed(['POST']);

  return json(
    { ok: true },
    { headers: { 'Set-Cookie': expiredSessionCookie(request) } }
  );
}
