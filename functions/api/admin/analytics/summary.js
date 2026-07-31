import { numberValue } from '../../../_shared/analytics.js';
import {
  analyticsRangeClause,
  parseAnalyticsRange,
} from '../../../_shared/analytics-range.js';
import { json, methodNotAllowed } from '../../../_shared/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, { status: 500 });

  const range = parseAnalyticsRange(new URL(request.url).searchParams.get('range'));
  if (!range) {
    return json({ error: 'range must be today, 7d, month, or all' }, { status: 400 });
  }

  try {
    const rangeClause = analyticsRangeClause(range);
    const row = await env.DB.prepare(
      `SELECT
         count(*) AS pv,
         count(DISTINCT visitor_id) AS uv,
         count(DISTINCT page) AS pages
       FROM pageviews
       WHERE 1 = 1${rangeClause}`
    ).first();

    const pv = numberValue(row?.pv);
    const uv = numberValue(row?.uv);
    return json({
      range,
      pv,
      uv,
      pages: numberValue(row?.pages),
      viewsPerVisitor: uv > 0 ? Number((pv / uv).toFixed(2)) : 0,
    });
  } catch (error) {
    console.error('analytics summary failed', error);
    return json({ error: 'analytics service unavailable' }, { status: 500 });
  }
}
