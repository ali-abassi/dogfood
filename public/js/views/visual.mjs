import { readJson, visualEndpoint } from '../api.mjs';
import { plural } from '../format.mjs';
import { activePage, isProjectView, state } from '../state.mjs';
import { render } from '../app.mjs';
import { reloadProjectSuggestions } from './suggestions.mjs';
import { remainingSuggestions } from './works.mjs';

// The latest AI check of the open page: its notes feed the answer details and its suggestions feed Works.
export function syncVisualState() {
  if (isProjectView() || !state.pageId) return;
  const key = `${state.project.id}/${state.pageId}`;
  if (state.visual.key === key) return;
  state.visual = { key, loading: true, running: false, result: null, error: '' };
  void loadVisualReview(key);
}

async function loadVisualReview(key) {
  let result = null;
  let error = '';
  try {
    result = await readJson(visualEndpoint(key));
  } catch (failure) { error = failure.message; }
  if (state.visual.key !== key) return;
  state.visual = { ...state.visual, loading: false, result, error };
  render();
}

function visualRunAllowed() {
  return state.visual.key && !state.visual.loading && !state.visual.running;
}

// A finished check changes the answers, so the project is read again before rendering.
export async function runVisualReview() {
  const key = state.visual.key;
  if (!visualRunAllowed()) return;
  state.visual = { ...state.visual, running: true, error: '' };
  render();
  try {
    const result = await readJson(visualEndpoint(key), { method: 'POST' });
    state.project = await readJson(`/api/projects/${encodeURIComponent(state.project.id)}`);
    if (state.visual.key === key) state.visual = { ...state.visual, running: false, result };
    state.message = 'Checked with AI';
    void reloadProjectSuggestions();
  } catch (failure) {
    if (state.visual.key === key) state.visual = { ...state.visual, running: false, error: failure.message };
  }
  render();
}

function checkedSuggestions(page) {
  const remaining = remainingSuggestions(page, state.visual.result?.review);
  return [...document.querySelectorAll('input[name="suggested-feature"]:checked')].map(box => remaining[Number(box.value)]).filter(Boolean);
}

export async function addSuggestedFeatures(button) {
  const page = activePage();
  const checked = checkedSuggestions(page);
  if (!checked.length) return;
  button.disabled = true;
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: checked.map(item => ({ name: item.name, expected: item.expected })) }),
    });
    state.message = `Added ${plural(checked.length, 'thing', 'things')}`;
    await reloadProjectSuggestions();
  } catch (error) { state.message = error.message; }
  render();
}

export function updateSuggestedButton() {
  const button = document.querySelector('[data-action="add-suggested-features"]');
  if (!button) return;
  const count = document.querySelectorAll('input[name="suggested-feature"]:checked').length;
  button.textContent = `Add ${plural(count, 'thing', 'things')}`;
  button.disabled = count === 0;
}
