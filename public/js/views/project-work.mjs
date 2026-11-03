import { state } from '../state.mjs';
import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { loadProject } from '../app.mjs';
import { openBoardRequest } from './board.mjs';
let timer;
function local() { return state.projectWork ??= { key: '', data: null, loading: false, error: '', at: 0 }; }
function restoreDisclosure() { const details = document.querySelector('.project-current-work details'); if (details) details.open = true; }
function refreshPanel() {
  const panel = document.querySelector('.project-current-work');
  if (!panel || panel.contains(document.activeElement)) return;
  const expanded = panel.querySelector('details')?.open;
  panel.outerHTML = projectWorkMarkup();
  if (expanded) restoreDisclosure();
}
function finishRefresh(current, key) { current.loading = false; current.at = Date.now(); if (state.view === 'overview' && state.project.id === key) refreshPanel(); }
async function refresh(key) {
  const current = local(); current.loading = true;
  try { const data = await readJson(`/api/projects/${encodeURIComponent(key)}/context`); if (current.key === key) { current.data = data; current.error = ''; } }
  catch (error) { if (current.key === key) current.error = error.message; }
  finally { finishRefresh(current, key); }
}
export function syncProjectWork() {
  clearTimeout(timer);
  if (state.view !== 'overview') return;
  const key = state.project.id, current = local();
  if (current.key !== key) Object.assign(current, { key, data: null, at: 0, error: '' });
  if (!current.loading && Date.now() - current.at > 14000) void refresh(key);
  timer = setTimeout(() => { if (state.view === 'overview') void refresh(key); }, 15000);
}
function actionMarkup(action) {
  if (!action) return '<p>No pending task or agent decision. Review your page evidence below.</p>';
  return `<h2>${escapeHtml(action.title)}</h2>${action.summary ? `<p>${escapeHtml(action.summary)}</p>` : ''}<button type="button" class="text-button" data-work-link="${escapeHtml(action.url)}">${action.kind === 'review_request' ? 'Review result' : 'Continue'}</button>`;
}
function goalMarkup(readiness) { if (!readiness.answers.success) return ''; return `<details class="project-outcome"><summary>Project outcome and proof</summary><p>${escapeHtml(readiness.answers.success)}</p><p class="field-hint">${escapeHtml(readiness.answers.proof || 'Define the evidence in Discovery.')}</p></details>`; }
export function projectWorkMarkup() {
  const value = local();
  if (!value.data) return `<section class="project-current-work">${value.error ? `<p class="form-error">Couldn’t read current work: ${escapeHtml(value.error)}</p>` : '<p class="muted" role="status">Reading current work…</p>'}</section>`;
  const { requests, summary, readiness, nextAction } = value.data, counts = requests.summary;
  return `<section class="content-panel project-current-work" aria-label="What needs you next"><p class="eyebrow">What needs you next</p>${actionMarkup(nextAction)}<p class="work-counts">${counts.running} working · ${counts.attention} need you · ${counts.review} results to review · ${summary.accepted} tasks accepted</p><p class="field-hint">${escapeHtml(readiness.label)}</p>${goalMarkup(readiness)}</section>`;
}
async function follow(button) {
  const url = new URL(button.dataset.workLink, location.origin);
  if (url.origin !== location.origin || url.searchParams.get('project') !== state.project.id) return;
  await loadProject(state.project.id, { view: url.searchParams.get('view'), cardId: url.searchParams.get('card'), pageId: url.searchParams.get('page') });
}
function sendTask(button) {
  const task = state.workflow.data?.tasks.find(task => task.id === button.dataset.sendTask);
  if (!task) return;
  openBoardRequest(task.pageIds[0] || '', { taskId: task.id, title: task.title, request: `Complete the linked task: ${task.outcome}\nStay within its scope and run its required checks. Report the actual result and remaining evidence.` });
}
export function registerProjectWorkEvents(app, guard) {
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-work-link], [data-send-task]');
    if (!button) return;
    guard(() => { if (button.dataset.sendTask) sendTask(button); else void follow(button); });
  });
}
