import { minuteBucket, normalizePage, normalizeVisitorId, numberValue } from '../_shared/analytics.js';
import { json, methodNotAllowed, readJsonObject } from '../_shared/http.js';

async function pageStats(db, page) {
  const row = await db.prepare(
    `SELECT count(*) AS pv, count(DISTINCT visitor_id) AS uv
     FROM pageviews
     WHERE page = ?`
  ).bind(page).first();

  return {
    page,
    pv: numberValue(row?.pv),
    uv: numberValue(row?.uv),
  };
}

async function handlePost(request, db) {
  const body = await readJsonObject(request);
  if (body.response) return body.response;

  const page = normalizePage(body.value.page);
  const visitorId = normalizeVisitorId(body.value.visitorId);
  if (!page) return json({ error: 'invalid page' }, { status: 400 });
  if (!visitorId) return json({ error: 'invalid visitorId' }, { status: 400 });

  const result = await db.prepare(
    `INSERT OR IGNORE INTO pageviews (page, visitor_id, minute_bucket)
     VALUES (?, ?, ?)`
  ).bind(page, visitorId, minuteBucket()).run();

  return json({
    recorded: numberValue(result.meta?.changes) > 0,
    ...await pageStats(db, page),
  });
}

async function handleGet(request, db) {
  const page = normalizePage(new URL(request.url).searchParams.get('page'));
  if (!page) return json({ error: 'invalid page' }, { status: 400 });
  return json(await pageStats(db, page));
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, { status: 500 });

  try {
    if (request.method === 'POST') return await handlePost(request, env.DB);
    if (request.method === 'GET') return await handleGet(request, env.DB);
    return methodNotAllowed(['GET', 'POST']);
  } catch (error) {
    console.error('analytics request failed', error);
    return json({ error: 'analytics service unavailable' }, { status: 500 });
  }
}
