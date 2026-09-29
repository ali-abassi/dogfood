import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { activePage, state } from '../state.mjs';
import { render } from '../app.mjs';

// A recent start is worth watching for new evidence, but its timestamp does not prove the agent is still running.
const watchMs = 30 * 60_000;
const refreshMs = 20_000;
let refreshTimer = null;

function endpoint(path = '') {
  return `/api/projects/${encodeURIComponent(state.project.id)}${path}/qa-agent`;
}

function runFor(page) {
  return state.qaAgent.runs[page.id] ?? null;
}

function recent(run) {
  const started = Date.parse(run?.startedAt);
  return Number.isFinite(started) && Date.now() - started < watchMs;
}

function startedWords(run) {
  const minutes = Math.round((Date.now() - Date.parse(run.startedAt)) / 60_000);
  return minutes < 1 ? 'just now' : `${minutes} min ago`;
}

function errorMarkup() {
  return state.qaAgent.error ? `<p class="form-error" role="alert">${escapeHtml(state.qaAgent.error)}</p>` : '';
}

function askMarkup(page) {
  const starting = state.qaAgent.starting === page.id;
  return `<div class="qa-agent"><button type="button" class="text-button" data-action="start-qa-agent" title="A QA agent checks what this page still needs and records it here" ${starting ? 'disabled' : ''}>${starting ? 'Starting…' : 'Ask the QA agent'}</button>${errorMarkup()}</div>`;
}

// Offered on a page that is not complete, when this dogfood has a QA agent set up (DOGFOOD_QA_AGENT).
export function qaAgentMarkup(page) {
  if (!state.qaAgent.configured || page.progress.complete) return '';
  const run = runFor(page);
  const history = run?.startedAt ? `<p class="qa-agent-status" role="status">QA agent started ${escapeHtml(startedWords(run))} · current status unknown</p>` : '';
  return `${history}${askMarkup(page)}`;
}

async function refreshProject() {
  refreshTimer = null;
  if (!state.project || !recent(runFor(activePage() ?? {}))) return;
  state.project = await readJson(`/api/projects/${encodeURIComponent(state.project.id)}`);
  render();
}

function watchWhileWorking() {
  const page = activePage();
  if (refreshTimer || !page || !recent(runFor(page))) return;
  refreshTimer = setTimeout(() => void refreshProject().catch(() => {}), refreshMs);
}

async function loadQaAgent(projectId) {
  try {
    const status = await readJson(`/api/projects/${encodeURIComponent(projectId)}/qa-agent`);
    if (state.qaAgent.key === projectId) Object.assign(state.qaAgent, status);
  } catch (error) {
    if (state.qaAgent.key === projectId) state.qaAgent.error = error.message;
  }
  render();
}

// Loads once per project; then, while an agent works on the open page, keeps its evidence fresh.
export function syncQaAgentState() {
  if (!state.project) return;
  if (state.qaAgent.key !== state.project.id) {
    state.qaAgent = { key: state.project.id, configured: false, runs: {}, starting: '', error: '' };
    void loadQaAgent(state.project.id);
    return;
  }
  watchWhileWorking();
}

export async function startQaAgent() {
  const page = activePage();
  Object.assign(state.qaAgent, { starting: page.id, error: '' });
  render();
  try {
    const status = await readJson(endpoint(`/pages/${encodeURIComponent(page.id)}`), { method: 'POST' });
    Object.assign(state.qaAgent, status);
    state.message = 'The QA agent is on it';
  } catch (error) { state.qaAgent.error = error.message; }
  state.qaAgent.starting = '';
  render();
}
