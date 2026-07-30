import {
  escapeLikePattern,
  normalizePathFilter,
  numberValue,
} from '../../../_shared/analytics.js';
import {
  analyticsRangeClause,
  parseAnalyticsRange,
} from '../../../_shared/analytics-range.js';
import { json, methodNotAllowed, parseBoundedInteger } from '../../../_shared/http.js';

const ORDER_BY = {
  'pv:asc': 'pv ASC, uv ASC, page ASC',
  'pv:desc': 'pv DESC, uv DESC, page ASC',
  'uv:asc': 'uv ASC, pv ASC, page ASC',
  'uv:desc': 'uv DESC, pv DESC, page ASC',
};

function mapRows(result) {
  return (result.results || []).map((row) => ({
    page: row.page,
    pv: numberValue(row.pv),
    uv: numberValue(row.uv),
  }));
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, { status: 500 });

  const searchParams = new URL(request.url).searchParams;
  const range = parseAnalyticsRange(searchParams.get('range'));
  const limit = parseBoundedInteger(searchParams.get('limit'), {
    defaultValue: 10,
    min: 1,
    max: 50,
  });
  const pathFilter = normalizePathFilter(searchParams.get('path'));
  const sort = searchParams.get('sort') || 'pv';
  const order = searchParams.get('order') || 'desc';
  const orderBy = ORDER_BY[`${sort}:${order}`];
  if (!range) {
    return json({ error: 'range must be today, 7d, month, or all' }, { status: 400 });
  }
  if (limit === null) return json({ error: 'limit must be an integer between 1 and 50' }, { status: 400 });
  if (pathFilter === null) {
    return json({ error: 'path must contain only letters, numbers, slashes, and hyphens' }, { status: 400 });
  }
  if (!orderBy) {
    return json({ error: 'sort and order must be supported values' }, { status: 400 });
  }

  try {
    const rangeClause = analyticsRangeClause(range);
    const pathClause = pathFilter ? ` AND page LIKE ? ESCAPE '\\'` : '';
    const whereClause = `WHERE 1 = 1${rangeClause}${pathClause}`;
    const pathBinding = pathFilter ? `%${escapeLikePattern(pathFilter)}%` : null;

    const statement = env.DB.prepare(
      `SELECT page, count(*) AS pv, count(DISTINCT visitor_id) AS uv
       FROM pageviews
       ${whereClause}
       GROUP BY page
       ORDER BY ${orderBy}
       LIMIT ?`
    );
    const bindings = pathBinding ? [pathBinding, limit] : [limit];
    const result = await statement.bind(...bindings).all();

    return json({
      range,
      rows: mapRows(result),
    });
  } catch (error) {
    console.error('analytics popular pages failed', error);
    return json({ error: 'analytics service unavailable' }, { status: 500 });
  }
}
