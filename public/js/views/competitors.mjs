import { readJson } from '../api.mjs';
import { isHttpUrl, dateLabel, escapeHtml, externalLinkMarkup, plural, relativeCaptureAge, safeServedImagePath, scanPosition } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

const maximumCompetitors = 5;

function endpoint(path = '') {
  return `/api/projects/${encodeURIComponent(state.project.id)}/competitors${path}`;
}

function openCompetitor() {
  return state.competitors.items.find(item => item.id === state.competitors.open) ?? null;
}

function hostOf(url) {
  return new URL(url).hostname.replace(/^www\./, '');
}

function scanWords(competitor) {
  const progress = state.competitors.scanning[competitor.id];
  if (progress) return progress.total ? `Reading pages… ${scanPosition(progress)}` : 'Finding pages…';
  return competitor.scan ? `${pagesWords(competitor.scan.pages)} · ${relativeCaptureAge({ state: 'rendered', capturedAt: competitor.scan.scannedAt }).replace('Taken', 'scanned')}` : 'Not scanned yet';
}

function pagesWords(pages) {
  const unread = pages.filter(page => page.error).length;
  return `${plural(pages.length - unread, 'page', 'pages')}${unread ? ` · ${unread} couldn’t be read` : ''}`;
}

function thumbnailMarkup(competitor) {
  const src = safeServedImagePath(competitor.scan?.pages.find(page => page.captures?.desktop)?.captures.desktop.path);
  return src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="competitor-thumb-empty" aria-hidden="true"></span>';
}

function cardMarkup(competitor) {
  const summary = competitor.summary ? `<p>${escapeHtml(competitor.summary.whatTheyDo)}</p>` : '';
  return `<li><button type="button" class="competitor-card" data-action="open-competitor" data-competitor-id="${escapeHtml(competitor.id)}"><span class="competitor-thumb">${thumbnailMarkup(competitor)}</span><span class="competitor-card-text"><strong>${escapeHtml(competitor.name)}</strong>${summary}<small class="competitor-site">${escapeHtml(hostOf(competitor.url))}</small><small>${escapeHtml(scanWords(competitor))}</small></span></button></li>`;
}

function competitorInputMarkup() {
  const invalid = state.competitors.addError ? 'aria-invalid="true"' : '';
  const disabled = state.competitors.adding ? 'disabled' : '';
  return `<input id="competitor-url" name="url" type="url" inputmode="url" required placeholder="https://competitor.com" value="${escapeHtml(state.competitors.draft || '')}" aria-describedby="competitor-hint competitor-error" ${invalid} ${disabled}>`;
}

function competitorAddFeedbackMarkup() {
  const error = state.competitors.addError || '';
  return `<p id="competitor-hint" class="field-hint">Saves up to five sites and takes screenshots. An AI summary is a separate step.</p><div id="competitor-error" class="form-error" role="alert" ${error ? '' : 'hidden'}>${escapeHtml(error)}</div>`;
}

function competitorAddButtonMarkup() {
  const adding = state.competitors.adding;
  return `<button id="add-competitor-button" class="save-button" type="submit" ${adding ? 'disabled' : ''}>${adding ? 'Adding…' : 'Add and scan'}</button>`;
}

function addFormMarkup() {
  if (state.competitors.loading || state.competitors.loadError) return '';
  if (state.competitors.items.length >= maximumCompetitors) return '<p class="competitor-limit">Five competitors saved. Remove one to add another.</p>';
  return `<form id="competitor-form" class="competitor-add" novalidate><label for="competitor-url">Competitor’s website</label><div class="competitor-add-fields">${competitorInputMarkup()}${competitorAddButtonMarkup()}</div>${competitorAddFeedbackMarkup()}</form>`;
}

function noticeMarkup() {
  return state.competitors.error ? `<p class="form-error" role="alert">${escapeHtml(state.competitors.error)}</p>` : '';
}

