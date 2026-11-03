import { state, activePage, deviceNames } from '../state.mjs';
import { readJson } from '../api.mjs';
import { safeServedImagePath, escapeHtml } from '../format.mjs';
import { render, loadProject } from '../app.mjs';
function local() { return state.annotations ??= { key: '', data: [], loading: false, error: '', draft: null, busy: false, selected: '' }; }
function endpoint(suffix = '') { return `/api/projects/${encodeURIComponent(state.project.id)}/pages/${encodeURIComponent(state.pageId)}/annotations${suffix}`; }
async function refresh(key) {
  const current = local(); current.loading = true;
  try { const data = await readJson(endpoint()); if (current.key === key) current.data = data; }
  catch (error) { if (current.key === key) current.error = error.message; }
  finally { current.loading = false; if (state.view === 'screens') render(); }
}
export function syncAnnotations() {
  if (state.view !== 'screens' || !state.pageId) return;
  const key = `${state.project.id}/${state.pageId}`, current = local();
  if (current.key === key) return;
  Object.assign(current, { key, data: [], draft: null, error: '', selected: '' }); void refresh(key);
}
function currentShot(page, device, shot) { return shot?.src === page.captures[device]?.path && page.captures[device]?.sha256; }
export function annotationImageMarkup(page, device, shot, image) {
  if (!currentShot(page, device, shot)) return image;
  const pins = local().data.filter(pin => pin.device === device && pin.capture.sha256 === page.captures[device].sha256);
  const markers = pins.map((pin, i) => `<button type="button" class="annotation-pin" style="left:${pin.x * 100}%;top:${pin.y * 100}%" data-annotation-select="${pin.id}" aria-label="Feedback ${i + 1}: ${escapeHtml(pin.title)}">${i + 1}</button>`).join('');
  return `<div class="annotation-canvas ${local().draft ? 'placing' : ''}" data-annotation-canvas data-device="${device}">${image}${markers}</div>`;
}
function formMarkup(page) {
  const draft = local().draft; if (!draft) return '';
  return `<form id="annotation-form" class="content-panel annotation-form" data-dirty="true"><h2>Pin feedback</h2><p>${deviceNames[draft.device]} · Click the screenshot to choose a point, or set its position below.</p><div class="annotation-position"><label>Across (%)<input type="number" name="x" min="0" max="100" step="0.1" value="${(draft.x * 100).toFixed(1)}" required></label><label>Down (%)<input type="number" name="y" min="0" max="100" step="0.1" value="${(draft.y * 100).toFixed(1)}" required></label></div><label for="annotation-title">What should change?</label><input id="annotation-title" name="title" minlength="8" maxlength="120" required value="${escapeHtml(draft.title || '')}"><label for="annotation-comment">Observation and expected result</label><textarea id="annotation-comment" name="comment" minlength="20" maxlength="1200" rows="3" required>${escapeHtml(draft.comment || '')}</textarea><p class="field-hint">This saves an open page finding with this screenshot revision. An agent starts only when you explicitly send a request.</p><div class="form-actions"><button class="save-button" type="submit" ${local().busy ? 'disabled' : ''}>Save feedback</button><button class="text-button" type="button" data-annotation-action="cancel">Cancel</button></div></form>`;
}
function pinStatus(pin) { return `${deviceNames[pin.device]} · ${pin.status}${pin.stale ? ' · Earlier screenshot' : ''}`; }
function agentSelect(pin) { return pin.request ? '' : `<label class="sr-only" for="pin-agent-${pin.id}">Agent for ${escapeHtml(pin.title)}</label><select id="pin-agent-${pin.id}"><option value="claude">Claude Code</option><option value="codex">Codex</option></select>`; }
function pinMarkup(pin) {
  const action = pin.request ? `<button type="button" class="text-button" data-annotation-request-view="${pin.request.id}">View agent request</button>` : `<button type="button" class="text-button" data-annotation-send="${pin.id}">Create agent request</button>`;
  return `<li class="annotation-item" id="pin-${pin.id}"><div><strong>${escapeHtml(pin.title)}</strong><span class="muted">${escapeHtml(pinStatus(pin))}</span></div><p>${escapeHtml(pin.comment)}</p><p class="field-hint">Position ${Math.round(pin.x * 100)}% across, ${Math.round(pin.y * 100)}% down · Captured ${escapeHtml(pin.capture.capturedAt || '')}</p><details class="pinned-capture"><summary>View pinned capture</summary><div class="annotation-canvas"><img src="${safeServedImagePath(pin.capture.path) || ''}" alt="Pinned screenshot for ${escapeHtml(pin.title)}" loading="lazy"><span class="annotation-pin" style="left:${pin.x * 100}%;top:${pin.y * 100}%" aria-label="Feedback position">●</span></div></details><div class="form-actions">${agentSelect(pin)}${action}${pin.status === 'open' ? `<button type="button" class="text-button" data-annotation-resolve="${pin.id}">Record retest & resolve</button>` : ''}</div></li>`;
}
function feedbackIntro(allowed) { return allowed ? '' : '<p class="muted">Select the latest screenshot to add feedback.</p>'; }
function feedbackError(current) { return current.error ? `<p class="form-error" role="alert">${escapeHtml(current.error)}</p>` : ''; }
export function annotationsMarkup(page, device, shot) {
  const allowed = currentShot(page, device, shot), current = local();
  return `<section class="annotation-section" aria-label="Pinned feedback"><header class="panel-heading"><h2>Page feedback</h2><button type="button" class="text-button" data-annotation-action="new" ${allowed && !current.draft ? '' : 'disabled'}>Pin feedback</button></header>${feedbackIntro(allowed)}${feedbackError(current)}${formMarkup(page)}<ul class="annotation-list">${current.data.map(pinMarkup).join('')}</ul>${current.data.length ? '' : '<p class="muted">Point at a problem and describe the result you want. Its screenshot and agent conversation stay connected.</p>'}</section>`;
}
function remember(form) {
  if (!form || !local().draft) return;
  const value = Object.fromEntries(new FormData(form));
  Object.assign(local().draft, { title: value.title, comment: value.comment, x: Number(value.x) / 100, y: Number(value.y) / 100 });
}
async function mutate(operation) {
  const current = local(); if (current.busy) return;
  current.busy = true; current.error = '';
  try { await operation(); }
  catch (error) { current.error = error.message; }
  finally { current.busy = false; render(); }
}
async function post(suffix, body) { return readJson(endpoint(suffix), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
async function save(form) {
  remember(form);
  await mutate(async () => { local().data = await post('', local().draft); local().draft = null; state.project = await readJson(`/api/projects/${state.project.id}`); });
}
async function send(id) {
  await mutate(async () => { const saved = await post(`/${id}/request`, { backend: document.getElementById(`pin-agent-${id}`).value, start: false }); local().draft = null; await loadProject(state.project.id, { view: 'board', cardId: saved.card.id }); });
}
async function resolve(id) {
  const note = window.prompt('What did you retest, and what result did you observe? At least 20 characters.');
  if (!note) return;
  await mutate(async () => { local().data = await post(`/${id}/resolve`, { note }); state.project = await readJson(`/api/projects/${state.project.id}`); });
}
function begin() {
  const page = activePage(), device = state.screensDevice;
  local().draft = { device, x: 0.5, y: 0.5, captureSha256: page.captures[device].sha256, title: '', comment: '' }; render(); document.getElementById('annotation-title')?.focus();
}
function selectPosition(event) {
  const canvas = event.target.closest('[data-annotation-canvas]');
  if (!canvas || !local().draft || event.target.closest('button')) return;
  remember(document.getElementById('annotation-form'));
  const box = canvas.getBoundingClientRect(); Object.assign(local().draft, { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }); render();
}
function clickAction(button) {
  if (button.dataset.annotationAction === 'new') begin();
  if (button.dataset.annotationAction === 'cancel') { local().draft = null; render(); }
  if (button.dataset.annotationSend) void send(button.dataset.annotationSend);
  if (button.dataset.annotationResolve) void resolve(button.dataset.annotationResolve);
}
function requestClick(button) {
  if (button.dataset.annotationRequestView) void loadProject(state.project.id, { view: 'board', cardId: button.dataset.annotationRequestView });
  if (button.dataset.annotationSelect) document.getElementById(`pin-${button.dataset.annotationSelect}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
export function registerAnnotationEvents(app) {
  app.addEventListener('click', event => { const button = event.target.closest('[data-annotation-action], [data-annotation-send], [data-annotation-resolve]'); if (button) clickAction(button); selectPosition(event); });
  app.addEventListener('click', event => { const button = event.target.closest('[data-annotation-select], [data-annotation-request-view]'); if (button) requestClick(button); });
  app.addEventListener('input', event => { if (event.target.closest('#annotation-form')) remember(event.target.form); });
  app.addEventListener('submit', event => { if (event.target.id !== 'annotation-form') return; event.preventDefault(); void save(event.target); });
}
