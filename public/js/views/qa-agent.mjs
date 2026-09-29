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

function minutesUntilAnotherRun(run) {
  return Math.ceil((watchMs - (Date.now() - Date.parse(run.startedAt))) / 60_000);
}

function askMarkup(page, run) {
  const starting = state.qaAgent.starting === page.id;
  const waiting = recent(run);
  const label = waiting ? 'Recent start recorded' : starting ? 'Starting…' : 'Ask the QA agent';
  return `<div class="qa-agent"><button type="button" class="text-button" data-action="start-qa-agent" title="A QA agent checks what this page still needs and records it here" ${starting || waiting ? 'disabled' : ''}>${label}</button>${errorMarkup()}</div>`;
}

// Offered on a page that is not complete, when this dogfood has a QA agent set up (DOGFOOD_QA_AGENT).
export function qaAgentMarkup(page) {
  if (!state.qaAgent.configured || page.progress.complete) return '';
  const run = runFor(page);
  return `${qaRunHistoryMarkup(run)}${askMarkup(page, run)}`;
}

function qaRunHistoryMarkup(run) {
  if (!run?.startedAt) return '';
  const cooldown = recent(run) ? ` · another run available in ${minutesUntilAnotherRun(run)} min` : '';
  return `<p class="qa-agent-status" role="status">QA agent started ${escapeHtml(startedWords(run))} · current status unknown${cooldown}</p>`;
}

async function refreshProject() {
  refreshTimer = null;
  if (!state.project || !recent(runFor(activePage() ?? {}))) return;
  state.project = await readJson(`/api/projects/${encodeURIComponent(state.project.id)}`);
  render();
}

function watchRecentRun() {
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
  watchRecentRun();
}

export async function startQaAgent() {
  const page = activePage();
  if (recent(runFor(page))) return;
  Object.assign(state.qaAgent, { starting: page.id, error: '' });
  render();
  try {
    const status = await readJson(endpoint(`/pages/${encodeURIComponent(page.id)}`), { method: 'POST' });
    Object.assign(state.qaAgent, status);
    state.message = 'QA agent start recorded';
  } catch (error) { state.qaAgent.error = error.message; }
  state.qaAgent.starting = '';
  render();
}
