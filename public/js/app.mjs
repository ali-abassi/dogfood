import { readJson } from './api.mjs';
import { registerEvents } from './events.mjs';
import { escapeHtml } from './format.mjs';
import { activePage, ensureSelection, state } from './state.mjs';
import { addProjectFormMarkup, welcomeMarkup } from './views/add-project.mjs';
import { findingsMarkup } from './views/issues.mjs';
import { captureMarkup, pageHeaderMarkup, qaCompletionMarkup, sidebarMarkup, toolbarMarkup } from './views/page.mjs';
import { overviewMarkup } from './views/overview.mjs';
import { reviewMarkup } from './views/review.mjs';
import { auditMarkup } from './views/safety.mjs';
import { seePageMarkup, syncVisualState } from './views/see-page.mjs';
import { qaMarkup, syncQaState } from './views/tests.mjs';

export const app = document.querySelector('#app');

function activeViewMarkup(page) {
  if (state.view === 'review') return reviewMarkup(page);
  if (state.view === 'risk') return `<section class="inspector content-panel" aria-label="Risk and connections">${auditMarkup(page)}</section>`;
  if (state.view === 'findings') return `<section class="inspector content-panel" aria-label="Issues">${findingsMarkup(page)}</section>`;
  return qaMarkup(page);
}

function pageContentMarkup(page) {
  if (state.view === 'overview') return overviewMarkup();
  if (state.view === 'add-project') return addProjectFormMarkup(false);
  if (!page) return '<div class="workspace-empty"><h2>No pages yet</h2><p>No pages have been added to this project.</p></div>';
  if (state.view === 'capture') return `${pageHeaderMarkup(page)}${qaCompletionMarkup(page)}${seePageMarkup(page)}`;
  return `${pageHeaderMarkup(page)}${qaCompletionMarkup(page)}<div class="view-grid">${activeViewMarkup(page)}${captureMarkup(page)}</div>`;
}

function workspaceMarkup() {
  const page = activePage();
  return `<div class="app-window">${sidebarMarkup()}<main class="work-area">${toolbarMarkup(page)}<div class="page-workspace">${pageContentMarkup(page)}</div></main></div>`;
}

export function render() {
  if (!state.project && !state.projects.length) {
    app.innerHTML = `${welcomeMarkup()}<div class="save-message" role="status"></div>`;
    return;
  }
  if (!state.project) return;
  ensureSelection();
  syncQaState();
  syncVisualState();
  app.innerHTML = `${workspaceMarkup()}<div class="save-message" role="status">${escapeHtml(state.message)}</div>`;
}

export function showError(message) {
  app.innerHTML = `<div class="boot error" role="alert"><h1>dogfood could not open</h1><p>${escapeHtml(message)}</p><button type="button" id="retry">Retry</button></div>`;
}

export async function loadProject(id) {
  state.project = await readJson(`/api/projects/${encodeURIComponent(id)}`);
  rememberProject(id);
  state.pageId = null;
  state.view = 'overview';
  state.query = '';
  state.filter = 'all';
  state.sort = 'navigation';
  state.browseOpen = false;
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.scan = { key: '', running: false, error: '' };
  state.scanAll = { running: false, total: null, scanned: 0, current: '', error: '' };
  state.onboarding = { job: '', running: false, total: null, scanned: 0, current: null, error: '' };
  state.projectDraft = { url: '', name: '', browserProfile: '' };
  state.qa.key = '';
  state.visual.key = '';
  state.message = '';
  render();
}

export async function start() {
  try {
    state.projects = await readJson('/api/projects');
    if (!state.projects.length) {
      state.project = null;
      state.view = 'add-project';
      render();
      return;
    }
    await loadProject(rememberedProjectId() ?? state.projects[0].id);
  } catch (error) { showError(error.message); }
}

// The last project opened in this browser; storage can be unavailable (private windows), so it is only a convenience.
function rememberedProjectId() {
  try {
    const id = localStorage.getItem('dogfood:project');
    return state.projects.some(project => project.id === id) ? id : null;
  } catch { return null; }
}

function rememberProject(id) {
  try { localStorage.setItem('dogfood:project', id); }
  catch { /* Remembering the project is optional. */ }
}

registerEvents();
start();
