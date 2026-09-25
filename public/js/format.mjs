import { statusNames } from './state.mjs';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? escapeHtml(url.href) : '';
  } catch { return ''; }
}

export function safeCapturePath(value) {
  return /^\/captures\/[a-z0-9-]+\/[a-z0-9-]+(?:-mobile)?\.png$/.test(value) ? escapeHtml(value) : '';
}

export function safeServedImagePath(value) {
  return /^\/captures\/[a-z0-9-]+\/(?:(?:history|diffs)\/)?[a-z0-9-]+\.png$/.test(value) ? escapeHtml(value) : '';
}

export function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeCaptureAge(capture) {
  if (capture.state !== 'rendered' || !capture.capturedAt) return 'Not captured';
  const timestamp = new Date(capture.capturedAt).getTime();
  if (Number.isNaN(timestamp)) return 'Capture time unavailable';
  const elapsedDays = Math.round((Date.now() - timestamp) / 86_400_000);
  const relativeDays = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-elapsedDays, 'day');
  return `Captured ${relativeDays}`;
}

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// "3 of 12 · Pricing": the page being scanned now, counted from 1.
export function scanPosition({ scanned, total, current }) {
  return current ? `${scanned + 1} of ${total} · ${current}` : `${scanned} of ${total}`;
}

export function scanLoadTime(value) {
  if (value === null || value === undefined) return 'Not measured';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function authorName(by) {
  if (by === 'person') return 'you';
  if (by.startsWith('agent:')) return by.slice(6);
  return by;
}

export function verdictByMarkup(by, at, action = '') {
  if (!by) return '';
  const date = dateLabel(at);
  const prefix = action ? `${escapeHtml(action)} by` : 'By';
  return `<small class="verdict-by">${prefix} ${escapeHtml(authorName(by))}${date ? ` · ${escapeHtml(date)}` : ''}</small>`;
}

export function statusPill(status) {
  return `<span class="status status-${escapeHtml(status)}"><span class="status-dot"></span>${escapeHtml(statusNames[status] || status)}</span>`;
}

export function externalLinkMarkup(value, label, className = '') {
  const url = safeHttpUrl(value);
  return url ? `<a class="${escapeHtml(className)}" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : '';
}
