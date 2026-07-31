import {
  createDonutSlices,
  type AnalyticsMetric,
  type AnalyticsPopularRow,
} from './analytics-dashboard.ts';
import {
  ANALYTICS_RANGE_LABELS,
  type AnalyticsRange,
} from './analytics-range.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DONUT_RADIUS = 72;
const DONUT_STROKE_WIDTH = 28;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const SLICE_COLORS = [
  'var(--analytics-share-1)',
  'var(--analytics-share-2)',
  'var(--analytics-share-3)',
  'var(--analytics-share-4)',
  'var(--analytics-share-5)',
  'var(--analytics-share-6)',
  'var(--analytics-share-7)',
  'var(--analytics-share-8)',
];
const OTHER_SLICE_COLOR = 'var(--analytics-share-other)';

interface DistributionResponse {
  range: AnalyticsRange;
  metric: AnalyticsMetric;
  dimension: DistributionDimension;
  total: number;
  totalItems: number;
  rows: AnalyticsPopularRow[];
}

type DistributionDimension = 'section' | 'article';

const DIMENSION_LABELS = {
  section: '页面大类',
  article: '博客文章',
} as const;

interface CreateDistributionOptions {
  fetchAdmin: (path: string, init?: RequestInit) => Promise<unknown>;
  onUnauthorized: () => void;
}

export interface AnalyticsDistributionController {
  load: (options: { range: AnalyticsRange; preserveChart?: boolean }) => Promise<void>;
  abort: () => void;
}

