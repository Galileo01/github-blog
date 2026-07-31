const DEFAULT_HEIGHT = 280;
const CHART_PADDING = {
  top: 24,
  right: 20,
  bottom: 40,
  left: 44,
};

export interface AnalyticsTrendRow {
  day: string;
  pv: number;
  uv: number;
}

export interface AnalyticsChartPoint extends AnalyticsTrendRow {
  x: number;
  pvY: number;
  uvY: number;
  label: string;
}

export interface AnalyticsChartModel {
  width: number;
  height: number;
  padding: typeof CHART_PADDING;
  plotWidth: number;
  plotHeight: number;
  bottom: number;
  scale: {
    max: number;
    ticks: number[];
  };
  points: AnalyticsChartPoint[];
}

export interface AnalyticsPopularRow {
  page: string;
  pv: number;
  uv: number;
}

export interface AnalyticsDonutSlice {
  label: string;
  value: number;
  percentage: number;
}

type SeriesYKey = 'pvY' | 'uvY';
export type AnalyticsMetric = 'pv' | 'uv';

function niceStep(maxValue: number, tickCount: number): number {
  if (maxValue <= 0) return 1;
  const roughStep = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1
    ? 1
    : normalized <= 2
      ? 2
      : normalized <= 2.5
        ? 2.5
        : normalized <= 5
          ? 5
          : 10;
  return multiplier * magnitude;
}

function formatTrendLabel(value: string): string {
  if (/^\d{2}:00$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  return value.slice(5);
}

export function createChartScale(rows: AnalyticsTrendRow[], tickCount = 4) {
  const maxValue = Math.max(0, ...rows.flatMap((row) => [Number(row.pv) || 0, Number(row.uv) || 0]));
  if (maxValue === 0) {
    return {
      max: tickCount,
      ticks: Array.from({ length: tickCount + 1 }, (_, index) => tickCount - index),
    };
  }
  const step = niceStep(maxValue, tickCount);
  const max = Math.ceil(maxValue / step) * step;
  const intervals = Math.round(max / step);
  return {
    max,
    ticks: Array.from({ length: intervals + 1 }, (_, index) => max - (step * index)),
  };
}

export function createChartModel(
  rows: AnalyticsTrendRow[],
  width: number,
  height = DEFAULT_HEIGHT
): AnalyticsChartModel {
  const safeWidth = Math.max(320, Math.round(Number(width) || 0));
  const safeHeight = Math.max(220, Math.round(Number(height) || DEFAULT_HEIGHT));
  const plotWidth = safeWidth - CHART_PADDING.left - CHART_PADDING.right;
  const plotHeight = safeHeight - CHART_PADDING.top - CHART_PADDING.bottom;
  const scale = createChartScale(rows);
  const bottom = CHART_PADDING.top + plotHeight;

  const points = rows.map((row, index) => {
    const x = rows.length <= 1
      ? CHART_PADDING.left + (plotWidth / 2)
      : CHART_PADDING.left + ((plotWidth * index) / (rows.length - 1));
    const yFor = (value: number) => CHART_PADDING.top + plotHeight
      - ((Math.max(0, Number(value) || 0) / scale.max) * plotHeight);

    return {
      ...row,
      x,
      pvY: yFor(row.pv),
      uvY: yFor(row.uv),
      label: formatTrendLabel(String(row.day)),
    };
  });

  return {
    width: safeWidth,
    height: safeHeight,
    padding: CHART_PADDING,
    plotWidth,
    plotHeight,
    bottom,
    scale,
    points,
  };
}

export function createLinePath(points: AnalyticsChartPoint[], key: SeriesYKey): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point[key]}`)
    .join(' ');
}

export function createAreaPath(
  points: AnalyticsChartPoint[],
  key: SeriesYKey,
  bottom: number
): string {
  if (points.length === 0) return '';
  const line = createLinePath(points, key);
  return `${line} L ${points.at(-1).x} ${bottom} L ${points[0].x} ${bottom} Z`;
}

export function createDonutSlices(
  rows: AnalyticsPopularRow[],
  total: number,
  metric: AnalyticsMetric,
  maxPages = 5
): AnalyticsDonutSlice[] {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (safeTotal === 0) return [];

  const pages = rows
    .map((row) => ({
      label: String(row.page),
      value: Math.max(0, Number(row[metric]) || 0),
    }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
    .slice(0, Math.max(1, maxPages));

  const visibleTotal = pages.reduce((sum, row) => sum + row.value, 0);
  const other = Math.max(0, safeTotal - visibleTotal);
  const slices = other > 0
    ? [...pages, { label: '其他', value: other }]
    : pages;

  return slices.map((slice) => ({
    ...slice,
    percentage: (slice.value / safeTotal) * 100,
  }));
}
