import { answerWords, statusNames } from './state.mjs';

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
  if (capture.state !== 'rendered' || !capture.capturedAt) return 'No screenshot yet';
  const timestamp = new Date(capture.capturedAt).getTime();
  if (Number.isNaN(timestamp)) return 'Time unknown';
  const elapsedDays = Math.round((Date.now() - timestamp) / 86_400_000);
  const relativeDays = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-elapsedDays, 'day');
  return `Taken ${relativeDays}`;
}

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// "3 of 12 · Pricing": the page being scanned now, counted from 1.
export function scanPosition({ scanned, total, current }) {
  return current ? `${scanned + 1} of ${total} · ${current}` : `${scanned} of ${total}`;
}

export function secondsLabel(value) {
  if (value === null || value === undefined) return 'Not measured';
  return value < 100 ? 'under 0.1 s' : `${(value / 1000).toFixed(1)} s`;
}

export function authorName(by) {
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

// The shape carries the state as well as the colour: ✓ good, ! needs work, ◐ partly, – not checked.
const markShapes = { pass: '✓', needs_work: '!', partial: '◐', untested: '–' };

export function answerMarkMarkup(name, status) {
  const word = answerWords[status];
  return `<span class="answer-mark mark-${escapeHtml(status)}" data-answer-mark role="img" aria-label="${escapeHtml(`${name}: ${word}`)}" title="${escapeHtml(word)}">${markShapes[status]}</span>`;
}

// Answers recorded before dogfood signed them have no author, so they say so rather than guess.
const sourceWords = {
  ai: () => 'From the AI check of these screenshots',
  scan: () => 'Measured by the page check',
  checklist: () => 'From the questions below',
  things: () => 'From trying the things you can do here, below',
  bugs: () => 'From the bugs below',
  tests: () => 'From the automated tests',
  verdict: part => (part.by ? `From ${authorName(part.by)}` : 'From an earlier answer that was not signed'),
};

// Where an answer came from, in plain words, with when.
export function sourceLabel(part) {
  const describe = sourceWords[part.source];
  if (!describe) return 'Not checked yet';
  const date = dateLabel(part.at);
  return date ? `${describe(part)} · ${date}` : describe(part);
}

