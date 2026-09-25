import { readJson } from '../api.mjs';
import { escapeHtml, plural, relativeCaptureAge, scanPosition, statusPill } from '../format.mjs';
import { groupedPages, requirementShortNames, state } from '../state.mjs';
import { render } from '../app.mjs';

function openIssueCount(page) {
  return plural(page.findings.filter(item => item.status === 'open').length, 'open issue', 'open issues');
}

function isBlockingIssue(item) {
  return item.status === 'open' && ['P0', 'P1'].includes(item.severity);
}

function overviewMetricsMarkup() {
  const pages = state.project.pages;
  const complete = pages.filter(page => page.progress.complete).length;
  const needsWork = pages.filter(page => page.progress.status === 'needs_work').length;
  const blocking = pages.flatMap(page => page.findings).filter(isBlockingIssue).length;
  const scans = pages.filter(page => page.progress.requirements.some(item => ['capture', 'scan'].includes(item.id) && !item.met)).length;
  const changed = pages.filter(page => page.progress.changedSinceReview).length;
  return `<div class="overview-metrics" aria-label="Project metrics">
    <div class="overview-metric" data-metric="complete"><strong>${escapeHtml(complete)} of ${escapeHtml(pages.length)}</strong><span> pages complete</span></div>
    <div class="overview-metric" data-metric="needs-work"><strong>${escapeHtml(needsWork)}</strong><span> ${needsWork === 1 ? 'page needs work' : 'pages need work'}</span></div>
    <div class="overview-metric" data-metric="blocking-issues"><strong>${escapeHtml(blocking)}</strong><span> open P0/P1 ${blocking === 1 ? 'issue' : 'issues'}</span></div>
    <div class="overview-metric" data-metric="scans"><strong>${escapeHtml(scans)}</strong><span> ${scans === 1 ? 'page needs a scan' : 'pages need a scan'}</span></div>
    <div class="overview-metric" data-metric="changed"><strong>${escapeHtml(changed)}</strong><span> ${changed === 1 ? 'page changed since review' : 'pages changed since review'}</span></div>
  </div>`;
}

// Rows show short names so 20+ pages stay scannable; the full label stays available to screen readers.
function overviewRequirementsMarkup(page) {
  const unmet = page.progress.requirements.filter(item => !item.met);
  if (!unmet.length) return 'QA complete';
  const names = unmet.map(item => `<span title="${escapeHtml(item.label)}">${escapeHtml(requirementShortNames[item.id] || item.label)}<span class="sr-only">: ${escapeHtml(item.label)}</span></span>`);
  return `Missing: ${names.join(' · ')}`;
}

function overviewPageMarkup(page) {
  const status = page.progress.status;
  const scanProblemCount = page.progress.scanProblems.length;
  const scanProblems = scanProblemCount ? `<span class="overview-scan-problems" data-scan-problems="${escapeHtml(scanProblemCount)}">${escapeHtml(plural(scanProblemCount, 'scan problem', 'scan problems'))}</span>` : '';
  const changed = page.progress.changedSinceReview ? '<span class="overview-changed" data-changed-since-review>Changed since review</span>' : '';
  return `<div class="overview-page" data-overview-page="${escapeHtml(page.id)}" data-status="${escapeHtml(status)}"><button type="button" data-page="${escapeHtml(page.id)}">
    <span class="overview-status">${statusPill(status)}</span>
    <span class="overview-identity"><strong>${escapeHtml(page.name)}</strong><code>${escapeHtml(page.route)}</code></span>
    <span class="overview-open-issues">${escapeHtml(openIssueCount(page))}</span>
    <span class="overview-capture-age">${escapeHtml(relativeCaptureAge(page.captures.desktop))}</span>
    <span class="overview-requirements">${changed}${scanProblems}${overviewRequirementsMarkup(page)}</span>
  </button></div>`;
}

function overviewGroupMarkup({ group, pages }) {
  return `<section class="overview-group" aria-label="${escapeHtml(group)} pages"><h3>${escapeHtml(group)}</h3>${pages.map(overviewPageMarkup).join('')}</section>`;
}

// Orange, not red: the manifest still works, but edits made outside dogfood skipped its validation.
function integrityNoticeMarkup() {
  if (state.project.integrity !== 'edited-outside') return '';
  return '<p class="integrity-notice" role="status">This project’s manifest was edited outside dogfood since dogfood last saved it, so those edits skipped validation and attribution. Run <code>npm run check</code> to see what changed hands.</p>';
}

function scanAllLabel() {
  if (!state.scanAll.running) return 'Scan all pages';
  if (state.scanAll.total === null) return 'Scanning…';
  return `Scanning ${scanPosition(state.scanAll)}`;
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
  const pages = groups ? `<div class="overview-groups">${groups}</div>` : '<p class="overview-empty">No pages have been added to this project.</p>';
  return `<section class="overview-content" aria-label="Project overview">
    <header class="overview-heading"><div><h1>${escapeHtml(state.project.name)}</h1><p>${escapeHtml(state.project.description)}</p></div>${scanAllButtonMarkup()}</header>
    ${scanAllNoticeMarkup()}
    ${integrityNoticeMarkup()}
    ${overviewMetricsMarkup()}
    <section class="overview-pages" aria-label="Pages"><h2>Pages</h2>${pages}</section>
  </section>`;
}

// Polls the scan-all job once a second, then reloads the project and reports what changed.
async function followScanAll(job) {
  const status = await readJson(`/api/jobs/${encodeURIComponent(job)}`);
  if (status.status === 'failed') throw new Error(status.error || 'Scan all pages failed.');
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
    state.scanAll = { running: false, total: null, scanned: 0, current: '', error: '' };
    state.message = `Scanned ${plural(status.total, 'page', 'pages')}; ${status.changed.length} changed`;
  } catch (error) {
    state.scanAll = { running: false, total: null, scanned: 0, current: '', error: error.message };
  }
  render();
}
