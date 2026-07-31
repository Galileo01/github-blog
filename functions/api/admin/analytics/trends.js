import { numberValue } from '../../../_shared/analytics.js';
import { parseAnalyticsRange } from '../../../_shared/analytics-range.js';
import { json, methodNotAllowed } from '../../../_shared/http.js';

const DAY_MILLISECONDS = 86_400_000;

function mapRows(result) {
  return (result.results || []).map((row) => ({
    day: String(row.day),
    pv: numberValue(row.pv),
    uv: numberValue(row.uv),
  }));
}

function daySpan(firstDay, lastDay) {
  if (!firstDay || !lastDay) return 0;
  const first = Date.parse(`${firstDay}T00:00:00Z`);
  const last = Date.parse(`${lastDay}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.floor((last - first) / DAY_MILLISECONDS) + 1;
}

async function allTimeBounds(db) {
  return db.prepare(
    `SELECT
       min(date(created_at, '+8 hours')) AS first_day,
       date('now', '+8 hours') AS today
     FROM pageviews`
  ).first();
}

async function queryHourly(db) {
  return db.prepare(
    `WITH RECURSIVE hours(hour) AS (
       SELECT 0
       UNION ALL
       SELECT hour + 1 FROM hours WHERE hour < 23
     )
     SELECT
       printf('%02d:00', hours.hour) AS day,
       count(pageviews.id) AS pv,
       count(DISTINCT pageviews.visitor_id) AS uv
     FROM hours
     LEFT JOIN pageviews
       ON pageviews.created_at >= datetime(
         date('now', '+8 hours'),
         printf('+%d hours', hours.hour),
         '-8 hours'
       )
      AND pageviews.created_at < datetime(
         date('now', '+8 hours'),
         printf('+%d hours', hours.hour + 1),
         '-8 hours'
       )
     GROUP BY hours.hour
     ORDER BY hours.hour`
  ).all();
}

async function queryDaily(db, startExpression, bindings = []) {
  const statement = db.prepare(
    `WITH RECURSIVE dates(day) AS (
       SELECT ${startExpression}
       UNION ALL
       SELECT date(day, '+1 day') FROM dates
       WHERE day < date('now', '+8 hours')
     )
     SELECT
       dates.day AS day,
       count(pageviews.id) AS pv,
       count(DISTINCT pageviews.visitor_id) AS uv
     FROM dates
     LEFT JOIN pageviews
       ON pageviews.created_at >= datetime(dates.day, '-8 hours')
      AND pageviews.created_at < datetime(dates.day, '+1 day', '-8 hours')
     GROUP BY dates.day
     ORDER BY dates.day`
  );
  return bindings.length > 0
    ? statement.bind(...bindings).all()
    : statement.all();
}

async function queryWeekly(db, firstDay) {
  return db.prepare(
    `WITH RECURSIVE weeks(day) AS (
       SELECT date(?)
       UNION ALL
       SELECT date(day, '+7 days') FROM weeks
       WHERE date(day, '+7 days') <= date('now', '+8 hours')
     )
     SELECT
       weeks.day AS day,
       count(pageviews.id) AS pv,
       count(DISTINCT pageviews.visitor_id) AS uv
     FROM weeks
     LEFT JOIN pageviews
       ON pageviews.created_at >= datetime(weeks.day, '-8 hours')
      AND pageviews.created_at < datetime(weeks.day, '+7 days', '-8 hours')
     GROUP BY weeks.day
     ORDER BY weeks.day`
  ).bind(firstDay).all();
}

async function queryMonthly(db, firstDay) {
  return db.prepare(
    `WITH RECURSIVE months(month) AS (
       SELECT date(?, 'start of month')
       UNION ALL
       SELECT date(month, '+1 month') FROM months
       WHERE date(month, '+1 month') <= date('now', '+8 hours', 'start of month')
     )
     SELECT
       strftime('%Y-%m', months.month) AS day,
       count(pageviews.id) AS pv,
       count(DISTINCT pageviews.visitor_id) AS uv
     FROM months
     LEFT JOIN pageviews
       ON pageviews.created_at >= datetime(months.month, '-8 hours')
      AND pageviews.created_at < datetime(months.month, '+1 month', '-8 hours')
     GROUP BY months.month
     ORDER BY months.month`
  ).bind(firstDay).all();
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured' }, { status: 500 });

  const range = parseAnalyticsRange(new URL(request.url).searchParams.get('range'));
  if (!range) {
    return json({ error: 'range must be today, 7d, month, or all' }, { status: 400 });
  }

  try {
    let granularity = 'day';
    let result;

    if (range === 'today') {
      granularity = 'hour';
      result = await queryHourly(env.DB);
    } else if (range === '7d') {
      result = await queryDaily(env.DB, `date('now', '+8 hours', '-6 days')`);
    } else if (range === 'month') {
      result = await queryDaily(env.DB, `date('now', '+8 hours', 'start of month')`);
    } else {
      const bounds = await allTimeBounds(env.DB);
      const firstDay = bounds?.first_day || bounds?.today;
      const span = daySpan(firstDay, bounds?.today);
      if (span <= 31) {
        result = await queryDaily(env.DB, 'date(?)', [firstDay]);
      } else if (span <= 180) {
        granularity = 'week';
        result = await queryWeekly(env.DB, firstDay);
      } else {
        granularity = 'month';
        result = await queryMonthly(env.DB, firstDay);
      }
    }

    return json({
      range,
      granularity,
      rows: mapRows(result),
    });
  } catch (error) {
    console.error('analytics trends failed', error);
    return json({ error: 'analytics service unavailable' }, { status: 500 });
  }
}
