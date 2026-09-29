import { readJson } from '../api.mjs';
import { escapeHtml, plural } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

// Keep choices by content, since a refreshed list can reorder or remove items.
const choices = new Map();
let adding = false;
let addError = '';

function choiceKey(page, item) {
  return JSON.stringify([page, item.name, item.expected]);
}

function rememberChoices() {
  for (const box of document.querySelectorAll('input[name="project-suggestion"]')) {
    choices.set(box.dataset.choice, box.checked);
  }
}

function selectedCount() {
  return state.suggestions.items.reduce((total, entry) => total + entry.suggestions.filter(item => choices.get(choiceKey(entry.page, item)) !== false).length, 0);
}

function suggestionTotals() {
  const items = state.suggestions.items;
  return { count: items.reduce((sum, entry) => sum + entry.suggestions.length, 0), pages: items.length };
}

export function suggestionsWaitingMarkup() {
  const { count, pages } = suggestionTotals();
  if (state.suggestions.error) return `<p class="form-error" role="alert">Could not load the AI’s suggestions. ${escapeHtml(state.suggestions.error)} <button type="button" class="link-button" data-action="retry-suggestions">Try again</button></p>`;
  if (!count) return '';
  return `<p class="suggestions-waiting" data-suggestions-waiting>The AI suggested ${escapeHtml(plural(count, 'thing', 'things'))} people can do on ${escapeHtml(plural(pages, 'page', 'pages'))}. <button type="button" class="text-button" data-action="review-suggestions">Review</button></p>`;
}

function projectSuggestionMarkup(page, item, index) {
  const key = choiceKey(page, item);
  return `<label class="suggested-feature"><input type="checkbox" name="project-suggestion" value="${escapeHtml(page)}:${index}" data-choice="${escapeHtml(key)}" ${choices.get(key) === false ? '' : 'checked'} ${adding ? 'disabled' : ''}><span><strong>${escapeHtml(item.name)}</strong><small><span class="suggestion-expected-label">Should happen:</span> ${escapeHtml(item.expected)}</small></span></label>`;
}

function suggestionPageMarkup(entry) {
  const stale = entry.stale ? '<p class="stale-note">From an AI check of older screenshots</p>' : '';
  const boxes = entry.suggestions.map((item, index) => projectSuggestionMarkup(entry.page, item, index)).join('');
  return `<section class="suggestion-page-group content-panel" data-suggestion-page="${escapeHtml(entry.page)}"><h2>${escapeHtml(entry.name)} <small>${escapeHtml(entry.group)}</small></h2>${stale}<div class="suggested-list">${boxes}</div></section>`;
}

// While the list is read again, the cached one stays with a line saying so.
function addDisabled(count) {
  return !count || state.suggestions.loading || adding;
}

function suggestionsListMarkup() {
  const count = selectedCount();
  const disabled = addDisabled(count);
  const rereading = state.suggestions.loading ? '<p class="muted" role="status">Checking for new suggestions…</p>' : '';
  return `${rereading}${state.suggestions.items.map(suggestionPageMarkup).join('')}<div class="form-actions"><button type="button" class="save-button" data-action="add-project-suggestions" ${disabled ? 'disabled' : ''}>${adding ? 'Adding…' : `Add ${escapeHtml(plural(count, 'thing', 'things'))}`}</button><button type="button" class="text-button" data-action="cancel-project-suggestions" ${adding ? 'disabled' : ''}>Back to overview</button></div>`;
}

function suggestionsBodyMarkup(count) {
  const error = suggestionsErrorMarkup(count);
  if (state.suggestions.loading && !count) return '<p class="muted" role="status">Loading suggestions…</p>';
  if (!count) return error || '<p class="muted">Nothing is waiting. The AI suggests what people can do on a page each time it checks one.</p>';
  return `${error}${suggestionsListMarkup()}`;
}

function suggestionsErrorMarkup(count) {
  if (addError) return `<p class="form-error" role="alert">Could not add the selected things. ${escapeHtml(addError)} Your choices are kept; try Add again.</p>`;
  if (!state.suggestions.error) return '';
  const kept = count ? 'Your choices are kept in the last loaded list below. ' : '';
  return `<p class="form-error" role="alert">Could not load the AI’s suggestions. ${escapeHtml(state.suggestions.error)} ${kept}<button type="button" class="link-button" data-action="retry-suggestions">Try again</button></p>`;
}

