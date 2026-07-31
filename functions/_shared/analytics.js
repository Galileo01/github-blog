const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BLOG_PATH_RE = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATIC_PATHS = new Set(['/', '/blog', '/projects']);

export function normalizePage(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return null;
  if (value.trim() !== value || value.includes('?') || value.includes('#')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) return null;

  const page = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  if (STATIC_PATHS.has(page) || BLOG_PATH_RE.test(page)) return page;
  return null;
}

export function normalizePathFilter(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return '';
  if (normalized.length > 200 || !/^[a-z0-9/-]+$/.test(normalized)) return null;
  return normalized;
}

export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function normalizeVisitorId(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value) ? value.toLowerCase() : null;
}

export function minuteBucket(timestamp = Date.now()) {
  return Math.floor(timestamp / 60_000);
}

export function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
