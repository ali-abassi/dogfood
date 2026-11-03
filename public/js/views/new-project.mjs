import { state } from '../state.mjs';
import { escapeHtml } from '../format.mjs';
import { loadProject, render } from '../app.mjs';
import { readJson } from '../api.mjs';

export function newProjectMarkup() {
  const draft = state.newProjectDraft || { name: '', idea: '' };
  return `<section class="new-project-section"><h2>Start with an idea</h2><p>Shape the vision and review the scope before your first build.</p><form id="new-project-form" data-dirty="false"><label for="new-project-name">Project name</label><input id="new-project-name" name="name" required minlength="3" maxlength="120" placeholder="What are you building?" value="${escapeHtml(draft.name)}"><label for="new-project-idea">Your idea</label><textarea id="new-project-idea" name="idea" required minlength="3" maxlength="10000" rows="3" placeholder="Who is it for, and what should it help them do?">${escapeHtml(draft.idea)}</textarea><p class="field-hint">Dogfood creates a local working folder and guides you through discovery. Nothing is published.</p><p id="new-project-error" class="form-error" role="alert" hidden></p><button class="save-button" type="submit">Start discovery</button></form></section>`;
}
export async function submitNewProject(form) {
  const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Creating project…';
  try {
    const value = Object.fromEntries(new FormData(form));
    const result = await readJson('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    state.newProjectDraft = null;
    state.projects = await readJson('/api/projects');
    await loadProject(result.project, { view: 'discovery' });
  } catch (error) { const node = form.querySelector('#new-project-error'); node.textContent = error.message; node.hidden = false; submit.disabled = false; submit.textContent = 'Start discovery'; }
}