export function suggestionsReviewMarkup() {
  const { count, pages } = suggestionTotals();
  const scope = count ? `<p class="suggestions-scope">${escapeHtml(plural(count, 'thing', 'things'))} on ${escapeHtml(plural(pages, 'page', 'pages'))}</p>` : '';
  return `<section class="suggestions-review" aria-label="Review suggested things to do">
    <button type="button" class="back-button" data-action="cancel-project-suggestions" ${adding ? 'disabled' : ''}>‹ Overview</button>
    <header class="suggestions-heading"><h1 id="suggestions-heading" tabindex="-1">What people can do on each page</h1><p>The AI suggested these from the screenshots. Keep the useful outcomes checked, then add them to your checks. Adding a suggestion does not mean it works.</p>${scope}</header>
    ${suggestionsBodyMarkup(count)}
    ${count ? '' : '<button type="button" class="text-button" data-action="cancel-project-suggestions">Back to overview</button>'}
  </section>`;
}

// Opening the review reads the list again, since an agent may have added some of it meanwhile.
export function openProjectSuggestions() {
  choices.clear();
  addError = '';
  state.view = 'suggestions';
  state.message = '';
  render();
  document.querySelector('#suggestions-heading')?.focus({ preventScroll: true });
  void reloadProjectSuggestions();
}

export function updateProjectSuggestionsButton() {
  const button = document.querySelector('[data-action="add-project-suggestions"]');
  if (!button) return;
  rememberChoices();
  const count = document.querySelectorAll('input[name="project-suggestion"]:checked').length;
  button.textContent = `Add ${plural(count, 'thing', 'things')}`;
  button.disabled = addDisabled(count);
}

function checkedProjectSuggestions() {
  const byPage = new Map(state.suggestions.items.map(entry => [entry.page, entry.suggestions]));
  const picked = [];
  for (const box of document.querySelectorAll('input[name="project-suggestion"]:checked')) {
    const [page, index] = box.value.split(':');
    const item = byPage.get(page)?.[Number(index)];
    if (item) picked.push({ page, name: item.name, expected: item.expected });
  }
  return picked;
}

function groupByPage(picked) {
  const pages = {};
  for (const { page, name, expected } of picked) {
    (pages[page] ??= []).push({ name, expected });
  }
  return pages;
}

// A failed refresh keeps the previous items and says so, so a blip never hides waiting work.
function renderSuggestionsFor(id) {
  if (suggestionsVisibleFor(id)) render();
}

function recordRefreshError(id, error) {
  if (state.suggestions.key !== id) return false;
  rememberChoices();
  state.suggestions.error = error.message;
  return true;
}

export async function reloadProjectSuggestions() {
  if (!state.project) return;
  const id = state.project.id;
  rememberChoices();
  Object.assign(state.suggestions, { key: id, loading: true, error: '' });
  renderSuggestionsFor(id);
  try {
    const items = await readJson(`/api/projects/${encodeURIComponent(id)}/suggestions`);
    if (state.suggestions.key !== id) return;
    rememberChoices();
    state.suggestions.items = items;
  } catch (error) {
    if (!recordRefreshError(id, error)) return;
  }
  state.suggestions.loading = false;
  renderSuggestionsFor(id);
}

function suggestionsVisibleFor(id) {
  return state.project?.id === id && ['overview', 'suggestions'].includes(state.view);
}

export function syncSuggestionsState() {
  if (!state.project || state.suggestions.key === state.project.id) return;
  choices.clear();
  addError = '';
  state.suggestions = { key: state.project.id, loading: true, items: [], error: '' };
  void reloadProjectSuggestions();
}

export async function addProjectSuggestions() {
  const picked = checkedProjectSuggestions();
  if (!picked.length || adding || state.suggestions.loading) return;
  rememberChoices();
  adding = true;
  addError = '';
  render();
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: groupByPage(picked) }),
    });
    const addedPages = new Set(picked.map(item => item.page)).size;
    state.message = `Added ${plural(picked.length, 'thing', 'things')} to ${plural(addedPages, 'page', 'pages')}`;
    await reloadProjectSuggestions();
    state.view = 'overview';
  } catch (error) { addError = error.message; }
  adding = false;
  render();
}
