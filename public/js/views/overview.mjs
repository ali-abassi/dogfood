import { readJson } from '../api.mjs';
import { answerMarkMarkup, escapeHtml, plural, scanPosition } from '../format.mjs';
import { answerIds, answerShortNames, groupedPages, state } from '../state.mjs';
import { render } from '../app.mjs';
import { reloadProjectSuggestions, suggestionsWaitingMarkup } from './suggestions.mjs';

function countWords(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

// One sentence answers the question the owner came with.
function answerSentence(pages) {
  const count = status => pages.filter(page => page.progress.status === status).length;
  const good = count('pass');
  const needs = count('needs_work');
  const rest = pages.length - good - needs;
  return `Is ${state.project.name} working? ${countWords(good, 'page is', 'pages are')} good, ${countWords(needs, 'needs', 'need')} work, and ${countWords(rest, 'is', 'are')} not fully checked yet.`;
}

function columnsMarkup() {
  const headings = answerIds.map(id => `<span data-answer-heading>${escapeHtml(answerShortNames[id])}</span>`).join('');
  return `<div class="overview-columns" aria-hidden="true"><span>Page</span><span class="overview-marks">${headings}</span></div>`;
}

function legendMarkup() {
  return `<p class="answer-legend" data-answer-legend aria-hidden="true">${answerIds.map(id => escapeHtml(answerShortNames[id])).join(' · ')}</p>`;
}

function overviewPageMarkup(page) {
  const changed = page.progress.changedSinceReview ? '<span class="changed-note" data-changed-since-review>Changed since last check</span>' : '';
  const marks = page.progress.answers.map(answer => answerMarkMarkup(answer.name, answer.status)).join('');
  return `<div class="overview-page" data-overview-page="${escapeHtml(page.id)}" data-status="${escapeHtml(page.progress.status)}"><button type="button" data-page="${escapeHtml(page.id)}">
    <span class="overview-identity"><strong title="${escapeHtml(page.name)}">${escapeHtml(page.name)}</strong><code title="${escapeHtml(page.route)}">${escapeHtml(page.route)}</code>${changed}</span>
    <span class="overview-marks">${marks}</span>
  </button></div>`;
}

function overviewGroupMarkup({ group, pages }) {
  return `<section class="overview-group" aria-label="${escapeHtml(group)} pages"><h2>${escapeHtml(group)}</h2>${pages.map(overviewPageMarkup).join('')}</section>`;
}

// Orange, not red: the manifest still works, but edits made outside dogfood skipped its validation.
function integrityNoticeMarkup() {
  if (state.project.integrity !== 'edited-outside') return '';
  return '<p class="integrity-notice" role="status">Someone changed this project’s file outside dogfood, so those changes were not checked or signed. Run <code>npm run check</code> to see what changed.</p>';
}

function scanAllLabel() {
  if (!state.scanAll.running) return 'Check all pages';
  if (state.scanAll.total === null) return 'Checking…';
  return `Checking ${scanPosition(state.scanAll)}`;
}

function scanAllButtonMarkup() {
  const disabled = state.scanAll.running ? 'disabled' : '';
  return `<button type="button" class="save-button" data-action="scan-all" ${disabled}>${escapeHtml(scanAllLabel())}</button>`;
}

function scanAllNoticeMarkup() {
  if (!state.scanAll.error) return '';
  return `<p class="form-error" role="alert">${escapeHtml(state.scanAll.error)}</p>`;
}

export function overviewMarkup() {
  const groups = groupedPages(state.project.pages).map(overviewGroupMarkup).join('');
  const pages = groups ? `${columnsMarkup()}${groups}` : '<div class="overview-empty"><p>No pages yet. Ask your coding agent to add this app’s pages, or add the app again from its address and dogfood will find them.</p><button type="button" class="text-button" data-action="add-project">Add an app</button></div>';
  return `<section class="overview-content" aria-label="Project overview">
    <header class="overview-heading"><div><h1>${escapeHtml(state.project.name)}</h1><p data-answer-sentence>${escapeHtml(answerSentence(state.project.pages))}</p></div><div class="overview-actions"><a class="text-button" href="/api/projects/${escapeHtml(state.project.id)}/report" download="${escapeHtml(state.project.id)}-qa-report.md">Download report</a>${scanAllButtonMarkup()}</div></header>
    ${scanAllNoticeMarkup()}
    ${integrityNoticeMarkup()}
    ${legendMarkup()}
    <section class="overview-pages content-panel" aria-label="Pages">${pages}</section>
    ${suggestionsWaitingMarkup()}
  </section>`;
}

// Pages that could not be opened are named, so a run where nothing loaded never reads as a success.
function scanAllFailures(status) {
  if (!status.failed.length) return '';
  return `dogfood could not open ${plural(status.failed.length, 'page', 'pages')}. Check that the app is running, then check again; each page says what went wrong.`;
}

// Polls the scan-all job once a second, then reloads the project and reports what changed.
async function followScanAll(job) {
  const status = await readJson(`/api/jobs/${encodeURIComponent(job)}`);
  if (status.status === 'failed') throw new Error(status.error || 'Checking all pages failed.');
  if (status.status === 'done') return status;
  Object.assign(state.scanAll, { total: status.total, scanned: status.scanned, current: status.current });
  render();
  await new Promise(done => setTimeout(done, 1000));
  return followScanAll(job);
}

export async function scanAllPages() {
  if (state.scanAll.running) return;
  state.scanAll = { running: true, total: null, scanned: 0, current: '', error: '' };
  render();
  try {
    const { job } = await readJson(`/api/projects/${state.project.id}/scan`, { method: 'POST' });
    const status = await followScanAll(job);
    state.project = await readJson(`/api/projects/${encodeURIComponent(state.project.id)}`);
    await reloadProjectSuggestions();
    state.scanAll = { running: false, total: null, scanned: 0, current: '', error: scanAllFailures(status) };
    state.message = `Checked ${plural(status.scanned, 'page', 'pages')}; ${status.changed.length} changed`;
  } catch (error) {
    state.scanAll = { running: false, total: null, scanned: 0, current: '', error: error.message };
  }
  render();
}
