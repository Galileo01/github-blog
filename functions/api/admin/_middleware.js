import { isAuthenticated } from '../../_shared/admin-auth.js';
import { json } from '../../_shared/http.js';

const PUBLIC_ADMIN_PATHS = new Set(['/api/admin/login', '/api/admin/logout']);

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return context.next();

  if (await isAuthenticated(context.request, context.env)) {
    return context.next();
  }

  return json({ error: 'Unauthorized' }, { status: 401 });
}
