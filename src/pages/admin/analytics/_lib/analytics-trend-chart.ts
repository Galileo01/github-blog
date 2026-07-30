import {
  createAreaPath,
  createChartModel,
  createLinePath,
  type AnalyticsChartPoint,
  type AnalyticsTrendRow,
} from './analytics-dashboard.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

type SvgAttributeValue = string | number;

export interface AnalyticsTrendChartController {
  render: (response: AnalyticsTrendResponse) => void;
  showError: (options?: { preserveChart?: boolean }) => void;
  destroy: () => void;
}

export interface AnalyticsTrendResponse {
  range: 'today' | '7d' | 'month' | 'all';
  granularity: 'hour' | 'day' | 'week' | 'month';
  rows: AnalyticsTrendRow[];
}

const RANGE_TITLES = {
  today: '今日趋势',
  '7d': '最近 7 天趋势',
  month: '本月趋势',
  all: '全部趋势',
} as const;

const GRANULARITY_LABELS = {
  hour: '按小时',
  day: '按日',
  week: '按周',
  month: '按月',
} as const;

function setText(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function svgElement(
  name: string,
  attributes: Record<string, SvgAttributeValue> = {}
): SVGElement {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function createAnalyticsTrendChart(): AnalyticsTrendChartController | null {
  const container = document.getElementById('trend-chart-container');
  const svg = document.getElementById('trend-chart');
  if (!(container instanceof HTMLElement) || !(svg instanceof SVGElement)) return null;

  let currentResponse: AnalyticsTrendResponse | null = null;

  function showTooltip(point: AnalyticsChartPoint, line: SVGElement): void {
    const tooltip = document.getElementById('trend-tooltip');
    if (!(tooltip instanceof HTMLElement)) return;

    setText('trend-tooltip-day', point.day);
    setText('trend-tooltip-pv', `${point.pv} PV`);
    setText('trend-tooltip-uv', `${point.uv} UV`);
    tooltip.classList.remove('hidden');

    const halfWidth = Math.max(64, tooltip.offsetWidth / 2);
    const left = Math.min(
      container.clientWidth - halfWidth,
      Math.max(halfWidth, point.x)
    );
    tooltip.style.left = `${left}px`;
    line.removeAttribute('display');
    line.setAttribute('x1', String(point.x));
    line.setAttribute('x2', String(point.x));
  }

  function hideTooltip(line: SVGElement): void {
    document.getElementById('trend-tooltip')?.classList.add('hidden');
    line.setAttribute('display', 'none');
  }

  function render(response: AnalyticsTrendResponse): void {
    currentResponse = response;
    const rows = response.rows;
    const card = document.getElementById('trend-card');
    const error = document.getElementById('trend-error');
    const summary = document.getElementById('trend-summary');

    error?.classList.add('hidden');
    card?.classList.remove('hidden');

    const heading = RANGE_TITLES[response.range];
    setText('trend-heading', heading);
    setText('trend-caption', `按北京时间 · ${GRANULARITY_LABELS[response.granularity]}`);

    const model = createChartModel(rows, container.clientWidth);
    svg.setAttribute('viewBox', `0 0 ${model.width} ${model.height}`);
    svg.replaceChildren();

    const title = svgElement('title', { id: 'trend-chart-title' });
    title.textContent = `${heading}：PV 和 UV`;
    const description = svgElement('desc', { id: 'trend-chart-description' });
    description.textContent = '使用 Tab 键聚焦各日期数据点以查看精确数值。';
    svg.append(title, description);

    const defs = svgElement('defs');
    for (const [id, color] of [
      ['pv-area', 'var(--analytics-pv)'],
      ['uv-area', 'var(--analytics-uv)'],
    ]) {
      const gradient = svgElement('linearGradient', {
        id,
        x1: '0',
        x2: '0',
        y1: '0',
        y2: '1',
      });
      gradient.append(
        svgElement('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.16' }),
        svgElement('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' })
      );
      defs.append(gradient);
    }
    svg.append(defs);

    for (const tick of model.scale.ticks) {
      const y = model.padding.top + model.plotHeight
        - ((tick / model.scale.max) * model.plotHeight);
      const grid = svgElement('line', {
        x1: model.padding.left,
        x2: model.width - model.padding.right,
        y1: y,
        y2: y,
        stroke: 'var(--border)',
        'stroke-width': 1,
      });
      const label = svgElement('text', {
        x: model.padding.left - 8,
        y: y + 4,
        fill: 'var(--muted-foreground)',
        'font-size': 11,
        'text-anchor': 'end',
      });
      label.textContent = String(tick);
      svg.append(grid, label);
    }

    const maxLabels = Math.max(4, Math.floor(model.plotWidth / 72));
    const labelStep = Math.max(1, Math.ceil(model.points.length / maxLabels));
    for (const [index, point] of model.points.entries()) {
      if (index !== 0 && index !== model.points.length - 1 && index % labelStep !== 0) {
        continue;
      }
      const label = svgElement('text', {
        x: point.x,
        y: model.height - 12,
        fill: 'var(--muted-foreground)',
        'font-size': 11,
        'text-anchor': 'middle',
      });
      label.textContent = point.label;
      svg.append(label);
    }

    for (const [key, gradient] of [
      ['pvY', 'pv-area'],
      ['uvY', 'uv-area'],
    ] as const) {
      svg.append(svgElement('path', {
        d: createAreaPath(model.points, key, model.bottom),
        fill: `url(#${gradient})`,
      }));
    }

    svg.append(
      svgElement('path', {
        d: createLinePath(model.points, 'pvY'),
        fill: 'none',
        stroke: 'var(--analytics-pv)',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': 2.5,
        'vector-effect': 'non-scaling-stroke',
      }),
      svgElement('path', {
        d: createLinePath(model.points, 'uvY'),
        fill: 'none',
        stroke: 'var(--analytics-uv)',
        'stroke-dasharray': '6 5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': 2.5,
        'vector-effect': 'non-scaling-stroke',
      })
    );

    const highlight = svgElement('line', {
      y1: model.padding.top,
      y2: model.bottom,
      stroke: 'var(--muted-foreground)',
      'stroke-dasharray': '3 4',
      'stroke-opacity': '0.55',
      display: 'none',
    });
    svg.append(highlight);

    const hitWidth = model.points.length > 1
      ? model.plotWidth / (model.points.length - 1)
      : model.plotWidth;

    for (const point of model.points) {
      const pvPoint = svgElement('circle', {
        cx: point.x,
        cy: point.pvY,
        r: 4,
        fill: 'var(--card)',
        stroke: 'var(--analytics-pv)',
        'stroke-width': 2.5,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      });
      const uvPoint = svgElement('rect', {
        x: point.x - 3.5,
        y: point.uvY - 3.5,
        width: 7,
        height: 7,
        rx: 1,
        fill: 'var(--card)',
        stroke: 'var(--analytics-uv)',
        'stroke-width': 2,
        transform: `rotate(45 ${point.x} ${point.uvY})`,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
      });
      const hitArea = svgElement('rect', {
        x: Math.max(model.padding.left, point.x - (hitWidth / 2)),
        y: model.padding.top,
        width: Math.min(
          hitWidth,
          model.width - model.padding.right - point.x + (hitWidth / 2)
        ),
        height: model.plotHeight,
        fill: 'transparent',
        tabindex: 0,
        role: 'button',
        class: 'analytics-trend-hit-area',
        'aria-label': `${point.day}，PV ${point.pv}，UV ${point.uv}`,
      });
      const pvFocusRing = svgElement('circle', {
        cx: point.x,
        cy: point.pvY,
        r: 7,
        fill: 'none',
        stroke: 'var(--ring)',
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
        display: 'none',
      });
      const uvFocusRing = svgElement('circle', {
        cx: point.x,
        cy: point.uvY,
        r: 7,
        fill: 'none',
        stroke: 'var(--ring)',
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke',
        'pointer-events': 'none',
        display: 'none',
      });
      hitArea.addEventListener('mouseenter', () => showTooltip(point, highlight));
      hitArea.addEventListener('mouseleave', () => hideTooltip(highlight));
      hitArea.addEventListener('focus', () => {
        showTooltip(point, highlight);
        pvFocusRing.removeAttribute('display');
        uvFocusRing.removeAttribute('display');
      });
      hitArea.addEventListener('blur', () => {
        hideTooltip(highlight);
        pvFocusRing.setAttribute('display', 'none');
        uvFocusRing.setAttribute('display', 'none');
      });
      svg.append(pvPoint, uvPoint, pvFocusRing, uvFocusRing, hitArea);
    }

    if (summary) {
      summary.textContent = rows
        .map((row) => `${row.day}：PV ${row.pv}，UV ${row.uv}`)
        .join('；');
    }
  }

  function showError({ preserveChart = false } = {}): void {
    const error = document.getElementById('trend-error');
    if (!preserveChart) document.getElementById('trend-card')?.classList.add('hidden');
    if (error) {
      error.textContent = preserveChart
        ? '趋势数据刷新失败，当前保留上次结果。'
        : '趋势数据加载失败，请稍后刷新页面重试。';
      error.classList.remove('hidden');
    }
  }

  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => {
        if (currentResponse?.rows.length) render(currentResponse);
      })
    : null;
  resizeObserver?.observe(container);

  return {
    render,
    showError,
    destroy: () => resizeObserver?.disconnect(),
  };
}