function setText(id: string, value: string | number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function updateMetricControls(metric: AnalyticsMetric): void {
  for (const button of document.querySelectorAll('[data-distribution-metric]')) {
    const active = button.getAttribute('data-distribution-metric') === metric;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('bg-background', active);
    button.classList.toggle('font-medium', active);
    button.classList.toggle('text-foreground', active);
    button.classList.toggle('shadow-sm', active);
    button.classList.toggle('text-muted-foreground', !active);
  }
}

function updateDimensionControls(dimension: DistributionDimension): void {
  for (const button of document.querySelectorAll('[data-distribution-dimension]')) {
    const active = button.getAttribute('data-distribution-dimension') === dimension;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('bg-background', active);
    button.classList.toggle('font-medium', active);
    button.classList.toggle('text-foreground', active);
    button.classList.toggle('shadow-sm', active);
    button.classList.toggle('text-muted-foreground', !active);
  }
}

function renderDonut(response: DistributionResponse): void {
  const slicesRoot = document.getElementById('distribution-slices');
  const legend = document.getElementById('distribution-legend');
  const content = document.getElementById('distribution-content');
  const empty = document.getElementById('distribution-empty');
  const summary = document.getElementById('distribution-summary');
  if (!(slicesRoot instanceof SVGElement) || !legend) return;

  const total = Math.max(0, Number(response.total) || 0);
  const remainingItems = Math.max(0, response.totalItems - response.rows.length);
  const slices = createDonutSlices(
    response.rows,
    total,
    response.metric,
    Math.max(1, response.rows.length)
  ).map((slice) => (
    response.dimension === 'article' && slice.label === '其他'
      ? { ...slice, label: `其他文章（${remainingItems} 篇）` }
      : slice
  ));
  const metricLabel = response.metric.toUpperCase();
  setText(
    'distribution-caption',
    `${ANALYTICS_RANGE_LABELS[response.range]} · ${DIMENSION_LABELS[response.dimension]} · 按 ${metricLabel} 查看`
  );
  setText(
    'distribution-card-heading',
    response.dimension === 'section' ? '页面大类分布' : '博客文章分布'
  );
  setText('distribution-metric', `${metricLabel} 页面合计`);
  setText('distribution-total', total);
  slicesRoot.replaceChildren();
  legend.replaceChildren();

  const isEmpty = slices.length === 0;
  content?.classList.toggle('hidden', isEmpty);
  empty?.classList.toggle('hidden', !isEmpty);
  if (isEmpty) {
    if (summary) summary.textContent = '当前时间范围内暂无占比数据';
    return;
  }

  let offset = 0;
  slices.forEach((slice, index) => {
    const color = slice.label.startsWith('其他')
      ? OTHER_SLICE_COLOR
      : SLICE_COLORS[index % SLICE_COLORS.length];
    const length = DONUT_CIRCUMFERENCE * (slice.percentage / 100);
    const circle = document.createElementNS(SVG_NS, 'circle');
    for (const [name, value] of Object.entries({
      cx: 110,
      cy: 110,
      r: DONUT_RADIUS,
      fill: 'none',
      stroke: color,
      'stroke-width': DONUT_STROKE_WIDTH,
      'stroke-dasharray': `${length} ${DONUT_CIRCUMFERENCE - length}`,
      'stroke-dashoffset': -offset,
      transform: 'rotate(-90 110 110)',
      tabindex: 0,
      role: 'img',
      class: 'analytics-distribution-slice',
      'aria-label': `${slice.label}，${slice.value} ${metricLabel}，占 ${slice.percentage.toFixed(1)}%`,
    })) {
      circle.setAttribute(name, String(value));
    }
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${slice.label}：${slice.value} ${metricLabel}（${slice.percentage.toFixed(1)}%）`;
    circle.append(title);
    const emphasize = () => circle.setAttribute('stroke-width', '34');
    const normalize = () => circle.setAttribute('stroke-width', String(DONUT_STROKE_WIDTH));
    circle.addEventListener('mouseenter', emphasize);
    circle.addEventListener('mouseleave', normalize);
    circle.addEventListener('focus', emphasize);
    circle.addEventListener('blur', normalize);
    slicesRoot.append(circle);
    offset += length;

    const item = document.createElement('li');
    item.className = 'flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5';
    const swatch = document.createElement('span');
    swatch.className = 'mt-1 h-2.5 w-2.5 shrink-0 rounded-full';
    swatch.style.background = color;
    const copy = document.createElement('span');
    copy.className = 'min-w-0';
    const label = document.createElement('span');
    label.className = 'block truncate font-medium';
    label.textContent = slice.label;
    const value = document.createElement('span');
    value.className = 'block text-xs text-muted-foreground';
    value.textContent = `${slice.value} ${metricLabel} · ${slice.percentage.toFixed(1)}%`;
    copy.append(label, value);
    item.append(swatch, copy);
    legend.append(item);
  });

  if (summary) {
    summary.textContent = slices
      .map((slice) => `${slice.label}：${slice.value} ${metricLabel}，占 ${slice.percentage.toFixed(1)}%`)
      .join('；');
  }
}

export function createAnalyticsDistribution({
  fetchAdmin,
  onUnauthorized,
}: CreateDistributionOptions): AnalyticsDistributionController | null {
  const root = document.getElementById('analytics-distribution');
  const errorBox = document.getElementById('distribution-error');
  const retry = document.getElementById('distribution-retry');
  if (!root) return null;

  let metric: AnalyticsMetric = 'pv';
  let dimension: DistributionDimension = 'section';
  let currentRange: AnalyticsRange = '7d';
  let abortController: AbortController | undefined;

  async function load({
    range,
    preserveChart = false,
  }: {
    range: AnalyticsRange;
    preserveChart?: boolean;
  }): Promise<void> {
    currentRange = range;
    errorBox?.classList.add('hidden');
    errorBox?.classList.remove('flex');
    if (!preserveChart) setText('distribution-total', '—');

    abortController?.abort();
    abortController = new AbortController();
    const params = new URLSearchParams({ range, metric, dimension });

    try {
      const response = await fetchAdmin(`/api/admin/analytics/distribution?${params}`, {
        signal: abortController.signal,
      }) as DistributionResponse;
      renderDonut(response);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof Error && error.message === 'unauthorized') {
        onUnauthorized();
        return;
      }
      if (!preserveChart) {
        document.getElementById('distribution-content')?.classList.add('hidden');
      }
      errorBox?.classList.remove('hidden');
      errorBox?.classList.add('flex');
    }
  }

  for (const button of document.querySelectorAll('[data-distribution-metric]')) {
    button.addEventListener('click', () => {
      const nextMetric = button.getAttribute('data-distribution-metric');
      if ((nextMetric !== 'pv' && nextMetric !== 'uv') || nextMetric === metric) return;
      metric = nextMetric;
      updateMetricControls(metric);
      void load({ range: currentRange, preserveChart: true });
    });
  }

  for (const button of document.querySelectorAll('[data-distribution-dimension]')) {
    button.addEventListener('click', () => {
      const nextDimension = button.getAttribute('data-distribution-dimension');
      if (
        (nextDimension !== 'section' && nextDimension !== 'article')
        || nextDimension === dimension
      ) {
        return;
      }
      dimension = nextDimension;
      updateDimensionControls(dimension);
      void load({ range: currentRange, preserveChart: true });
    });
  }

  retry?.addEventListener('click', () => {
    void load({ range: currentRange, preserveChart: true });
  });
  updateMetricControls(metric);
  updateDimensionControls(dimension);

  return {
    load,
    abort: () => abortController?.abort(),
  };
}
