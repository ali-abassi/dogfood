import { qaEndpoint, readJson } from '../api.mjs';
import { dateLabel, escapeHtml } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

function qaRunLabel(status) {
  return { passed: 'Saved-example checks passed', failed: 'Some checks failed', error: 'Checks could not run' }[status] || 'Run unavailable';
}

function qaRunFailureMarkup(run) {
  if (run.cases?.length || !run.failures?.length) return '';
  return `<ul class="qa-failures">${run.failures.map(item => `<li><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.detail)}</p></li>`).join('')}</ul>`;
}

function qaRunErrorMarkup(error) {
  return error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : '';
}

function qaRunMarkup(run) {
  return `<div class="qa-result"><div class="qa-result-heading"><strong>${escapeHtml(qaRunLabel(run.status))}</strong><span>${escapeHtml(dateLabel(run.finishedAt))}</span></div><p>${escapeHtml(run.passed)} of ${escapeHtml(run.total)} checks passed using saved examples.</p>${qaCasesMarkup(run)}${qaRunFailureMarkup(run)}${qaRunErrorMarkup(run.error)}<details class="technical-details"><summary>Run details</summary><small>Checkout revision: ${escapeHtml(run.revision || 'unavailable')} · ${escapeHtml(checkoutStateLabel(run))}</small></details></div>`;
}

function checkoutStateLabel(run) {
  if (run.dirty === true) return 'local changes present';
  if (run.dirty === false) return 'clean checkout';
  return 'change status unrecorded';
}

function qaCaseMarkup(item) {
  const label = { passed: 'Pass', failed: 'Fail', skipped: 'Skipped', pending: 'Pending', todo: 'To do' }[item.status] || 'Unclear';
  const detail = item.detail ? `<p>${escapeHtml(item.detail)}</p>` : '';
  return `<li><span class="qa-case-status ${escapeHtml(item.status)}">${label}</span><div><strong>${escapeHtml(item.name)}</strong>${detail}</div></li>`;
}

function qaCasesMarkup(run) {
  if (!run.cases) return '<p class="qa-detail-gap">Case names were not saved for this older run. Run it again to see each check.</p>';
  if (!run.cases.length) return '<p class="qa-detail-gap">No check completed in this run.</p>';
  const files = [...new Set(run.cases.map(item => item.file))];
  const groups = files.map(file => `<div class="qa-case-group"><ol>${run.cases.filter(item => item.file === file).map(qaCaseMarkup).join('')}</ol><details class="technical-details"><summary>Source file</summary><code>${escapeHtml(file)}</code></details></div>`).join('');
  return `<details class="qa-cases" open><summary>Checks run · ${run.cases.length}</summary>${groups}</details>`;
}

function qaPlanMarkup(page) {
  const tests = page.qa.tests.map(item => `<li><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.reason)}</p><code>${escapeHtml(item.file)}</code></li>`).join('');
  const plan = tests ? `<details class="technical-details"><summary>Why these checks were chosen</summary><ul class="qa-tests">${tests}</ul></details>` : '';
  return `${qaPlannedCasesMarkup(page)}${plan}<p class="qa-gap">${escapeHtml(page.qa.note)}</p>`;
}

function qaPlannedCasesMarkup(page) {
  if (!page.qa.tests.length) return '';
  if (state.qa.loading) return '<p class="audit-caveat">Loading the checks for this page…</p>';
  if (state.qa.planError) return `<p class="form-error" role="alert">Could not list checks: ${escapeHtml(state.qa.planError)}</p>`;
  if (!state.qa.plan.length) return '<p class="qa-detail-gap">No runnable cases were found in the selected files.</p>';
  const cases = state.qa.plan.map(item => `<li>${escapeHtml(item.name)}</li>`).join('');
  return `<details class="qa-planned" ${qaPlanOpenAttribute()}><summary>Checks included · ${state.qa.plan.length}</summary><ol>${cases}</ol></details>`;
}

function qaPlanOpenAttribute() {
  if (state.qa.runs[0]?.cases?.length) return '';
  return 'open';
}

