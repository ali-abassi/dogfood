import { state } from '../state.mjs';
import { readJson } from '../api.mjs';
import { escapeHtml, plural } from '../format.mjs';
import { render } from '../app.mjs';

function local() { return state.productMap ??= { key: '', data: null, loading: false, error: '', active: false }; }
function href(view, query = '') { return `?project=${encodeURIComponent(state.project.id)}&view=${view}${query}`; }
function link(view, title, query = '') { return `<a href="${href(view, query)}">${escapeHtml(title)}</a>`; }
function statusLabel(status) {
  const names = { scope_changed: 'Scope changed · recheck', planned: 'Planned', accepted: 'QA accepted', pass: 'Good', needs_work: 'Needs work', blocked: 'Blocked', untested: 'Not checked', in_review: 'Partly checked', doing: 'In progress', todo: 'To do', running: 'Working', attention: 'Needs you', review: 'Review', done: 'Request done' };
  return names[status] || status;
}
function featuresMarkup(features) {
  if (!features.length) return '<p class="muted">No features defined.</p>';
  return `<ul class="product-map-features">${features.map(feature => `<li><strong>${escapeHtml(feature.name)}</strong><span>${escapeHtml(statusLabel(feature.status))}</span><p>${escapeHtml(feature.expected || '')}</p></li>`).join('')}</ul>`;
}
function taskMarkup(task) {
  const receipt = task.receipt ? ` · Last recorded check ${task.receipt.passed ? 'passed' : 'failed'}` : '';
  return `<li>${link('plan', task.title)}<small>${escapeHtml(statusLabel(task.status) + receipt)}</small></li>`;
}
function tasksMarkup(tasks) {
  return tasks.length ? `<ul>${tasks.map(taskMarkup).join('')}</ul>` : '<p class="muted">No linked task yet.</p>';
}
function requestMarkup(request) {
  return `<li>${link('board', request.title, `&card=${encodeURIComponent(request.id)}`)}<small>${escapeHtml(statusLabel(request.status))}</small></li>`;
}
function requestsMarkup(requests) {
  return requests.length ? `<ul>${requests.map(requestMarkup).join('')}</ul>` : '<p class="muted">No linked agent requests.</p>';
}
function evidenceMarkup(page) {
  if (!page.registered) return '<p class="muted">Planned page. Add the running page to begin QA.</p>';
  const captures = page.evidence.captures.map(capture => capture.device === 'desktop' ? 'computer' : 'phone').join(' and ');
  return `<p>${link('report', 'Open page evidence', `&page=${encodeURIComponent(page.id)}`)} · ${escapeHtml(statusLabel(page.status))}</p><p class="muted">${captures ? `Captured on ${captures}.` : 'No rendered captures.'} ${page.evidence.openFindings} open findings.</p>`;
}
function codeMarkup(page) {
  if (!page.code.length) return '';
  return `<details class="product-map-code"><summary>Code in linked task scope · ${page.code.length}</summary><p class="field-hint">References come from an existing Graphify graph and explicit task scope. They do not prove a runtime dependency.</p><ul>${page.code.map(item => `<li><code>${escapeHtml(item.file)}</code> · ${escapeHtml(item.graphStatus)}</li>`).join('')}</ul></details>`;
}
function pageMarkup(page) {
  return `<article class="content-panel product-map-page" aria-label="${escapeHtml(page.name)} page map"><header><h2>${escapeHtml(page.name)}</h2><code>${escapeHtml(page.route)}</code><span class="product-map-state">${escapeHtml(statusLabel(page.status))}</span></header><div class="product-map-columns"><section><h3>Features</h3>${featuresMarkup(page.features)}</section><section><h3>Implementation tasks</h3>${tasksMarkup(page.tasks)}</section><section><h3>Agent requests</h3>${requestsMarkup(page.requests)}</section><section><h3>Evidence</h3>${evidenceMarkup(page)}</section></div>${codeMarkup(page)}</article>`;
}
function unlinkedMarkup(data) {
  if (!data.unlinkedTasks.length && !data.unlinkedRequests.length) return '';
  return `<section class="content-panel product-map-unlinked"><h2>Work without a page link</h2><p>These items belong to the project. Link them to a page when their scope is known.</p><div class="product-map-columns"><section><h3>Tasks</h3>${tasksMarkup(data.unlinkedTasks)}</section><section><h3>Requests</h3>${requestsMarkup(data.unlinkedRequests)}</section></div></section>`;
}
function graphMarkup(graph) {
  const size = graph.nodeCount ? ` ${graph.nodeCount} saved code nodes.` : '';
  return `<details class="content-panel product-map-graph"><summary>Code context · ${escapeHtml(graph.status)}</summary><p>${escapeHtml(graph.message + size)}</p><p class="field-hint">This view reads a bounded local Graphify file. It does not rebuild graphs, fetch code or infer missing connections.</p></details>`;
}
function mapBody(data) {
  if (!data.pages.length) return `<div class="content-panel"><h2>Map the first outcome</h2><p>Define the project's pages and the things people can do on them in Discovery. Existing registered pages appear here automatically.</p><p>${link('discovery', 'Open Discovery')}</p></div>${unlinkedMarkup(data)}`;
  return `${data.pages.map(pageMarkup).join('')}${unlinkedMarkup(data)}${graphMarkup(data.graphify)}`;
}
export function productMapMarkup() {
  const current = local();
  const header = '<header class="overview-heading"><div><h1>Product map</h1><p>Follow each page from its intended features to work, agent requests and proof.</p></div><button type="button" class="text-button" data-project-view="discovery">Review scope</button></header>';
  if (current.error) return `<section class="overview-content">${header}<p class="form-error" role="alert">${escapeHtml(current.error)}</p><button type="button" class="text-button" data-map-refresh>Try again</button></section>`;
  if (current.loading || !current.data) return `<section class="overview-content">${header}<p role="status">Reading the project map…</p></section>`;
  const data = current.data, totals = data.totals;
  return `<section class="overview-content product-map-view" aria-label="Product map">${header}<p>${plural(totals.pages, 'page', 'pages')} · ${plural(totals.features, 'feature', 'features')} · ${plural(totals.tasks, 'task', 'tasks')} · ${plural(totals.requests, 'request', 'requests')} · ${plural(totals.acceptedPages, 'page', 'pages')} accepted</p><p class="muted">${escapeHtml(data.readiness.label)}</p>${mapBody(data)}</section>`;
}
async function fetchMap(key) {
  const current = local(); current.loading = true;
  try { const data = await readJson(`/api/projects/${encodeURIComponent(key)}/map`); if (current.key === key) current.data = data; }
  catch (error) { if (current.key === key) current.error = error.message; }
  finally { current.loading = false; if (state.view === 'map') render(); }
}
export function syncProductMapState() {
  const current = local();
  if (state.view !== 'map') { current.active = false; return; }
  const key = state.project.id;
  if (current.active && current.key === key) return;
  Object.assign(current, { key, data: null, error: '', loading: true, active: true });
  fetchMap(key);
}
export function registerProductMapEvents(app) {
  app.addEventListener('click', event => {
    if (!event.target.closest('[data-map-refresh]')) return;
    local().error = ''; fetchMap(state.project.id);
  });
}
