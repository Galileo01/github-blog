import { numberValue } from '../../../_shared/analytics.js';
import {
  analyticsRangeClause,
  parseAnalyticsRange,
} from '../../../_shared/analytics-range.js';
import { json, methodNotAllowed } from '../../../_shared/http.js';

const ORDER_BY = {
  pv: 'pv DESC, uv DESC, page ASC',
  uv: 'uv DESC, pv DESC, page ASC',
};

function mapRows(result) {
  return (result.results || []).map((row) => ({
    page: String(row.page),
    pv: numberValue(row.pv),
    uv: numberValue(row.uv),
  }));
}

function distributionQuery({ dimension, metric, orderBy, rangeClause }) {
  if (dimension === 'section') {
    return `WITH section_totals AS (
      SELECT
        CASE
          WHEN page = '/' THEN '首页（/）'
          WHEN page = '/blog' THEN '博客列表（/blog）'
          WHEN page LIKE '/blog/%' THEN '博客（/blog/*）'
          WHEN page = '/projects' THEN '项目（/projects）'
          ELSE '其他（未归类）'
        END AS page,
        count(*) AS pv,
        count(DISTINCT visitor_id) AS uv
      FROM pageviews
      WHERE 1 = 1${rangeClause}
      GROUP BY 1
    )
    SELECT
      page,
      pv,
      uv,
      (SELECT sum(${metric}) FROM section_totals) AS metric_total,
      (SELECT count(*) FROM section_totals) AS item_count
    FROM section_totals
    ORDER BY ${orderBy}`;
  }

  return `WITH article_totals AS (
    SELECT page, count(*) AS pv, count(DISTINCT visitor_id) AS uv
    FROM pageviews
    WHERE page LIKE '/blog/%'${rangeClause}
    GROUP BY page
  )
  SELECT
    page,
    pv,
    uv,
    (SELECT sum(${metric}) FROM article_totals) AS metric_total,
    (SELECT count(*) FROM article_totals) AS item_count
  FROM article_totals
  ORDER BY ${orderBy}
  LIMIT 8`;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, { status: 500 });

  const searchParams = new URL(request.url).searchParams;
  const range = parseAnalyticsRange(searchParams.get('range'));
  const metric = searchParams.get('metric') || 'pv';
  const dimension = searchParams.get('dimension') || 'section';
  const orderBy = ORDER_BY[metric];
  if (!range) {
    return json({ error: 'range must be today, 7d, month, or all' }, { status: 400 });
  }
  if (!orderBy) {
    return json({ error: 'metric must be pv or uv' }, { status: 400 });
  }
  if (dimension !== 'section' && dimension !== 'article') {
    return json({ error: 'dimension must be section or article' }, { status: 400 });
  }

  try {
    const rangeClause = analyticsRangeClause(range);
    const result = await env.DB.prepare(distributionQuery({
      dimension,
      metric,
      orderBy,
      rangeClause,
    })).all();
    const metadata = result.results?.[0] || {};

    return json({
      range,
      metric,
      dimension,
      total: numberValue(metadata.metric_total),
      totalItems: numberValue(metadata.item_count),
      rows: mapRows(result),
    });
  } catch (error) {
    console.error('analytics distribution failed', error);
    return json({ error: 'analytics service unavailable' }, { status: 500 });
  }
}
