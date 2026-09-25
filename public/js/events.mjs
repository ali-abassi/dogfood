import { readJson, visualEndpoint } from './api.mjs';
import { app, loadProject, render, showError, start } from './app.mjs';
import { plural } from './format.mjs';
import { activePage, defaultView, state, visiblePages } from './state.mjs';
import { idleOnboarding, submitOnboarding } from './views/add-project.mjs';
import { handleFindingButton, resolveFinding, saveFinding } from './views/issues.mjs';
import { scanAllPages } from './views/overview.mjs';
import { pageOptionsMarkup } from './views/page.mjs';
import { saveReview } from './views/review.mjs';
import { addAuditRow, addConnectionRow, closeAuditEditor, openAuditEditor, removeAuditRow, saveAudit } from './views/safety.mjs';
import { remainingSuggestions } from './views/see-page.mjs';
import { runQa } from './views/tests.mjs';

function visualRunAllowed() {
  return state.visual.key && !state.visual.loading && !state.visual.running;
}

async function runVisualReview() {
  const key = state.visual.key;
  if (!visualRunAllowed()) return;
  state.visual = { ...state.visual, running: true, error: '' };
  render();
  let result = null;
  let error = '';
  try {
    result = await readJson(visualEndpoint(key), { method: 'POST' });
  } catch (failure) { error = failure.message; }
  finishVisualReview(key, result, error);
}

function finishVisualReview(key, result, error) {
  if (state.visual.key !== key) return;
  state.visual = { ...state.visual, running: false, result: result || state.visual.result, error };
  if (state.view === 'capture') render();
}

function checkedSuggestions(page) {
  const remaining = remainingSuggestions(page, state.visual.result?.review);
  return [...document.querySelectorAll('input[name="suggested-feature"]:checked')].map(box => remaining[Number(box.value)]).filter(item => item);
}

async function addSuggestedFeatures(button) {
  const page = activePage();
  const checked = checkedSuggestions(page);
  if (!checked.length) return;
  button.disabled = true;
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: checked.map(item => ({ name: item.name, expected: item.expected })) }),
    });
    state.message = `Added ${plural(checked.length, 'feature', 'features')} to ${page.name}`;
  } catch (error) { state.message = error.message; }
  render();
}

function updateSuggestedButton() {
  const button = document.querySelector('[data-action="add-suggested-features"]');
  if (!button) return;
  const count = document.querySelectorAll('input[name="suggested-feature"]:checked').length;
  button.textContent = `Add ${plural(count, 'feature', 'features')}`;
  button.disabled = count === 0;
}

