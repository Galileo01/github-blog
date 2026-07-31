export const ANALYTICS_RANGE_START = {
  today: `datetime(date('now', '+8 hours'), '-8 hours')`,
  '7d': `datetime(date('now', '+8 hours', '-6 days'), '-8 hours')`,
  month: `datetime(date('now', '+8 hours', 'start of month'), '-8 hours')`,
  all: null,
};

export function parseAnalyticsRange(value) {
  const range = value || '7d';
  return Object.hasOwn(ANALYTICS_RANGE_START, range) ? range : null;
}

export function analyticsRangeClause(range, column = 'created_at') {
  const start = ANALYTICS_RANGE_START[range];
  return start ? ` AND ${column} >= ${start}` : '';
}
