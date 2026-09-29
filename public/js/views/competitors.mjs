import { readJson } from '../api.mjs';
import { dateLabel, escapeHtml, externalLinkMarkup, plural, relativeCaptureAge, safeServedImagePath } from '../format.mjs';
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
  if (progress) return progress.total ? `Reading their pages… ${progress.scanned + 1} of ${progress.total}${progress.current ? ` · ${progress.current}` : ''}` : 'Finding their pages…';
  return competitor.scan ? `${pagesWords(competitor.scan.pages)} · ${relativeCaptureAge({ state: 'rendered', capturedAt: competitor.scan.scannedAt }).replace('Taken', 'scanned')}` : 'Not scanned yet';
}

function pagesWords(pages) {
  const unread = pages.filter(page => page.error).length;
  return `${plural(pages.length - unread, 'page', 'pages')}${unread ? ` · ${unread} couldn’t be read` : ''}`;
}

function thumbnailMarkup(competitor) {
  const src = safeServedImagePath(competitor.scan?.pages.find(page => page.captures)?.captures.desktop.path);
  return src ? `<img src="${src}" alt="" loading="lazy">` : '<span class="competitor-thumb-empty" aria-hidden="true"></span>';
}

function cardMarkup(competitor) {
  const summary = competitor.summary ? `<p>${escapeHtml(competitor.summary.whatTheyDo)}</p>` : '';
  return `<li><button type="button" class="competitor-card" data-action="open-competitor" data-competitor-id="${escapeHtml(competitor.id)}"><span class="competitor-thumb">${thumbnailMarkup(competitor)}</span><span class="competitor-card-text"><strong>${escapeHtml(competitor.name)}</strong>${summary}<small>${escapeHtml(scanWords(competitor))}</small></span></button></li>`;
}

function addFormMarkup() {
  if (state.competitors.items.length >= maximumCompetitors) return '';
  return `<form id="competitor-form" class="competitor-add" novalidate><label class="sr-only" for="competitor-url">Competitor’s website</label><input id="competitor-url" name="url" type="url" inputmode="url" required placeholder="https://competitor.com"><button class="save-button" type="submit" ${state.competitors.adding ? 'disabled' : ''}>${state.competitors.adding ? 'Adding…' : 'Add and scan'}</button><div id="competitor-error" class="form-error" role="alert" hidden></div></form>`;
}

function noticeMarkup() {
  return state.competitors.error ? `<p class="form-error" role="alert">${escapeHtml(state.competitors.error)}</p>` : '';
}

function listBodyMarkup() {
  if (state.competitors.loading) return '<p class="muted" role="status">Loading…</p>';
  const items = state.competitors.items;
  if (!items.length) return '<div class="doc-empty content-panel"><h2>No competitors yet</h2><p>Add the sites people compare you with. dogfood reads their key pages, keeps full screenshots, and the AI sums up what they offer and how they compare.</p></div>';
  return `<ul class="competitor-list">${items.map(cardMarkup).join('')}</ul>`;
}

function listMarkup() {
  const lede = 'Up to five products people compare you with. dogfood reads each one’s key pages on a computer and a phone, and the AI sums up how they compare.';
  return `<section class="overview-content competitors-view" aria-label="Competitors"><header class="overview-heading"><div><h1>Competitors</h1><p>${escapeHtml(lede)}</p></div></header>${noticeMarkup()}${addFormMarkup()}${listBodyMarkup()}</section>`;
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
  return `<button type="button" class="${label === 'Summarize with AI' ? 'save-button' : 'text-button'}" data-action="summarize-competitor" ${running ? 'disabled' : ''}>${running ? 'Summarizing…' : label}</button>`;
}

function summaryMarkup(competitor) {
  if (!competitor.scan) return '';
  const summary = competitor.summary;
  if (!summary) return `<section class="content-panel competitor-summary"><div class="panel-heading"><h2>Summary</h2>${summarizeButtonMarkup('Summarize with AI')}</div><p class="muted">The AI reads the text of these pages and sums up what they do, who it’s for, pricing and how they sell, then compares them with this project’s vision. Well under a cent.</p></section>`;
  const stale = summary.scannedAt !== competitor.scan.scannedAt ? `<p class="recheck-note">From an earlier scan.</p>` : '';
  const features = summary.keyFeatures.length ? `<h3>Key features</h3>${listItemsMarkup(summary.keyFeatures)}` : '';
  return `<section class="content-panel competitor-summary"><div class="panel-heading"><h2>Summary</h2>${summarizeButtonMarkup('Summarize again')}</div>${stale}${summaryFactsMarkup(summary)}${features}${versusMarkup(summary)}<p class="muted competitor-summary-by">${escapeHtml(summaryAuthor(summary))} on ${escapeHtml(dateLabel(summary.summarizedAt))}, from the pages below.</p></section>`;
}

function shotMarkup(page, device) {
  const shot = page.captures[device];
  const src = safeServedImagePath(shot.path);
  const label = device === 'desktop' ? 'Computer' : 'Phone';
  return `<figure class="report-screen report-screen-${device}"><div class="screen-frame" role="group" tabindex="0" aria-label="${label} screenshot, scrolls"><img src="${src}" alt="${escapeHtml(page.name)} on a ${label.toLowerCase()}" width="${escapeHtml(shot.pixelWidth)}" height="${escapeHtml(shot.pixelHeight)}" loading="lazy"></div><figcaption><strong>${label}</strong> <a href="${src}" target="_blank" rel="noopener">Full size ↗</a></figcaption></figure>`;
}

function headingsMarkup(page) {
  if (!page.headings.length) return '';
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
  return `<div class="page-actions"><button type="button" class="link-button" data-action="scan-competitor" ${scanning ? 'disabled' : ''}>${scanning ? 'Scanning…' : 'Scan again'}</button>${removeMarkup(competitor)}</div>`;
}

function detailMarkup(competitor) {
  const pages = competitor.scan?.pages ?? [];
  const status = `${externalLinkMarkup(competitor.url, `${hostOf(competitor.url)} ↗`)} · ${escapeHtml(scanWords(competitor))}`;
  return `<section class="overview-content competitor-detail" aria-label="${escapeHtml(competitor.name)}"><button type="button" class="back-button" data-action="close-competitor">‹ Competitors</button><header class="overview-heading"><div><h1 id="competitor-heading" tabindex="-1">${escapeHtml(competitor.name)}</h1><p>${status}</p></div>${detailActionsMarkup(competitor)}</header>${noticeMarkup()}${summaryMarkup(competitor)}${pages.map(pageMarkup).join('')}</section>`;
}

export function competitorsMarkup() {
  const competitor = openCompetitor();
  return competitor ? detailMarkup(competitor) : listMarkup();
}

async function loadCompetitors(projectId) {
  try {
    const items = await readJson(`/api/projects/${encodeURIComponent(projectId)}/competitors`);
    if (state.competitors.key === projectId) Object.assign(state.competitors, { loading: false, items });
  } catch (error) {
    if (state.competitors.key === projectId) Object.assign(state.competitors, { loading: false, error: error.message });
  }
  render();
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

export async function addCompetitor(form) {
  const url = String(new FormData(form).get('url')).trim();
  state.competitors.adding = true;
  render();
  try {
    const items = await readJson(endpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    Object.assign(state.competitors, { adding: false, items });
    void scanCompetitor(items.at(-1).id);
  } catch (error) {
    state.competitors.adding = false;
    render();
    const box = document.querySelector('#competitor-error');
    Object.assign(box, { hidden: false, textContent: error.message });
    document.querySelector('#competitor-url').value = url;
  }
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
