import { readJson } from '../api.mjs';
import { dateLabel, environmentLabel, escapeHtml, relativeCaptureAge, safeServedImagePath } from '../format.mjs';
import { isProjectView, state } from '../state.mjs';
import { render } from '../app.mjs';

function localDay(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The days with at least one screenshot, newest first.
function historyDays() {
  const shots = state.history.shots;
  if (!shots) return [];
  return [...new Set([...shots.desktop, ...shots.mobile].map(shot => localDay(shot.takenAt)))].sort().reverse();
}

function selectedDay(days) {
  return days.includes(state.history.day) ? state.history.day : days[0];
}

// How the page looked on the chosen day: the last screenshot taken that day or before it.
function shotOnDay(device, day) {
  return state.history.shots[device].find(shot => localDay(shot.takenAt) <= day) ?? null;
}

function pastShot(device, day) {
  const shot = shotOnDay(device, day);
  const age = shot ? `Taken ${dateLabel(shot.takenAt)}` : '';
  return shot ? { src: safeServedImagePath(shot.path), sourceUrl: shot.sourceUrl, environment: shot.environment, age, caption: evidenceLabel(shot) + age } : null;
}

function evidenceLabel(capture) {
  return `${environmentLabel(capture.environment, capture.sourceUrl)} · `;
}

function currentShot(page, device) {
  const capture = page.captures[device];
  const src = capture.state === 'rendered' ? safeServedImagePath(capture.path) : '';
  const label = evidenceLabel(capture);
  const age = relativeCaptureAge(capture);
  return src ? { src, sourceUrl: capture.sourceUrl, environment: capture.environment, age, caption: label + age, width: capture.pixelWidth, height: capture.pixelHeight } : null;
}

// The screenshot a view shows for a device: the chosen day's, or the current capture.
export function shownShot(page, device) {
  const days = historyDays();
  const day = selectedDay(days);
  return day && day !== days[0] ? pastShot(device, day) : currentShot(page, device);
}

function dayLabel(day, index) {
  if (index === 0) return 'Latest';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// One button per day the page was captured, so the screenshots above step back through its changes.
function historyFeedbackMarkup() {
  if (state.history.loading) return '<p class="muted" role="status">Loading screenshot history…</p>';
  if (!state.history.error) return '';
  return `<div class="history-error"><p class="form-error" role="alert">Screenshot history could not be read: ${escapeHtml(state.history.error)}</p><button class="text-button" data-action="retry-history">Try again</button></div>`;
}

export function timelineMarkup() {
  return `${historyFeedbackMarkup()}${historyDaysMarkup()}`;
}

function historyDaysMarkup() {
  const days = historyDays();
  if (days.length < 2) return '';
  const current = selectedDay(days);
  const buttons = days.map((day, index) => `<button type="button" data-action="history-day" data-day="${escapeHtml(day)}" aria-pressed="${day === current}">${escapeHtml(dayLabel(day, index))}</button>`).join('');
  return `<div class="timeline"><span class="timeline-label">History</span><div class="timeline-days" role="group" aria-label="Screenshots by day">${buttons}</div></div>`;
}

export async function retryHistory() {
  if (state.history.loading) return;
  Object.assign(state.history, { loading: true, error: '' });
  render();
  await loadHistory(state.history.key);
  document.querySelector('[data-action="retry-history"], [data-action="history-day"][aria-pressed="true"], #answer-heading')?.focus({ preventScroll: true });
}

async function loadHistory(key) {
  const [projectId, pageId] = key.split('/');
  try {
    const shots = await readJson(`/api/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}/history`);
    if (state.history.key === key) Object.assign(state.history, { loading: false, shots });
  } catch (error) {
    if (state.history.key === key) Object.assign(state.history, { loading: false, error: error.message });
  }
  render();
}

// A page's screenshot history loads when the page opens, and again after a new check adds to it.
export function syncHistoryState() {
  if (isProjectView() || !state.pageId) return;
  const key = `${state.project.id}/${state.pageId}`;
  if (state.history.key === key) return;
  state.history = { key, loading: true, shots: null, error: '', day: '' };
  void loadHistory(key);
}