function listBodyMarkup() {
  if (state.competitors.loading) return '<p class="competitor-loading" role="status">Loading saved research…</p>';
  if (state.competitors.loadError) return `<div class="doc-empty content-panel"><h2>Research could not load</h2><p class="form-error" role="alert">${escapeHtml(state.competitors.loadError)}</p><button type="button" class="text-button" data-action="retry-competitors">Try again</button></div>`;
  const items = state.competitors.items;
  if (!items.length) return '<div class="doc-empty content-panel competitor-empty"><h2>No saved research yet</h2><p>Add a competitor’s website above to start.</p></div>';
  return `<section class="competitor-saved" aria-labelledby="saved-research-heading"><h2 id="saved-research-heading">Saved research <span>${items.length} of ${maximumCompetitors}</span></h2><ul class="competitor-list">${items.map(cardMarkup).join('')}</ul></section>`;
}

function listMarkup() {
  return `<section class="overview-content competitors-view" aria-label="Competitors"><header class="overview-heading"><div><h1>Competitors</h1><p>See what alternatives offer, and what your project can do better.</p></div></header>${noticeMarkup()}${addFormMarkup()}${listBodyMarkup()}</section>`;
}

function listItemsMarkup(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function versusMarkup(summary) {
  const columns = [['They do better', summary.theyDoBetter], ['We do better', summary.weDoBetter], ['Ideas to take', summary.ideasToTake]].filter(([, items]) => items.length);
  if (!columns.length) return '';
  return `<h3>Compared with ${escapeHtml(state.project.name)}</h3><div class="versus">${columns.map(([title, items]) => `<div><h4>${title}</h4>${listItemsMarkup(items)}</div>`).join('')}</div>`;
}

function summaryFactsMarkup(summary) {
  const rows = [['What they do', summary.whatTheyDo], ['Who it’s for', summary.whoItsFor], ['Pricing', summary.pricing], ['How they sell', summary.howTheySell]];
  return `<dl class="facts">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}

// The in-app button asks the AI; a coding agent can record its own summary through MCP.
function summaryAuthor(summary) {
  return summary.by?.startsWith('agent:') ? `By ${summary.by.slice(6)}` : 'By the AI';
}

function summarizeButtonMarkup(label) {
  const running = state.competitors.summarizing === state.competitors.open;
  return `<button type="button" class="${label === 'Summarize with AI' ? 'save-button' : 'text-button'}" data-action="summarize-competitor" ${running || state.competitors.scanning[state.competitors.open] ? 'disabled' : ''}>${running ? 'Summarizing…' : label}</button>`;
}

function hasReadablePages(competitor) {
  return competitor.scan?.pages.some(page => !page.error);
}

function summaryProvenanceMarkup(summary) {
  const summarized = dateLabel(summary.summarizedAt) || 'an unknown time';
  const scanned = dateLabel(summary.scannedAt) || 'an unknown time';
  return `<p class="muted competitor-summary-by">${escapeHtml(summaryAuthor(summary))} · Summarized ${escapeHtml(summarized)}. Based on the scan from ${escapeHtml(scanned)}.</p>`;
}

function summaryMarkup(competitor) {
  if (!hasReadablePages(competitor)) return '';
  const summary = competitor.summary;
  if (!summary) return `<section class="content-panel competitor-summary"><div class="panel-heading"><h2>Summary</h2>${summarizeButtonMarkup('Summarize with AI')}</div><p class="muted">No summary yet. Ask your coding agent to record one, or use the configured AI provider to compare these pages with your project’s vision. AI usage may incur a cost.</p></section>`;
  const stale = summary.scannedAt !== competitor.scan.scannedAt ? `<p class="recheck-note">This summary uses an earlier scan. Summarize again to include the latest pages.</p>` : '';
  const features = summary.keyFeatures.length ? `<h3>Key features</h3>${listItemsMarkup(summary.keyFeatures)}` : '';
  return `<section class="content-panel competitor-summary"><div class="panel-heading"><h2>Summary</h2>${summarizeButtonMarkup('Summarize again')}</div>${stale}${summaryFactsMarkup(summary)}${features}${versusMarkup(summary)}${summaryProvenanceMarkup(summary)}</section>`;
}

function shotMarkup(page, device) {
  const shot = page.captures?.[device];
  const src = safeServedImagePath(shot?.path);
  const label = device === 'desktop' ? 'Computer' : 'Phone';
  if (!src) return `<figure class="report-screen report-screen-${device}"><p class="screen-missing">No ${label.toLowerCase()} screenshot saved.</p><figcaption><strong>${label}</strong></figcaption></figure>`;
  return `<figure class="report-screen report-screen-${device}"><div class="screen-frame" role="group" tabindex="0" aria-label="${label} screenshot, scrolls"><img data-screenshot src="${src}" alt="${escapeHtml(page.name)} on a ${label.toLowerCase()}" width="${escapeHtml(shot.pixelWidth)}" height="${escapeHtml(shot.pixelHeight)}" loading="lazy"></div><figcaption><strong>${label}</strong> <a href="${src}" target="_blank" rel="noopener">Full size ↗</a></figcaption></figure>`;
}

function headingsMarkup(page) {
  if (!page.headings?.length) return '';
  const items = page.headings.map(heading => `<li class="depth-${heading.level}">${escapeHtml(heading.text)}</li>`).join('');
  return `<details class="about-disclosure competitor-outline"><summary><h3>What the page says · ${plural(page.headings.length, 'heading', 'headings')}</h3></summary><ul>${items}</ul></details>`;
}

function pageMarkup(page) {
  const path = new URL(page.url).pathname;
  const link = externalLinkMarkup(page.url, `${path === '/' ? hostOf(page.url) : path} ↗`, 'link-button');
  if (page.error) return `<section class="content-panel competitor-page"><div class="panel-heading"><h2>${escapeHtml(page.name)}</h2>${link}</div><p class="form-error">${escapeHtml(page.error)}</p></section>`;
  const description = page.description ? `<p class="muted">${escapeHtml(page.description)}</p>` : '';
  return `<section class="content-panel competitor-page"><div class="panel-heading"><h2>${escapeHtml(page.title || page.name)}</h2>${link}</div>${description}<div class="report-screen-pair">${shotMarkup(page, 'desktop')}${shotMarkup(page, 'mobile')}</div>${headingsMarkup(page)}</section>`;
}

function removeMarkup(competitor) {
  if (state.competitors.removing !== competitor.id) return `<button type="button" class="remove-page-button" data-action="remove-competitor">Remove…</button>`;
  return `<span class="competitor-remove">Remove ${escapeHtml(competitor.name)} and its screenshots? <button type="button" class="danger-button" data-action="confirm-remove-competitor">Remove</button><button type="button" class="text-button" data-action="cancel-remove-competitor">Cancel</button></span>`;
}

function detailActionsMarkup(competitor) {
  const scanning = Boolean(state.competitors.scanning[competitor.id]);
  return `<div class="page-actions"><button type="button" class="link-button" data-action="scan-competitor" ${scanning ? 'disabled' : ''}>${scanning ? 'Scanning…' : competitor.scan ? 'Scan again' : 'Scan pages'}</button>${removeMarkup(competitor)}</div>`;
}

function researchEmptyMarkup(competitor) {
  if (competitor.scan?.pages.length) return '';
  const scanning = Boolean(state.competitors.scanning[competitor.id]);
  return `<section class="content-panel doc-empty"><h2>${scanning ? 'Reading this site' : 'No pages saved yet'}</h2><p>${scanning ? 'Screenshots will appear here when the scan finishes.' : 'Use the scan action above to collect screenshots and page text.'}</p></section>`;
}

function detailMarkup(competitor) {
  const pages = competitor.scan?.pages ?? [];
  const status = `${externalLinkMarkup(competitor.url, `${hostOf(competitor.url)} ↗`)} · ${escapeHtml(competitor.scan ? pagesWords(competitor.scan.pages) : scanWords(competitor))}${competitor.scan ? ` · Scanned ${escapeHtml(dateLabel(competitor.scan.scannedAt))}. Saved research may differ from the live site.` : ''}`;
  return `<section class="overview-content competitor-detail" aria-label="${escapeHtml(competitor.name)}"><button type="button" class="back-button" data-action="close-competitor">‹ Competitors</button><header class="overview-heading"><div><h1 id="competitor-heading" tabindex="-1">${escapeHtml(competitor.name)}</h1><p>${status}</p></div>${detailActionsMarkup(competitor)}</header>${noticeMarkup()}${summaryMarkup(competitor)}${researchEmptyMarkup(competitor)}${pages.map(pageMarkup).join('')}</section>`;
}

export function competitorsMarkup() {
  const competitor = openCompetitor();
  return competitor ? detailMarkup(competitor) : listMarkup();
}

async function loadCompetitors(projectId) {
  try {
    const items = await readJson(`/api/projects/${encodeURIComponent(projectId)}/competitors`);
    if (state.competitors.key === projectId) Object.assign(state.competitors, { loading: false, items, loadError: '' });
  } catch (error) {
    if (state.competitors.key === projectId) Object.assign(state.competitors, { loading: false, loadError: error.message });
  }
  render();
}

export function reloadCompetitors() {
  Object.assign(state.competitors, { loading: true, loadError: '' });
  render();
  void loadCompetitors(state.project.id);
}

// Competitors load once per project, the first time the view opens.
export function syncCompetitorsState() {
  if (state.view !== 'competitors' || !state.project || state.competitors.key === state.project.id) return;
  state.competitors = { key: state.project.id, loading: true, items: [], error: '', open: '', adding: false, scanning: {}, summarizing: '', removing: '' };
  void loadCompetitors(state.project.id);
}

async function followScan(job, id) {
  const status = await readJson(`/api/jobs/${encodeURIComponent(job)}`);
  if (status.status === 'failed') throw new Error(status.error || 'Scanning the competitor failed.');
  if (status.status === 'done') return;
  state.competitors.scanning[id] = { total: status.total, scanned: status.scanned, current: status.current };
  render();
  await new Promise(done => setTimeout(done, 1500));
  return followScan(job, id);
}

async function scanCompetitor(id) {
  state.competitors.scanning[id] = { total: null, scanned: 0, current: '' };
  state.competitors.error = '';
  render();
  try {
    const { job } = await readJson(endpoint(`/${encodeURIComponent(id)}/scan`), { method: 'POST' });
    await followScan(job, id);
    state.competitors.items = await readJson(endpoint());
    state.message = 'Scanned the competitor';
  } catch (error) { state.competitors.error = error.message; }
  delete state.competitors.scanning[id];
  render();
}

function failCompetitorInput(message) {
  Object.assign(state.competitors, { adding: false, addError: message });
  render();
  document.querySelector('#competitor-url')?.focus();
}

export async function addCompetitor(form) {
  const url = String(new FormData(form).get('url')).trim();
  state.competitors.draft = url;
  if (!isHttpUrl(url)) return failCompetitorInput('Enter a website address starting with http:// or https://.');
  Object.assign(state.competitors, { adding: true, addError: '' });
  render();
  try {
    const items = await readJson(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    Object.assign(state.competitors, { adding: false, items, draft: '' });
    void scanCompetitor(items.at(-1).id);
  } catch (error) { failCompetitorInput(error.message); }
}

export function rescanOpenCompetitor() {
  void scanCompetitor(state.competitors.open);
}

export async function summarizeOpenCompetitor() {
  const id = state.competitors.open;
  Object.assign(state.competitors, { summarizing: id, error: '' });
  render();
  try {
    state.competitors.items = await readJson(endpoint(`/${encodeURIComponent(id)}/summary`), { method: 'POST' });
    state.message = 'Summarized';
  } catch (error) { state.competitors.error = error.message; }
  state.competitors.summarizing = '';
  render();
}

export async function removeOpenCompetitor() {
  try {
    state.competitors.items = await readJson(endpoint(`/${encodeURIComponent(state.competitors.open)}/remove`), { method: 'POST' });
    Object.assign(state.competitors, { open: '', removing: '', error: '' });
    state.message = 'Removed';
  } catch (error) { state.competitors.error = error.message; }
  render();
}
