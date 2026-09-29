import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { activePage, state } from '../state.mjs';
import { render } from '../app.mjs';

// While a QA agent works (up to half an hour after it starts), the page reloads its evidence as the agent records it.
const watchMs = 30 * 60_000;
const refreshMs = 20_000;
let refreshTimer = null;

function endpoint(path = '') {
  return `/api/projects/${encodeURIComponent(state.project.id)}${path}/qa-agent`;
}

function runFor(page) {
  return state.qaAgent.runs[page.id] ?? null;
}

function working(run) {
  return Boolean(run) && Date.now() - Date.parse(run.startedAt) < watchMs;
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
  if (!working(run)) return askMarkup(page);
  return `<p class="qa-agent-status" role="status" title="What it records shows up here as it works"><span class="qa-agent-dot" aria-hidden="true"></span>QA agent working · started ${escapeHtml(startedWords(run))}</p>${errorMarkup()}`;
}

async function refreshProject() {
  refreshTimer = null;
  if (!state.project || !working(runFor(activePage() ?? {}))) return;
  state.project = await readJson(`/api/projects/${encodeURIComponent(state.project.id)}`);
  render();
}

function watchWhileWorking() {
  const page = activePage();
  if (refreshTimer || !page || !working(runFor(page))) return;
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
