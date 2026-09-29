import { readJson } from './api.mjs';
import { addCompetitor, removeOpenCompetitor, rescanOpenCompetitor, summarizeOpenCompetitor } from './views/competitors.mjs';
import { fitDocFrame } from './views/docs.mjs';
import { app, loadProject, render, showError, start } from './app.mjs';
import { answerIds, state, menuPages, activePage } from './state.mjs';
import { agentPrompt, idleOnboarding, submitOnboarding } from './views/add-project.mjs';
import { saveAnswer, saveQuestions, saveThings } from './views/answer.mjs';
import { handleFindingButton, resolveFinding, saveFinding } from './views/issues.mjs';
import { scanAllPages } from './views/overview.mjs';
import { pageOptionsMarkup } from './views/page.mjs';
import { addProjectSuggestions, openProjectSuggestions, reloadProjectSuggestions, updateProjectSuggestionsButton } from './views/suggestions.mjs';
import { runQa } from './views/tests.mjs';
import { addSuggestedFeatures, runVisualReview, updateSuggestedButton } from './views/visual.mjs';
import { addThing } from './views/works.mjs';

async function scanActivePage() {
  const page = activePage();
  const key = `${state.project.id}/${page.id}`;
  if (state.scan.running) return;
  state.scan = { key, running: true, error: '' };
  render();
  try {
    const project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/scan`, { method: 'POST' });
    if (project.id === state.project.id) state.project = project;
    await reloadProjectSuggestions();
    state.scan = { key, running: false, error: '' };
    state.visual.key = '';
    state.history.key = '';
    state.message = 'Checked the page';
  } catch (error) { state.scan = { key, running: false, error: error.message }; }
  render();
}

// Fix-first rows name their page and view; every other page jump opens the report.
const pageJumpViews = ['report', 'screens', 'works', ...answerIds];

function selectPage(id, view = 'report') {
  const name = pageJumpViews.includes(view) ? view : 'report';
  closeEditors();
  Object.assign(state, { pageId: id, view: name, browseOpen: false, query: '', filter: 'all', message: '' });
  render();
  document.querySelector(name === 'report' ? '#selected-page-heading' : '#answer-heading')?.focus({ preventScroll: true });
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
    await reloadProjectSuggestions();
    render();
  } catch (error) {
    const box = form.querySelector('#remove-page-error');
    box.hidden = false;
    box.textContent = error.message;
  }
}

function selectProjectView(view) {
  Object.assign(state, { view, browseOpen: false, message: '' });
  render();
  restoreFocus(`[data-project-view="${view}"]`);
}

function selectOverview() {
  selectProjectView('overview');
}

function selectFilter(filter) {
  closeEditors();
  Object.assign(state, { filter, message: '' });
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

const editorSelector = '#answer-form, #questions-form, #things-form, #add-thing-form, #finding-form, #resolution-form, #remove-page-form';
let keyboardInput = false;

// Programmatic focus is for keyboard users; after a mouse click it would leave a stray ring.
function restoreFocus(selector) {
  if (keyboardInput) document.querySelector(selector)?.focus({ preventScroll: true });
}

function closeEditors() {
  Object.assign(state, { answerEditing: false, questionsEditing: false, thingsEditing: false, addingThing: false, findingForm: null, removingPage: null });
}

// An unchanged editor closes quietly; one with changes asks to save or discard at the form itself.
function blockOpenFormNavigation() {
  const form = document.querySelector(editorSelector);
  if (!form) return false;
  if (form.dataset.dirty !== 'true') {
    closeEditors();
    render();
    return false;
  }
  showUnsavedPrompt(form);
  return true;
}

function showUnsavedPrompt(form) {
  if (!form.querySelector('.unsaved-prompt')) {
    form.insertAdjacentHTML('afterbegin', '<div class="unsaved-prompt" role="alert"><span>You have unsaved changes.</span><button type="submit" class="unsaved-save">Save changes</button><button type="button" class="text-button" data-action="discard-changes">Discard</button></div>');
  }
  form.scrollIntoView({ block: 'nearest' });
  form.querySelector('.unsaved-save')?.focus({ preventScroll: true });
}

function discardChanges() {
  closeEditors();
  state.message = 'Discarded your changes.';
  render();
}

function markDirty(target) {
  if (target.form?.matches(editorSelector)) target.form.dataset.dirty = 'true';
}

function openAddProject() {
  if (blockOpenFormNavigation()) return;
  state.view = 'add-project';
  state.browseOpen = false;
  state.onboarding = { ...idleOnboarding };
  render();
  document.querySelector('#product-url')?.focus();
}

// Opens one inline editor, closing any other, and puts the cursor in its first field.
function openEditor(flag, selector) {
  closeEditors();
  state[flag] = true;
  render();
  document.querySelector(selector)?.focus({ preventScroll: true });
}

// Cancel keeps what someone typed unless they choose to discard it.
function promptIfChanged() {
  const form = document.querySelector(editorSelector);
  if (form?.dataset.dirty !== 'true') return false;
  showUnsavedPrompt(form);
  return true;
}

function closeEditor(flag, selector) {
  if (promptIfChanged()) return;
  state[flag] = false;
  render();
  restoreFocus(selector);
}

// Back leaves the answer and returns to the report with the reader's place kept.
function backToReport() {
  if (blockOpenFormNavigation()) return;
  const from = state.view;
  closeEditors();
  Object.assign(state, { view: 'report', message: '' });
  render();
  restoreFocus(`[data-answer-row="${from}"]`);
}

function openScreens() {
  if (blockOpenFormNavigation()) return;
  Object.assign(state, { view: 'screens', screensDevice: 'desktop', message: '' });
  render();
  restoreFocus('#answer-heading');
}

async function copyAgentPrompt() {
  try {
    await navigator.clipboard.writeText(agentPrompt);
    state.copied = true;
  } catch { state.message = 'Select the sentence and copy it.'; }
  render();
  restoreFocus('[data-action="copy-agent-prompt"]');
}

const buttonActions = new Map([
  ['open-pages', openPages],
  ['close-pages', closePages],
  ['back-to-report', backToReport],
  ['view-screens', openScreens],
  ['screens-device', button => { state.screensDevice = button.dataset.screensDevice; render(); restoreFocus(`[data-screens-device="${state.screensDevice}"]`); }],
  ['history-day', button => { state.history.day = button.dataset.day; render(); restoreFocus(`[data-day="${button.dataset.day}"]`); }],
  ['edit-answer', () => openEditor('answerEditing', '#answer-form input[name="status"]')],
  ['cancel-answer', () => closeEditor('answerEditing', '[data-action="edit-answer"]')],
  ['answer-questions', () => openEditor('questionsEditing', '#questions-form select')],
  ['cancel-questions', () => closeEditor('questionsEditing', '[data-action="answer-questions"]')],
  ['edit-things', () => openEditor('thingsEditing', '#things-form select')],
  ['cancel-things', () => closeEditor('thingsEditing', '[data-action="edit-things"]')],
  ['add-thing', () => openEditor('addingThing', '#thing-name')],
  ['cancel-add-thing', () => closeEditor('addingThing', '[data-action="add-thing"]')],
  ['copy-agent-prompt', copyAgentPrompt],
  ['run-qa', runQa],
  ['run-visual', runVisualReview],
  ['add-suggested-features', addSuggestedFeatures],
  ['review-suggestions', openProjectSuggestions],
  ['retry-suggestions', () => reloadProjectSuggestions()],
  ['add-project-suggestions', addProjectSuggestions],
  ['cancel-project-suggestions', selectOverview],
  ['scan', scanActivePage],
  ['scan-all', scanAllPages],
  ['add-project', openAddProject],
  ['remove-page', openRemovePage],
  ['cancel-remove-page', () => { if (promptIfChanged()) return; state.removingPage = null; render(); restoreFocus('[data-action="remove-page"]'); }],
  ['cancel-add-project', () => { state.view = 'overview'; render(); }],
  ['discard-changes', discardChanges],
  ['open-competitor', button => { Object.assign(state.competitors, { open: button.dataset.competitorId, removing: '', error: '' }); render(); window.scrollTo(0, 0); restoreFocus('#competitor-heading'); }],
  ['close-competitor', () => { const id = state.competitors.open; Object.assign(state.competitors, { open: '', removing: '', error: '' }); render(); restoreFocus(`[data-competitor-id="${id}"]`); }],
  ['scan-competitor', rescanOpenCompetitor],
  ['summarize-competitor', summarizeOpenCompetitor],
  ['remove-competitor', () => { state.competitors.removing = state.competitors.open; render(); restoreFocus('[data-action="cancel-remove-competitor"]'); }],
  ['cancel-remove-competitor', () => { state.competitors.removing = ''; render(); restoreFocus('[data-action="remove-competitor"]'); }],
  ['confirm-remove-competitor', removeOpenCompetitor],
]);

function navigationRequested(button) {
  return button.dataset.page || button.dataset.view || button.dataset.projectView;
}

function selectView(name) {
  if (!answerIds.includes(name)) return;
  closeEditors();
  Object.assign(state, { view: name, message: '' });
  render();
  restoreFocus('#answer-heading');
}

function handleNavigationButton(button) {
  if (button.dataset.projectView) { selectProjectView(button.dataset.projectView); return true; }
  if (button.dataset.page) { selectPage(button.dataset.page, button.dataset.view); return true; }
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
  if (list) list.innerHTML = pageOptionsMarkup(menuPages());
}

function handleProjectSelection(select) {
  if (blockOpenFormNavigation()) { select.value = state.project.id; return; }
  loadProject(select.value).then(() => restoreFocus('#project-select'), error => showError(error.message));
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
  ['answer-form', saveAnswer],
  ['questions-form', saveQuestions],
  ['things-form', saveThings],
  ['add-thing-form', addThing],
  ['finding-form', saveFinding],
  ['resolution-form', resolveFinding],
  ['add-project-form', submitOnboarding],
  ['remove-page-form', submitRemovePage],
  ['competitor-form', addCompetitor],
]);

function handleSuggestionToggle(target) {
  if (target.name === 'suggested-feature') updateSuggestedButton();
  if (target.name === 'project-suggestion') updateProjectSuggestionsButton();
}

function handleBugButton(button) {
  if (button.dataset.findingAction === 'cancel' && promptIfChanged()) return;
  handleFindingButton(button);
}

export function registerEvents() {
  // Frame loads do not bubble, so the design guide's frame is sized from the capture phase.
  app.addEventListener('load', event => { if (event.target.matches?.('iframe.doc-frame')) fitDocFrame(event.target); }, true);
  window.addEventListener('resize', () => document.querySelectorAll('iframe.doc-frame').forEach(fitDocFrame));
  app.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'retry') return start();
    if (button.dataset.findingAction) return handleBugButton(button);
    handleButton(button);
  });

  app.addEventListener('change', event => {
    markDirty(event.target);
    if (event.target.id === 'project-select') return handleProjectSelection(event.target);
    if (event.target.id === 'page-filter') return handlePageFilter(event.target);
    if (event.target.id === 'page-sort') return handlePageSort(event.target);
    handleSuggestionToggle(event.target);
  });

  app.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.browseOpen && matchMedia('(max-width: 760px)').matches) closePages();
  });
  // A screenshot file that is gone says so, instead of showing a broken image.
  app.addEventListener('error', event => {
    if (!event.target.matches?.('img[data-screenshot]')) return;
    event.target.closest('figure')?.querySelector('figcaption a')?.remove();
    event.target.replaceWith(Object.assign(document.createElement('p'), { className: 'screen-missing', textContent: 'This screenshot is missing. Check the page again to take a new one.' }));
  }, true);
  // The page knows whether the last input was a key or a pointer, so styles can hide focus rings after clicks.
  document.addEventListener('keydown', () => { keyboardInput = true; document.documentElement.dataset.input = 'keyboard'; }, true);
  document.addEventListener('pointerdown', () => { keyboardInput = false; document.documentElement.dataset.input = 'pointer'; }, true);

  app.addEventListener('input', event => {
    markDirty(event.target);
    if (event.target.id !== 'page-search') return;
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
