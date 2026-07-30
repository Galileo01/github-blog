import type {
  AnalyticsMetric,
  AnalyticsPopularRow,
} from './analytics-dashboard.ts';
import {
  ANALYTICS_RANGE_LABELS,
  type AnalyticsRange,
} from './analytics-range.ts';

type SortOrder = 'asc' | 'desc';

interface PopularResponse {
  range: AnalyticsRange;
  rows: AnalyticsPopularRow[];
}

interface PopularState {
  range: AnalyticsRange;
  path: string;
  sort: AnalyticsMetric;
  order: SortOrder;
}

interface CreatePopularTableOptions {
  fetchAdmin: (path: string, init?: RequestInit) => Promise<unknown>;
  onUnauthorized: () => void;
}

export interface AnalyticsPopularTableController {
  load: (options: { range: AnalyticsRange; preserveRows?: boolean }) => Promise<void>;
  abort: () => void;
}

function setText(id: string, value: string | number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function normalizeClientPath(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 200 || (normalized && !/^[a-z0-9/-]+$/.test(normalized))) {
    return null;
  }
  return normalized;
}

function appendCell(row: HTMLTableRowElement, text: string | number): void {
  const cell = document.createElement('td');
  cell.className = 'px-4 py-3 tabular-nums';
  cell.textContent = String(text);
  row.append(cell);
}

function renderTableMessage(message: string): void {
  const list = document.getElementById('popular-list');
  if (!list) return;
  list.replaceChildren();
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.className = 'px-4 py-5 text-muted-foreground';
  cell.colSpan = 3;
  cell.textContent = message;
  row.append(cell);
  list.append(row);
}

function renderTable(rows: AnalyticsPopularRow[], state: PopularState): void {
  const list = document.getElementById('popular-list');
  if (!list) return;
  list.replaceChildren();

  if (rows.length === 0) {
    renderTableMessage(state.path ? `没有匹配“${state.path}”的页面` : '暂无访问数据');
    return;
  }

  for (const item of rows) {
    const row = document.createElement('tr');
    row.className = 'border-b last:border-0';
    const pageCell = document.createElement('td');
    pageCell.className = 'px-4 py-3';
    const link = document.createElement('a');
    link.className = 'inline-flex min-h-8 items-center rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring';
    link.href = item.page;
    link.title = '打开对应页面';
    link.textContent = item.page;
    pageCell.append(link);
    row.append(pageCell);
    appendCell(row, item.pv);
    appendCell(row, item.uv);
    list.append(row);
  }
}

function updateSortControls(state: PopularState): void {
  for (const metric of ['pv', 'uv'] as const) {
    const header = document.getElementById(`popular-${metric}-header`);
    const button = document.querySelector(`[data-popular-sort="${metric}"]`);
    const active = state.sort === metric;
    header?.setAttribute(
      'aria-sort',
      active ? (state.order === 'asc' ? 'ascending' : 'descending') : 'none'
    );
    button?.classList.toggle('text-foreground', active);
    for (const icon of button?.querySelectorAll('[data-sort-icon]') || []) {
      const iconState = icon.getAttribute('data-sort-icon');
      icon.classList.toggle(
        'hidden',
        active ? iconState !== state.order : iconState !== 'neutral'
      );
    }
  }
}

function updateSummary(state: PopularState, rowCount?: number): void {
  const parts = [
    ANALYTICS_RANGE_LABELS[state.range],
    state.path ? `Path 包含“${state.path}”` : '',
    rowCount === undefined ? '' : `${rowCount} 个页面`,
    `按 ${state.sort.toUpperCase()} ${state.order === 'desc' ? '降序' : '升序'}`,
  ].filter(Boolean);
  setText('popular-summary', parts.join(' · '));
}

export function createAnalyticsPopularTable({
  fetchAdmin,
  onUnauthorized,
}: CreatePopularTableOptions): AnalyticsPopularTableController | null {
  const root = document.getElementById('analytics-popular-table');
  const pathInput = document.getElementById('popular-path-filter');
  const pathClear = document.getElementById('popular-path-clear');
  const pathError = document.getElementById('popular-path-error');
  const popularError = document.getElementById('popular-error');
  const retry = document.getElementById('popular-retry');
  if (!root || !(pathInput instanceof HTMLInputElement)) return null;

  const state: PopularState = {
    range: '7d',
    path: '',
    sort: 'pv',
    order: 'desc',
  };
  let abortController: AbortController | undefined;
  let debounceTimer: number | undefined;

  async function load({
    range,
    preserveRows = false,
  }: {
    range: AnalyticsRange;
    preserveRows?: boolean;
  }): Promise<void> {
    state.range = range;
    const inputValue = pathInput.value;
    const normalizedPath = normalizeClientPath(inputValue);
    if (normalizedPath === null) {
      pathInput.setAttribute('aria-invalid', 'true');
      if (pathError) {
        pathError.textContent = '只能输入字母、数字、斜杠和连字符';
        pathError.classList.remove('hidden');
      }
      return;
    }

    pathInput.removeAttribute('aria-invalid');
    pathError?.classList.add('hidden');
    state.path = normalizedPath;
    pathClear?.classList.toggle('hidden', !inputValue);
    popularError?.classList.add('hidden');
    popularError?.classList.remove('flex');
    if (!preserveRows) renderTableMessage('正在加载…');
    if (!preserveRows) updateSummary(state);

    abortController?.abort();
    abortController = new AbortController();
    const params = new URLSearchParams({
      range: state.range,
      limit: '20',
      sort: state.sort,
      order: state.order,
    });
    if (normalizedPath) params.set('path', normalizedPath);

    try {
      const response = await fetchAdmin(`/api/admin/analytics/popular?${params}`, {
        signal: abortController.signal,
      }) as PopularResponse;
      renderTable(response.rows, state);
      updateSummary(state, response.rows.length);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof Error && error.message === 'unauthorized') {
        onUnauthorized();
        return;
      }
      if (!preserveRows) renderTableMessage('当前数据不可用');
      popularError?.classList.remove('hidden');
      popularError?.classList.add('flex');
    }
  }

  pathInput.addEventListener('input', () => {
    pathClear?.classList.toggle('hidden', !pathInput.value);
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void load({ range: state.range });
    }, 300);
  });

  pathInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      window.clearTimeout(debounceTimer);
      void load({ range: state.range });
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      window.clearTimeout(debounceTimer);
      pathInput.value = '';
      void load({ range: state.range });
    }
  });

  pathClear?.addEventListener('click', () => {
    window.clearTimeout(debounceTimer);
    pathInput.value = '';
    pathInput.focus();
    void load({ range: state.range });
  });

  retry?.addEventListener('click', () => {
    void load({ range: state.range, preserveRows: true });
  });

  for (const button of document.querySelectorAll('[data-popular-sort]')) {
    button.addEventListener('click', () => {
      const metric = button.getAttribute('data-popular-sort');
      if (metric !== 'pv' && metric !== 'uv') return;
      if (state.sort === metric) {
        state.order = state.order === 'desc' ? 'asc' : 'desc';
      } else {
        state.sort = metric;
        state.order = 'desc';
      }
      updateSortControls(state);
      void load({ range: state.range });
    });
  }

  updateSortControls(state);

  return {
    load,
    abort: () => abortController?.abort(),
  };
}
