import { readJson } from './api.mjs';
import { registerEvents } from './events.mjs';
import { escapeHtml } from './format.mjs';
import { activePage, answerIds, ensureSelection, isProjectView, state } from './state.mjs';
import { addProjectFormMarkup, welcomeMarkup } from './views/add-project.mjs';
import { answerDetailMarkup } from './views/answer.mjs';
import { overviewMarkup } from './views/overview.mjs';
import { pageHeaderMarkup, sidebarMarkup, toolbarMarkup } from './views/page.mjs';
import { pageReportMarkup } from './views/report.mjs';
import { screensMarkup } from './views/screens.mjs';
import { suggestionsReviewMarkup, syncSuggestionsState } from './views/suggestions.mjs';
import { syncQaState } from './views/tests.mjs';
import { syncVisualState } from './views/visual.mjs';
import { worksMarkup } from './views/works.mjs';

export const app = document.querySelector('#app');

// The report is the page's home; each answer and the full screenshots open from it.
const pageViews = {
  report: page => `${pageHeaderMarkup(page)}${pageReportMarkup(page)}`,
  screens: screensMarkup,
  works: worksMarkup,
};

function pageViewMarkup(page) {
  const view = pageViews[state.view] ?? (answerIds.includes(state.view) ? answerDetailMarkup : pageViews.report);
  return view(page);
}

function projectViewMarkup() {
  if (state.view === 'overview') return overviewMarkup();
  if (state.view === 'add-project') return addProjectFormMarkup(false);
  return suggestionsReviewMarkup();
}

function pageContentMarkup(page) {
  if (isProjectView()) return projectViewMarkup();
  if (!page) return '<div class="workspace-empty"><h2>No pages yet</h2><p>Add the app’s address to find its pages.</p></div>';
  return pageViewMarkup(page);
}

function workspaceMarkup() {
  const page = activePage();
  return `<div class="app-window">${sidebarMarkup()}<main class="work-area">${toolbarMarkup()}<div class="page-workspace">${pageContentMarkup(page)}</div></main></div>`;
}

// A new view starts at its top, so its title and instructions are the first thing seen.
let shownView = '';

function scrollToTopOnNewView() {
  const view = `${state.project?.id}/${state.view}/${state.pageId}`;
  if (view !== shownView) window.scrollTo(0, 0);
  shownView = view;
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
  syncSuggestionsState();
  app.innerHTML = `${workspaceMarkup()}<div class="save-message" role="status">${escapeHtml(state.message)}</div>`;
  scrollToTopOnNewView();
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
  Object.assign(state, { answerEditing: false, questionsEditing: false, thingsEditing: false, addingThing: false, findingForm: null });
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
