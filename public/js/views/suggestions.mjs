import { readJson } from '../api.mjs';
import { escapeHtml, plural } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

function suggestionTotals() {
  const items = state.suggestions.items;
  return { count: items.reduce((sum, entry) => sum + entry.suggestions.length, 0), pages: items.length };
}

export function suggestionsWaitingMarkup() {
  const { count, pages } = suggestionTotals();
  if (state.suggestions.error) return `<p class="form-error" role="alert">Could not load the AI’s suggestions: ${escapeHtml(state.suggestions.error)}</p>`;
  if (!count) return '';
  return `<p class="suggestions-waiting" data-suggestions-waiting>The AI suggested ${escapeHtml(plural(count, 'thing', 'things'))} people can do on ${escapeHtml(plural(pages, 'page', 'pages'))}. <button type="button" class="text-button" data-action="review-suggestions">Review</button></p>`;
}

function projectSuggestionMarkup(page, item, index) {
  return `<label class="suggested-feature"><input type="checkbox" name="project-suggestion" value="${escapeHtml(page)}:${index}" checked><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.expected)}</small></span></label>`;
}

function suggestionPageMarkup(entry) {
  const stale = entry.stale ? '<p class="stale-note">From an AI check of older screenshots</p>' : '';
  const boxes = entry.suggestions.map((item, index) => projectSuggestionMarkup(entry.page, item, index)).join('');
  return `<section class="suggestion-page-group content-panel" data-suggestion-page="${escapeHtml(entry.page)}"><h2>${escapeHtml(entry.name)} <small>${escapeHtml(entry.group)}</small></h2>${stale}<div class="suggested-list">${boxes}</div></section>`;
}

export function suggestionsReviewMarkup() {
  const { count } = suggestionTotals();
  const groups = state.suggestions.items.map(suggestionPageMarkup).join('');
  return `<section class="suggestions-review" aria-label="Review suggested features">
    <header class="suggestions-heading"><h1 id="suggestions-heading" tabindex="-1">What people can do on each page</h1><p>The AI suggested these from the screenshots. Untick anything that is wrong, then add the rest to check.</p></header>
    ${groups}
    <div class="form-actions"><button type="button" class="save-button" data-action="add-project-suggestions">Add ${escapeHtml(plural(count, 'thing', 'things'))}</button><button type="button" class="text-button" data-action="cancel-project-suggestions">Back to overview</button></div>
  </section>`;
}

export function openProjectSuggestions() {
  state.view = 'suggestions';
  state.message = '';
  render();
  document.querySelector('#suggestions-heading')?.focus({ preventScroll: true });
}

export function updateProjectSuggestionsButton() {
  const button = document.querySelector('[data-action="add-project-suggestions"]');
  if (!button) return;
  const count = document.querySelectorAll('input[name="project-suggestion"]:checked').length;
  button.textContent = `Add ${plural(count, 'thing', 'things')}`;
  button.disabled = count === 0;
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
export async function reloadProjectSuggestions() {
  if (!state.project) return;
  const id = state.project.id;
  Object.assign(state.suggestions, { key: id, loading: true, error: '' });
  try {
    state.suggestions.items = await readJson(`/api/projects/${encodeURIComponent(id)}/suggestions`);
  } catch (error) { state.suggestions.error = error.message; }
  state.suggestions.loading = false;
  if (suggestionsVisibleFor(id)) render();
}

function suggestionsVisibleFor(id) {
  return state.project?.id === id && ['overview', 'suggestions'].includes(state.view);
}

export function syncSuggestionsState() {
  if (!state.project || state.suggestions.key === state.project.id) return;
  state.suggestions = { key: state.project.id, loading: true, items: [], error: '' };
  void reloadProjectSuggestions();
}

export async function addProjectSuggestions(button) {
  const picked = checkedProjectSuggestions();
  if (!picked.length) return;
  button.disabled = true;
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: groupByPage(picked) }),
    });
    const addedPages = new Set(picked.map(item => item.page)).size;
    state.message = `Added ${plural(picked.length, 'thing', 'things')} to ${plural(addedPages, 'page', 'pages')}`;
    await reloadProjectSuggestions();
    if (!suggestionTotals().count) state.view = 'overview';
  } catch (error) { state.message = error.message; }
  render();
}
