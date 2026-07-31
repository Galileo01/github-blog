import { createAnalyticsDistribution } from './analytics-distribution.ts';
import { createAnalyticsPopularTable } from './analytics-popular-table.ts';
import {
  ANALYTICS_RANGE_LABELS,
  parseAnalyticsRange,
  type AnalyticsRange,
} from './analytics-range.ts';
import {
  createAnalyticsTrendChart,
  type AnalyticsTrendResponse,
} from './analytics-trend-chart.ts';

interface AnalyticsSummaryResponse {
  range: AnalyticsRange;
  pv: number;
  uv: number;
  pages: number;
  viewsPerVisitor: number;
}

type LoadDashboardOptions = {
  background?: boolean;
};

function setText(id: string, value: string | number): void {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function updateRangeControls(range: AnalyticsRange): void {
  for (const button of document.querySelectorAll('[data-analytics-range]')) {
    const active = button.getAttribute('data-analytics-range') === range;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('bg-background', active);
    button.classList.toggle('font-medium', active);
    button.classList.toggle('text-foreground', active);
    button.classList.toggle('shadow-sm', active);
    button.classList.toggle('text-muted-foreground', !active);
  }
}

function replaceRangeInUrl(range: AnalyticsRange): void {
  const url = new URL(window.location.href);
  url.searchParams.set('range', range);
  window.history.replaceState(null, '', url);
}

export function initializeAnalyticsAdmin(): void {
  const loginForm = document.getElementById('admin-login');
  const dashboard = document.getElementById('admin-dashboard');
  const status = document.getElementById('admin-status');
  const passwordInput = document.getElementById('admin-password');
  const loginButton = document.getElementById('admin-login-button');
  const loginError = document.getElementById('admin-login-error');
  const adminActions = document.getElementById('admin-actions');
  const refreshButton = document.getElementById('admin-refresh');
  const logoutButton = document.getElementById('admin-logout');
  const trendChart = createAnalyticsTrendChart();

  let range = parseAnalyticsRange(new URL(window.location.href).searchParams.get('range'));
  let loadSequence = 0;
  let popularTable: ReturnType<typeof createAnalyticsPopularTable>;
  let distribution: ReturnType<typeof createAnalyticsDistribution>;

  function showLogin(message = ''): void {
    loadSequence += 1;
    popularTable?.abort();
    distribution?.abort();
    setRefreshState(false);
    loginForm?.classList.remove('hidden');
    dashboard?.classList.add('hidden');
    adminActions?.classList.add('hidden');
    adminActions?.classList.remove('flex');
    status?.classList.add('hidden');
    if (loginError) {
      loginError.textContent = message;
      loginError.classList.toggle('hidden', !message);
    }
  }

  function showDashboard(): void {
    loginForm?.classList.add('hidden');
    dashboard?.classList.remove('hidden');
    adminActions?.classList.remove('hidden');
    adminActions?.classList.add('flex');
    status?.classList.add('hidden');
  }

  function showStatus(message: string, isError = false): void {
    if (!status) return;
    status.textContent = message;
    status.classList.remove('hidden');
    status.classList.toggle('text-destructive', isError);
    loginForm?.classList.add('hidden');
    dashboard?.classList.add('hidden');
    adminActions?.classList.add('hidden');
    adminActions?.classList.remove('flex');
  }

  function setRefreshState(isRefreshing: boolean): void {
    if (refreshButton instanceof HTMLButtonElement) {
      refreshButton.disabled = isRefreshing;
      refreshButton.setAttribute('aria-busy', String(isRefreshing));
    }
    document.getElementById('admin-refresh-icon')?.classList.toggle('animate-spin', isRefreshing);
    setText('admin-refresh-label', isRefreshing ? '刷新中…' : '刷新数据');
  }

  async function fetchAdmin<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
    });
    if (response.status === 401) throw new Error('unauthorized');
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  popularTable = createAnalyticsPopularTable({
    fetchAdmin,
    onUnauthorized: showLogin,
  });
  distribution = createAnalyticsDistribution({
    fetchAdmin,
    onUnauthorized: showLogin,
  });

  async function loadDashboard({ background = false }: LoadDashboardOptions = {}): Promise<void> {
    const currentLoad = ++loadSequence;
    if (background) {
      setRefreshState(true);
    } else {
      showStatus('正在加载…');
    }

    const params = new URLSearchParams({ range });
    const tablePromise = popularTable?.load({ range, preserveRows: background });
    const distributionPromise = distribution?.load({ range, preserveChart: background });

    try {
      const [summaryResult, trendsResult] = await Promise.allSettled([
        fetchAdmin<AnalyticsSummaryResponse>(`/api/admin/analytics/summary?${params}`),
        fetchAdmin<AnalyticsTrendResponse>(`/api/admin/analytics/trends?${params}`),
      ]);
      await Promise.allSettled([tablePromise, distributionPromise]);
      if (currentLoad !== loadSequence) return;

      const unauthorized = [summaryResult, trendsResult].some(
        (result) => result.status === 'rejected'
          && result.reason instanceof Error
          && result.reason.message === 'unauthorized'
      );
      if (unauthorized) {
        showLogin();
        return;
      }

      if (!background) showDashboard();
      if (summaryResult.status === 'fulfilled') {
        setText('summary-caption', ANALYTICS_RANGE_LABELS[summaryResult.value.range]);
        setText('summary-pv', summaryResult.value.pv);
        setText('summary-uv', summaryResult.value.uv);
        setText('summary-pages', summaryResult.value.pages);
        setText('summary-views-per-visitor', summaryResult.value.viewsPerVisitor.toFixed(2));
        document.getElementById('summary-error')?.classList.add('hidden');
      } else {
        const summaryError = document.getElementById('summary-error');
        if (summaryError) {
          summaryError.textContent = background
            ? '概要数据刷新失败，当前保留上次结果。'
            : '概要数据加载失败。';
          summaryError.classList.remove('hidden');
        }
      }

      if (trendsResult.status === 'fulfilled') {
        trendChart?.render(trendsResult.value);
      } else {
        trendChart?.showError({ preserveChart: background });
      }
    } finally {
      if (background && currentLoad === loadSequence) setRefreshState(false);
    }
  }

  for (const button of document.querySelectorAll('[data-analytics-range]')) {
    button.addEventListener('click', () => {
      const nextRange = parseAnalyticsRange(button.getAttribute('data-analytics-range'));
      if (nextRange === range) return;
      range = nextRange;
      updateRangeControls(range);
      replaceRangeInUrl(range);
      void loadDashboard({ background: true });
    });
  }
  updateRangeControls(range);
  replaceRangeInUrl(range);

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError?.classList.add('hidden');
    if (loginButton instanceof HTMLButtonElement) loginButton.disabled = true;

    try {
      const password = passwordInput instanceof HTMLInputElement ? passwordInput.value : '';
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        showLogin(response.status === 401 ? '密码错误' : '登录服务暂时不可用');
        return;
      }

      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
      await loadDashboard();
    } catch {
      showLogin('网络异常，请稍后重试');
    } finally {
      if (loginButton instanceof HTMLButtonElement) loginButton.disabled = false;
    }
  });

  logoutButton?.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      showLogin();
    }
  });

  refreshButton?.addEventListener('click', () => {
    void loadDashboard({ background: true });
  });

  void loadDashboard();
}