async function scanActivePage() {
  const page = activePage();
  const key = `${state.project.id}/${page.id}`;
  if (state.scan.running) return;
  state.scan = { key, running: true, error: '' };
  render();
  try {
    const project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/scan`, { method: 'POST' });
    if (project.id === state.project.id) state.project = project;
    state.scan = { key, running: false, error: '' };
    state.visual.key = '';
  } catch (error) { state.scan = { key, running: false, error: error.message }; }
  render();
}

function selectPage(id) {
  state.pageId = id;
  state.view = defaultView(activePage());
  state.browseOpen = false;
  state.query = '';
  state.filter = 'all';
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.removingPage = null;
  state.message = '';
  render();
  document.querySelector('#selected-page-heading')?.focus();
}

function openRemovePage() {
  state.removingPage = state.pageId;
  render();
  document.querySelector('#remove-reason')?.focus();
}

// Removal needs a reason on record; on success the page is gone, so the overview opens.
async function submitRemovePage(form) {
  const page = activePage();
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: new FormData(form).get('reason') }),
    });
    Object.assign(state, { removingPage: null, pageId: null, view: 'overview', message: `Removed ${page.name}` });
    render();
  } catch (error) {
    const box = form.querySelector('#remove-page-error');
    box.hidden = false;
    box.textContent = error.message;
  }
}

function selectOverview() {
  state.view = 'overview';
  state.browseOpen = false;
  state.message = '';
  render();
  document.querySelector('[data-overview]')?.focus({ preventScroll: true });
}

function selectFilter(filter) {
  state.filter = filter;
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.message = '';
  render();
}

function openPages() {
  if (blockOpenFormNavigation()) return;
  state.browseOpen = true;
  document.querySelector('.page-sidebar')?.classList.add('open');
  document.querySelector('#page-search')?.focus();
}

function closePages() {
  state.browseOpen = false;
  document.querySelector('.page-sidebar')?.classList.remove('open');
  document.querySelector('.page-menu-toggle')?.focus();
}

function blockOpenFormNavigation() {
  if (!document.querySelector('#review-form, #audit-form, #finding-form, #resolution-form')) return false;
  state.message = 'Save or cancel the open form before changing pages or views.';
  document.querySelector('.save-message').textContent = state.message;
  return true;
}

function openAddProject() {
  if (blockOpenFormNavigation()) return;
  state.view = 'add-project';
  state.browseOpen = false;
  state.onboarding = { ...idleOnboarding };
  render();
  document.querySelector('#product-url')?.focus();
}

const buttonActions = new Map([
  ['open-pages', openPages],
  ['close-pages', closePages],
  ['edit', () => { state.editing = true; state.findingForm = null; render(); }],
  ['cancel', () => { state.editing = false; state.message = ''; render(); }],
  ['audit-edit', openAuditEditor],
  ['audit-cancel', closeAuditEditor],
  ['remove-row', removeAuditRow],
  ['add-check', button => addAuditRow(button.dataset.key)],
  ['add-connection', addConnectionRow],
  ['run-qa', runQa],
  ['run-visual', runVisualReview],
  ['add-suggested-features', addSuggestedFeatures],
  ['scan', scanActivePage],
  ['scan-all', scanAllPages],
  ['screenshot-device', button => { state.screenshotDevice = button.dataset.screenshotDevice; render(); }],
  ['add-project', openAddProject],
  ['remove-page', openRemovePage],
  ['cancel-remove-page', () => { state.removingPage = null; render(); }],
  ['cancel-add-project', () => { state.view = 'overview'; render(); }],
]);

function navigationRequested(button) {
  return button.dataset.page || button.dataset.view || button.dataset.overview !== undefined;
}

function selectView(name) {
  state.view = name;
  if (name === 'capture') state.visual.key = '';
  state.message = '';
  render();
  document.querySelector(`[data-view="${name}"]`)?.focus({ preventScroll: true });
}

function handleNavigationButton(button) {
  if (button.dataset.overview !== undefined) { selectOverview(); return true; }
  if (button.dataset.page) { selectPage(button.dataset.page); return true; }
  if (!button.dataset.view) return false;
  selectView(button.dataset.view);
  return true;
}

function handleButton(button) {
  if (navigationRequested(button) && blockOpenFormNavigation()) return;
  if (handleNavigationButton(button)) return;
  buttonActions.get(button.dataset.action)?.(button);
}

function renderSidebarPageList() {
  const list = document.querySelector('.page-groups');
  if (list) list.innerHTML = pageOptionsMarkup(visiblePages());
}

function handleProjectSelection(select) {
  if (blockOpenFormNavigation()) { select.value = state.project.id; return; }
  loadProject(select.value).catch(error => showError(error.message));
}

function handlePageSort(select) {
  if (blockOpenFormNavigation()) { select.value = state.sort; return; }
  state.sort = select.value;
  render();
}

function handlePageFilter(select) {
  if (blockOpenFormNavigation()) { select.value = state.filter; return; }
  selectFilter(select.value);
}

const formHandlers = new Map([
  ['review-form', saveReview],
  ['finding-form', saveFinding],
  ['resolution-form', resolveFinding],
  ['audit-form', saveAudit],
  ['add-project-form', submitOnboarding],
  ['remove-page-form', submitRemovePage],
]);

export function registerEvents() {
  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'retry') return start();
    if (button.dataset.findingAction) return handleFindingButton(button);
    handleButton(button);
  });

  app.addEventListener('change', event => {
    if (event.target.id === 'project-select') return handleProjectSelection(event.target);
    if (event.target.id === 'page-filter') return handlePageFilter(event.target);
    if (event.target.id === 'page-sort') return handlePageSort(event.target);
    if (event.target.name === 'suggested-feature') updateSuggestedButton();
  });

  app.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.browseOpen && matchMedia('(max-width: 760px)').matches) closePages();
  });

  app.addEventListener('input', event => {
    if (event.target.id !== 'page-search') return;
    if (blockOpenFormNavigation()) { event.target.value = state.query; return; }
    state.query = event.target.value;
    renderSidebarPageList();
  });

  app.addEventListener('submit', event => {
    const handler = formHandlers.get(event.target.id);
    if (!handler) return;
    event.preventDefault();
    handler(event.target);
  });
}
