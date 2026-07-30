export const ANALYTICS_RANGE_LABELS = {
  today: '今日',
  '7d': '最近 7 天',
  month: '本月',
  all: '所有时间',
} as const;

export type AnalyticsRange = keyof typeof ANALYTICS_RANGE_LABELS;

export function parseAnalyticsRange(value: string | null): AnalyticsRange {
  return value && Object.hasOwn(ANALYTICS_RANGE_LABELS, value)
    ? value as AnalyticsRange
    : '7d';
}