function qaHistoryMarkup(page) {
  const run = state.qa.runs[0] || (!state.qa.loading && page.qa.latest);
  const latest = run ? qaRunMarkup(run) : '<p class="audit-caveat">No checks have run for this page yet.</p>';
  const history = state.qa.runs.length > 1 ? `<details class="qa-history"><summary>Earlier runs (${state.qa.runs.length - 1})</summary>${state.qa.runs.slice(1).map(qaRunMarkup).join('')}</details>` : '';
  return `${latest}${history}`;
}

function qaRunButtonText() {
  if (state.qa.running) return 'Running checks…';
  if (!state.qa.plan.length && !state.qa.loading) return 'Checks unavailable';
  return 'Run checks';
}

function qaRunButtonMarkup() {
  const disabled = state.qa.running || state.qa.loading || !state.qa.plan.length;
  return `<button type="button" class="review-button qa-run-button" data-action="run-qa" ${disabled ? 'disabled' : ''}>${qaRunButtonText()}</button>`;
}

function qaControlMarkup() {
  const progress = state.qa.running ? 'Running the selected checks…' : state.qa.loading ? 'Loading checks and past results…' : '';
  const error = state.qa.error ? `<p class="form-error" role="alert">${escapeHtml(state.qa.error)}</p>` : '';
  return `${qaRunButtonMarkup()}<div class="qa-run-state" role="status">${progress}</div>${error}`;
}

// A page without focused tests needs one sentence and its untested boundary, not three headings.
function noTestsMarkup(page) {
  return `<section class="content-panel qa-section" aria-label="Automated page checks"><h3>No focused tests for this page</h3><p class="qa-gap">${escapeHtml(page.qa.note)}</p></section>`;
}

export function qaMarkup(page) {
  if (!page.qa.tests.length) return noTestsMarkup(page);
  const control = `<div class="qa-control">${qaControlMarkup()}</div>`;
  const evidence = `<div class="qa-evidence"><div class="section-heading"><h4>Last run</h4><span>Saved examples</span></div>${qaHistoryMarkup(page)}</div>`;
  return `<section class="content-panel qa-section" aria-label="Automated page checks"><div class="qa-heading"><div><h3>Run the page checks</h3><p>These checks use saved examples. They cannot prove the live page is ready.</p></div>${control}</div>${evidence}<div class="qa-plan"><div class="section-heading"><h4>Checks and gaps</h4></div>${qaPlanMarkup(page)}</div></section>`;
}

export function syncQaState() {
  if (!state.pageId) return;
  const key = `${state.project.id}/${state.pageId}`;
  if (state.qa.key === key) return;
  state.qa = { key, version: 0, runs: [], plan: [], planError: '', loading: true, running: false, error: '' };
  void loadQaRuns(key);
}

function currentQaRequest(key, version) {
  return state.qa.key === key && state.qa.version === version;
}

function finishQaLoad(key, version, response) {
  if (!currentQaRequest(key, version)) return false;
  state.qa = { ...state.qa, runs: response.runs, plan: response.plan, planError: response.planError, loading: false };
  return true;
}

function failQaLoad(key, version, error) {
  if (!currentQaRequest(key, version)) return false;
  state.qa = { ...state.qa, loading: false, error: error.message };
  return true;
}

async function loadQaRuns(key) {
  const version = state.qa.version;
  try {
    const response = await readJson(qaEndpoint(key));
    if (!finishQaLoad(key, version, response)) return;
  } catch (error) {
    if (!failQaLoad(key, version, error)) return;
  }
  render();
}

function qaRunAllowed() {
  return !state.qa.running && !state.qa.loading && state.qa.plan.length > 0;
}

function finishQaRun(key, result) {
  if (state.project.id === result.project.id) state.project = result.project;
  if (state.qa.key === key) state.qa = { ...state.qa, running: false, runs: [result.run, ...state.qa.runs].slice(0, 5) };
}

function failQaRun(key, error) {
  if (state.qa.key === key) state.qa = { ...state.qa, running: false, error: error.message };
}

export async function runQa() {
  const key = state.qa.key;
  if (!qaRunAllowed()) return;
  state.qa = { ...state.qa, version: state.qa.version + 1, running: true, error: '' };
  render();
  try {
    const result = await readJson(qaEndpoint(key), { method: 'POST' });
    finishQaRun(key, result);
  } catch (error) {
    failQaRun(key, error);
  }
  render();
}
