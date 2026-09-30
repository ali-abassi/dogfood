import { readJson } from '../api.mjs';
import { answerMarkMarkup, escapeHtml } from '../format.mjs';
import { activePage, editorOpen, state } from '../state.mjs';
import { render } from '../app.mjs';

export function measuredAnswersMarkup(page) {
  const rows = page.measuredAnswers ?? [];
  if (!rows.length) return '';
  const key = `${state.project.id}/${page.id}`;
  const status = state.measured.key === key ? state.measured : { running: false, error: '' };
  const items = rows.map(row => `<li>${answerMarkMarkup(row.question, row.status)}<div><strong>${escapeHtml(row.question)}</strong><p>${escapeHtml(row.note)}</p></div></li>`).join('');
  return `<section class="content-panel measured-answers" aria-label="Measured answers"><div class="panel-heading"><h2>Measured answers</h2><button type="button" class="text-button" data-action="accept-measured" ${measuredButtonDisabled(status)}>${status.running ? 'Saving…' : `Accept ${rows.length} measured answers`}</button></div><p class="muted">Verified by page check. Keyboard use, contrast, security, clarity and intended search visibility still need judgment.</p><details><summary>Review the measured answers</summary><ul class="answer-parts">${items}</ul></details>${measuredError(status)}</section>`;
}

function measuredButtonDisabled(status) { return status.running || editorOpen() ? 'disabled' : ''; }
function measuredError(status) { return status.error ? `<p class="form-error" role="alert">${escapeHtml(status.error)}</p>` : ''; }

export async function acceptMeasured() {
  const page = activePage();
  const projectId = state.project.id;
  const key = `${projectId}/${page.id}`;
  if (state.measured.running) return;
  state.measured = { key, running: true, error: '' };
  render();
  try {
    const project = await readJson(`/api/projects/${projectId}/pages/${page.id}/accept-measured`, { method: 'POST' });
    if (state.project.id === projectId) state.project = project;
    state.measured = { key, running: false, error: '' };
    state.message = 'Measured answers saved; judgment questions remain yours to check';
  } catch (error) { state.measured = { key, running: false, error: error.message }; }
  render();
  focusMeasured();
}

function focusMeasured() { document.querySelector('[data-action="accept-measured"]')?.focus({ preventScroll: true }); }
