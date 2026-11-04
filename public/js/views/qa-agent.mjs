import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { activePage, state } from '../state.mjs';
import { render } from '../app.mjs';

const refreshMs = 4000;
const activeStates = new Set(['running', 'todo']);
const statusWords = { running: 'Working', todo: 'Queued', attention: 'Needs you', review: 'Ready for review', done: 'Reviewed', legacy: 'Earlier launch; status unavailable' };
let refreshTimer = null;
function endpoint(path = '') { return `/api/projects/${encodeURIComponent(state.project.id)}${path}/qa-agent`; }
function runFor(page) { return state.qaAgent.runs[page.id] ?? null; }
function active(run) { return activeStates.has(run?.status); }
function errorMarkup() { return state.qaAgent.error ? `<p class="form-error" role="alert">${escapeHtml(state.qaAgent.error)}</p>` : ''; }

function askMarkup(page, run) {
  const starting = state.qaAgent.starting === page.id;
  const label = starting ? 'Starting…' : active(run) ? 'QA request working' : 'Ask the QA agent';
  return `<div class="qa-agent"><button type="button" class="text-button" data-action="start-qa-agent" title="Start a native page QA request with a durable conversation and result" ${starting || active(run) ? 'disabled' : ''}>${label}</button>${errorMarkup()}</div>`;
}

export function qaAgentMarkup(page) {
  if (!state.qaAgent.configured || page.progress.accepted) return '';
  const run = runFor(page);
  return `${qaRunHistoryMarkup(run)}${askMarkup(page, run)}`;
}

function qaRunHistoryMarkup(run) {
  if (!run) return '';
  const link = run.url ? ` · <a href="${escapeHtml(run.url)}">View QA request</a>` : '';
  const error = run.error ? ` · ${escapeHtml(run.error)}` : '';
  return `<p class="qa-agent-status" role="status">QA request: ${escapeHtml(statusWords[run.status] || 'Status unavailable')}${link}${error}</p>`;
}

async function refreshProject() {
  refreshTimer = null;
  if (!state.project || !active(runFor(activePage() ?? {}))) return;
  const projectId = state.project.id;
  const status = await readJson(`/api/projects/${encodeURIComponent(projectId)}/qa-agent`);
  if (state.project.id !== projectId) return;
  state.project = await readJson(`/api/projects/${encodeURIComponent(projectId)}`);
  Object.assign(state.qaAgent, status);
  render();
}

function watchActiveRun() {
  const page = activePage();
  if (refreshTimer || !page || !active(runFor(page))) return;
  refreshTimer = setTimeout(() => void refreshProject().catch(() => {}), refreshMs);
}

function renderLoadedStatus(projectId) { if (state.project?.id === projectId && state.view === 'report') render(); }
async function loadQaAgent(projectId) {
  try {
    const status = await readJson(`/api/projects/${encodeURIComponent(projectId)}/qa-agent`);
    if (state.qaAgent.key === projectId) Object.assign(state.qaAgent, status);
  } catch (error) {
    if (state.qaAgent.key === projectId) state.qaAgent.error = error.message;
  }
  renderLoadedStatus(projectId);
}

export function syncQaAgentState() {
  if (!state.project) return;
  if (state.qaAgent.key !== state.project.id) {
    state.qaAgent = { key: state.project.id, configured: false, runs: {}, starting: '', error: '' };
    void loadQaAgent(state.project.id);
    return;
  }
  watchActiveRun();
}

export async function startQaAgent() {
  const page = activePage();
  if (active(runFor(page))) return;
  Object.assign(state.qaAgent, { starting: page.id, error: '' });
  render();
  try {
    const status = await readJson(endpoint(`/pages/${encodeURIComponent(page.id)}`), { method: 'POST' });
    Object.assign(state.qaAgent, status);
    state.message = 'QA request created. Follow its progress in Agent board.';
  } catch (error) { state.qaAgent.error = error.message; }
  state.qaAgent.starting = '';
  render();
}
