const app = document.querySelector('#app');
const checkNames = {
  functionality: ['Functionality', 'Does the page help the user complete its main task?'],
  optimization: ['Optimization', 'Is the route efficient and responsive in a measured check?'],
  design: ['Design fit', 'Does the rendered state follow this product’s design guidance?'],
  excess: ['Slop & excess', 'Is there duplicated, decorative, or unnecessary work?'],
  clarity: ['Clarity', 'Can a person tell what to do and what will happen?'],
};
const statusNames = { blocked: 'Blocked', untested: 'Untested', in_review: 'In review', pass: 'Pass', needs_work: 'Needs work', open: 'Open', resolved: 'Resolved' };
const tierNames = { source: 'Source-based', automated: 'Automated', mock: 'Mock', real: 'Real browser', longitudinal: 'Longitudinal' };
const auditNames = { security: 'Security', scraping: 'Automated copying', seo: 'Search visibility', accessibility: 'Accessibility' };
const deviceNames = { desktop: 'Desktop', mobile: 'Mobile' };
const deviceViewports = { desktop: '1440 × 900', mobile: '390 × 844' };
const scanHeaderNames = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
const scanSeoNames = { title: 'Title', description: 'Description', canonical: 'Canonical', robots: 'Robots', lang: 'Language', h1Count: 'H1 count' };
const scanAccessibilityNames = { imagesWithoutAlt: 'Images without alt', unlabeledFields: 'Unlabeled fields', unnamedButtons: 'Unnamed buttons' };
const requirementViews = { capture: 'capture', scan: 'capture', features: 'review', checks: 'review', audit: 'risk', connections: 'risk', tests: 'tests', 'ai-review': 'capture', issues: 'findings' };
const requirementShortNames = { capture: 'Screenshots', scan: 'Scan', features: 'Features', checks: 'Quality', audit: 'Safety', connections: 'Connections', tests: 'Tests', 'ai-review': 'AI review', issues: 'Issues' };
const requirementActions = { capture: 'See page', scan: 'See page', features: 'My review', checks: 'My review', audit: 'Safety & search', connections: 'Safety & search', tests: 'Run checks', 'ai-review': 'See page', issues: 'Issues' };
const state = { projects: [], project: null, pageId: null, view: 'overview', query: '', filter: 'all', sort: 'navigation', browseOpen: false, editing: false, auditEditing: false, findingForm: null, screenshotDevice: 'desktop', scan: { key: '', running: false, error: '' }, scanAll: { running: false, total: null, scanned: 0, current: '', error: '' }, onboarding: { job: '', running: false, total: null, scanned: 0, current: null, error: '' }, projectDraft: { url: '', name: '', browserProfile: '' }, qa: { key: '', version: 0, runs: [], plan: [], planError: '', loading: false, running: false, error: '' }, visual: { key: '', loading: false, running: false, result: null, error: '' }, message: '' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? escapeHtml(url.href) : '';
  } catch { return ''; }
}

function safeCapturePath(value) {
  return /^\/captures\/[a-z0-9-]+\/[a-z0-9-]+(?:-mobile)?\.png$/.test(value) ? escapeHtml(value) : '';
}

function safeServedImagePath(value) {
  return /^\/captures\/[a-z0-9-]+\/(?:(?:history|diffs)\/)?[a-z0-9-]+\.png$/.test(value) ? escapeHtml(value) : '';
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function reviewedChecks(page) {
  return Object.values(page.checks).filter(item => item.status !== 'untested').length;
}

function authorName(by) {
  if (by === 'person') return 'you';
  if (by.startsWith('agent:')) return by.slice(6);
  return by;
}

function verdictByMarkup(by, at, action = '') {
  if (!by) return '';
  const date = dateLabel(at);
  const prefix = action ? `${escapeHtml(action)} by` : 'By';
  return `<small class="verdict-by">${prefix} ${escapeHtml(authorName(by))}${date ? ` · ${escapeHtml(date)}` : ''}</small>`;
}

function matchesSearch(page) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return [page.name, page.group, ...page.features.map(item => item.name)].join(' ').toLowerCase().includes(query);
}

const pageFilters = {
  needs: page => ['needs_work', 'blocked'].includes(page.progress.status),
  reviewed: page => page.progress.status !== 'untested',
  untested: page => page.progress.status === 'untested',
  changed: page => page.progress.changedSinceReview === true,
};

function matchesPage(page) {
  if (!matchesSearch(page)) return false;
  const predicate = pageFilters[state.filter];
  return predicate ? predicate(page) : true;
}

function visiblePages() {
  const pages = state.project.pages.filter(matchesPage);
  if (state.sort === 'needs') return pages.sort((a, b) => Number(['needs_work', 'blocked'].includes(b.progress.status)) - Number(['needs_work', 'blocked'].includes(a.progress.status)));
  if (state.sort === 'least') return pages.sort((a, b) => reviewedChecks(a) - reviewedChecks(b));
  return pages;
}

function activePage() {
  return state.project?.pages.find(page => page.id === state.pageId) ?? null;
}

function ensureSelection() {
  if (['overview', 'add-project'].includes(state.view)) return;
  if (state.project.pages.some(page => page.id === state.pageId)) return;
  state.pageId = state.project.pages[0]?.id ?? null;
  state.view = defaultView(activePage());
}

// Pages without selected tests open on their review criteria instead of an empty runner.
function defaultView(page) {
  return page?.qa.tests.length ? 'tests' : 'review';
}

function statusPill(status) {
  return `<span class="status status-${escapeHtml(status)}"><span class="status-dot"></span>${escapeHtml(statusNames[status] || status)}</span>`;
}

function menuSelectMarkup(id, label, value, options) {
  const items = options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('');
  return `<label class="menu-select">${label}<select id="${id}">${items}</select></label>`;
}

function pageOptionMarkup(page) {
  const selected = page.id === state.pageId;
  const status = page.progress.status;
  const label = statusNames[status] || status;
  return `<button type="button" class="page-option ${selected ? 'selected' : ''}" data-page="${escapeHtml(page.id)}" ${selected ? 'aria-current="page"' : ''}><span>${escapeHtml(page.name)}</span><span class="menu-status status-${escapeHtml(status)}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></span></button>`;
}

function groupedPages(pages) {
  const groups = [...new Set(pages.map(page => page.group))];
  return groups.map(group => ({ group, pages: pages.filter(page => page.group === group) }));
}

function pageOptionsMarkup(pages) {
  if (!pages.length) return '<p class="page-no-results" role="status">No pages match. Try another search or filter.</p>';
  return groupedPages(pages).map(({ group, pages: items }) => `<div class="page-group"><p>${escapeHtml(group)}</p>${items.map(pageOptionMarkup).join('')}</div>`).join('');
}

function projectPickerMarkup() {
  const options = state.projects.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.project.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  return `<label class="project-picker"><span class="sr-only">Project</span><select id="project-select">${options}</select></label>`;
}

function sidebarMarkup() {
  const pages = visiblePages();
  const overviewSelected = state.view === 'overview';
  return `<aside class="page-sidebar ${state.browseOpen ? 'open' : ''}" aria-label="Project pages">
      <div class="page-sidebar-head"><img class="app-icon" src="/logo.svg" alt="" width="28" height="28"><strong>dogfood</strong><button type="button" class="page-sidebar-close" data-action="close-pages">Done</button></div>
        ${projectPickerMarkup()}
        <button type="button" class="add-project-button" data-action="add-project">+ Add project</button>
        <h2 class="sr-only">Pages</h2>
        <label class="search-field"><span class="sr-only">Search pages or features</span><span class="search-icon" aria-hidden="true"></span><input id="page-search" type="search" placeholder="Search pages or features" value="${escapeHtml(state.query)}"></label>
        <div class="menu-controls">${menuSelectMarkup('page-filter', 'Show', state.filter, [['all', 'All pages'], ['needs', 'Needs work'], ['untested', 'Untested'], ['reviewed', 'Reviewed'], ['changed', 'Changed since review']])}${menuSelectMarkup('page-sort', 'Sort', state.sort, [['navigation', 'Site order'], ['needs', 'Needs work first'], ['least', 'Least reviewed']])}</div>
        <nav class="page-list" aria-label="Pages"><button type="button" class="page-option overview-option ${overviewSelected ? 'selected' : ''}" data-overview ${overviewSelected ? 'aria-current="page"' : ''}>Overview</button><div class="page-groups">${pageOptionsMarkup(pages)}</div></nav>
        ${externalLinkMarkup(state.project.source.url, 'Open product ↗', 'source-link')}
  </aside>`;
}

function externalLinkMarkup(value, label, className = '') {
  const url = safeHttpUrl(value);
  return url ? `<a class="${escapeHtml(className)}" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : '';
}

function captureImageMarkup(page, capture, imagePath) {
  if (imagePath) return `<a class="capture-image-link" href="${imagePath}" target="_blank" rel="noopener" aria-label="Open full-size screenshot of ${escapeHtml(page.name)}"><img src="${imagePath}" alt="${escapeHtml(page.name)} page captured at ${escapeHtml(capture.viewport)}" loading="eager"></a>`;
  return `<div class="missing-capture"><strong>Not captured</strong><p>${escapeHtml(capture.reason || 'Not captured yet.')}</p></div>`;
}

function captureEvidence(capture, imagePath) {
  if (!imagePath) return escapeHtml(capture.reason || 'Not captured yet.');
  const tier = tierNames[capture.tier] || capture.tier;
  return `${escapeHtml(tier)} · ${escapeHtml(capture.actor)} · ${escapeHtml(capture.pixelWidth)} × ${escapeHtml(capture.pixelHeight)} px. Rendering only.`;
}

function captureImagePath(capture) {
  return capture.state === 'rendered' ? safeCapturePath(capture.path) : '';
}

function captureFrameMarkup(page, device) {
  const capture = page.captures[device];
  const imagePath = captureImagePath(capture);
  const viewport = capture.viewport || deviceViewports[device];
  const fullLink = imagePath ? `<a href="${imagePath}" target="_blank" rel="noopener">View full size ↗</a>` : '';
  const source = externalLinkMarkup(capture.sourceUrl, 'Open original page ↗');
  return `<figure class="device-frame device-frame-${device}" data-device="${escapeHtml(device)}">
    <figcaption class="device-caption"><span><strong>${escapeHtml(deviceNames[device])}</strong><small>${escapeHtml(viewport)} · ${escapeHtml(relativeCaptureAge(capture))}</small></span>${fullLink}</figcaption>
    <div class="capture-panel"><div class="capture-image">${captureImageMarkup(page, capture, imagePath)}</div></div>
    <div class="capture-caption"><details><summary>About this screenshot</summary><p>${captureEvidence(capture, imagePath)}</p></details>${source}</div>
  </figure>`;
}

function captureMarkup(page) {
  const selected = state.screenshotDevice;
  const toggles = Object.entries(deviceNames).map(([device, label]) => `<button type="button" data-action="screenshot-device" data-screenshot-device="${escapeHtml(device)}" aria-pressed="${selected === device}">${escapeHtml(label)}</button>`).join('');
  return `<section class="capture-column" aria-label="Page screenshot">
    <div class="capture-column-heading"><h3>Page screenshot</h3><div class="device-toggle" role="group" aria-label="Screenshot device">${toggles}</div></div>
    ${captureFrameMarkup(page, selected)}
  </section>`;
}

function scanLoadTime(value) {
  if (value === null || value === undefined) return 'Not measured';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function scanListMarkup(items, label, empty, formatItem) {
  const rows = (items || []).map(formatItem);
  if (!rows.length) return `<p class="scan-empty-list">${escapeHtml(empty)}</p>`;
  const remaining = rows.slice(5);
  const disclosure = remaining.length ? `<details><summary>Show ${remaining.length} more ${escapeHtml(label)}</summary><ul class="scan-list">${remaining.join('')}</ul></details>` : '';
  return `<ul class="scan-list">${rows.slice(0, 5).join('')}</ul>${disclosure}`;
}

function scanMessageItemMarkup(message) {
  return `<li>${escapeHtml(message || 'No message provided')}</li>`;
}

function scanRequestItemMarkup(request) {
  return `<li><code>${escapeHtml(request.method)}</code> <span>${escapeHtml(request.url)}</span> <strong>${escapeHtml(request.status)}</strong></li>`;
}

function scanFactMarkup(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
}

function scanListFactMarkup(label, items, empty, formatItem) {
  return scanFactMarkup(label, scanListMarkup(items, label.toLowerCase(), empty, formatItem));
}

function scanSeoMarkup(seo) {
  const values = Object.entries(scanSeoNames).map(([key, label]) => scanFactMarkup(label, escapeHtml(seo[key] ?? 'Missing'))).join('');
  return `<dl class="scan-subfacts">${values}</dl>`;
}

function scanHeadersMarkup(headers) {
  const values = scanHeaderNames.map(name => scanFactMarkup(name, escapeHtml(headers[name] || 'Missing'))).join('');
  return `<dl class="scan-subfacts">${values}</dl>`;
}

function scanAccessibilityMarkup(accessibility) {
  const values = Object.entries(scanAccessibilityNames).map(([key, label]) => scanFactMarkup(label, escapeHtml(accessibility[key]))).join('');
  return `<dl class="scan-subfacts">${values}</dl>`;
}

function scanDeviceMarkup(scan, page, device) {
  const facts = scan.viewports[device];
  const capture = page.captures[device];
  return `<section class="scan-device" aria-label="${escapeHtml(deviceNames[device])} scan results">
    <header><h3>${escapeHtml(deviceNames[device])}</h3><span>${escapeHtml(capture.viewport || deviceViewports[device])}</span></header>
    <dl class="scan-facts">
      ${scanFactMarkup('Load time', escapeHtml(scanLoadTime(facts.loadMs)))}
      ${scanListFactMarkup('Page errors', facts.pageErrors, 'None', scanMessageItemMarkup)}
      ${scanListFactMarkup('Console errors', facts.consoleErrors, 'None', scanMessageItemMarkup)}
      ${scanListFactMarkup('Failed requests', facts.failedRequests, 'None', scanRequestItemMarkup)}
      ${scanListFactMarkup('API calls', facts.requests, 'None recorded', scanRequestItemMarkup)}
      ${scanFactMarkup('Sideways scrolling', facts.horizontalOverflow ? '<span class="scan-problem-value">Yes</span>' : 'No')}
      ${scanFactMarkup('Search tags', scanSeoMarkup(facts.seo))}
      ${scanFactMarkup('Security headers', scanHeadersMarkup(facts.headers))}
      ${scanFactMarkup('Accessibility counts', scanAccessibilityMarkup(facts.accessibility))}
    </dl>
  </section>`;
}

function scanProblemListMarkup(page) {
  const problems = page.progress.scanProblems || [];
  if (!problems.length) return '<p class="scan-clear">No scan problems found.</p>';
  return `<ul class="scan-problems">${problems.map(problem => `<li>${escapeHtml(problem)}</li>`).join('')}</ul>`;
}

function scanButtonLabel(page, scanning) {
  if (scanning) return 'Scanning…';
  return page.scan ? 'Scan again' : 'Scan page';
}

// The scan button, progress, and error for the page being viewed; state.scan.key says which page they belong to.
function scanControlsMarkup(page) {
  const scan = state.scan.key === `${state.project.id}/${page.id}` ? state.scan : { running: false, error: '' };
  const button = `<button type="button" class="text-button" data-action="scan" ${state.scan.running ? 'disabled' : ''}>${scanButtonLabel(page, scan.running)}</button>`;
  const progress = scan.running ? '<p class="scan-progress" role="status">Scanning… this takes about 15 seconds.</p>' : '';
  const error = scan.error ? `<p class="form-error" role="alert">${escapeHtml(scan.error)}</p>` : '';
  return { button, notices: `${progress}${error}` };
}

function scanSummaryMarkup(page) {
  const scan = page.scan;
  if (!scan) return '<p class="scan-unavailable">This page has not been scanned yet. Scan it to measure errors, requests, speed, search tags, and accessibility.</p>';
  const devices = ['desktop', 'mobile'].map(device => scanDeviceMarkup(scan, page, device)).join('');
  return `<div class="scan-problem-summary"><h3>Scan problems</h3>${scanProblemListMarkup(page)}</div><div class="scan-devices">${devices}</div>`;
}

function scanResultsMarkup(page) {
  const { button, notices } = scanControlsMarkup(page);
  const scanned = page.scan ? `<p>Scanned ${escapeHtml(dateLabel(page.scan.scannedAt))} by ${escapeHtml(page.scan.actor)}</p>` : '';
  return `<section class="scan-results content-panel" aria-label="Scan results">
    <div class="scan-results-heading"><div><h2>Scan results</h2>${scanned}</div>${button}</div>
    ${notices}${scanSummaryMarkup(page)}
  </section>`;
}

function changePercent(change) {
  return `${(change.changedShare * 100).toFixed(1)}% of pixels changed`;
}

function changeSummary(device, change) {
  const size = change.sizeChanged ? 'size changed, ' : '';
  return `${deviceNames[device]}: ${size}${changePercent(change)}`;
}

function changeFigureMarkup(page, device, kind, path, caption) {
  const image = safeServedImagePath(path);
  if (!image) return '';
  const alt = `${caption} ${device} screenshot of ${page.name}`;
  return `<figure class="change-figure"><a href="${image}" target="_blank" rel="noopener"><img data-change-image="${escapeHtml(kind)}" src="${image}" alt="${escapeHtml(alt)}" loading="lazy"></a><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function changeDeviceMarkup(page, device) {
  const change = page.scan.changes[device];
  const figures = [
    changeFigureMarkup(page, device, 'previous', change.previousPath, 'Previous'),
    changeFigureMarkup(page, device, 'current', page.captures[device].path, 'Current'),
    changeFigureMarkup(page, device, 'diff', change.diffPath, 'Difference'),
  ].join('');
  return `<div class="change-device"><h3>${escapeHtml(changeSummary(device, change))}</h3><div class="change-images">${figures}</div></div>`;
}

function visualChangesMarkup(page) {
  const lead = page.progress.changedSinceReview ? '<p class="visual-stale" role="status">Changed since review — recheck the verdicts.</p>' : '';
  const changes = page.scan?.changes;
  const changedDevices = ['desktop', 'mobile'].filter(device => changes?.[device]);
  if (!changedDevices.length) return `<section class="visual-changes content-panel" aria-label="Visual changes"><h2>Visual changes</h2>${lead}<p class="visual-empty">No earlier scan to compare yet.</p></section>`;
  if (!changedDevices.some(device => changes[device].changed)) return `<section class="visual-changes content-panel" aria-label="Visual changes"><h2>Visual changes</h2>${lead}<p class="visual-empty">No visual change since the previous scan.</p></section>`;
  return `<section class="visual-changes content-panel" aria-label="Visual changes"><h2>Visual changes</h2>${lead}${changedDevices.map(device => changeDeviceMarkup(page, device)).join('')}</section>`;
}

function seePageMarkup(page) {
  return `<div class="see-page-content"><section class="capture-gallery" aria-label="Page screenshots">${captureFrameMarkup(page, 'desktop')}${captureFrameMarkup(page, 'mobile')}</section>${visualChangesMarkup(page)}${scanResultsMarkup(page)}${visualReviewMarkup(page)}</div>`;
}

const clarityDimensions = { purpose: 'Purpose', nextAction: 'Next action', hierarchy: 'Hierarchy', copy: 'Copy' };

function visualResultMarkup(result) {
  const { review, stale } = result;
  if (!review) return '<p class="visual-empty">Ask AI to describe both screenshots, suggest ways to make them clearer, and propose this page’s features.</p>';
  const analysis = review.analysis;
  const dimensions = Object.entries(clarityDimensions).map(([key, label]) => `<div class="visual-dimension"><div><strong>${label}</strong><span>${escapeHtml(analysis.dimensions[key].score)} / 10</span></div><p>${escapeHtml(analysis.dimensions[key].reason)}</p></div>`).join('');
  const evidence = analysis.evidence.map(item => `<li><strong>${escapeHtml(item.location)}</strong> ${escapeHtml(item.observation)}</li>`).join('');
  const improvements = analysis.improvements.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const firstImprovement = analysis.improvements[0] ? `<p class="visual-next"><strong>One thing to improve:</strong> ${escapeHtml(analysis.improvements[0])}</p>` : '';
  const staleMessage = stale ? '<p class="visual-stale" role="status">This analysis belongs to an older screenshot. Run it again for the current capture.</p>' : '';
  const nextVersion = improvements ? `<div class="visual-list"><h4>Clearer next version</h4><ol>${improvements}</ol></div>` : '';
  return `${staleMessage}<div class="visual-read">
    <div class="visual-score"><strong>${escapeHtml(analysis.clarityRating)}<small> / 10</small></strong><span>AI clarity estimate</span></div>
    <div><p class="visual-purpose">${escapeHtml(analysis.pagePurpose)}</p>${firstImprovement}</div>
  </div><details class="visual-details">
    <summary>See the AI's reasons and suggestions</summary>
    <dl class="visual-summary"><div><dt>Primary visible action</dt><dd>${escapeHtml(analysis.primaryAction)}</dd></div></dl>
    <div class="visual-dimensions">${dimensions}</div>
    <div class="visual-list"><h4>What the image shows</h4><ul>${evidence}</ul></div>
    ${nextVersion}
    <p class="visual-provenance">${escapeHtml(review.model)} · ${escapeHtml(dateLabel(review.analyzedAt))}<br>Capture SHA ${escapeHtml(review.captures.desktop.sha256.slice(0, 12))} · ${visualCostLabel(review.usage)} · ${escapeHtml(review.latencyMs)} ms</p>
  </details>`;
}

function visualCostLabel(usage) {
  if (usage.reportedCostUsd === null) return 'Cost unavailable';
  return `$${Number(usage.reportedCostUsd).toFixed(4)}`;
}

function visualRunButton(canRun) {
  const disabled = !canRun || state.visual.loading || state.visual.running;
  return `<button type="button" class="save-button qa-run-button visual-run-button" data-action="run-visual" ${disabled ? 'disabled' : ''}>${state.visual.running ? 'Reviewing image…' : 'Ask AI to review image'}</button>`;
}

function visualContentVisible(canRun, result) {
  return canRun || Boolean(result?.review);
}

function visualContentMarkup(canRun) {
  if (state.visual.loading) return '<p class="visual-empty" role="status">Reading the latest visual review…</p>';
  const result = state.visual.result;
  if (!visualContentVisible(canRun, result)) return '';
  return visualResultMarkup(result ?? { review: null, stale: false });
}

function remainingSuggestions(page, review) {
  const names = new Set(page.features.map(feature => feature.name.toLowerCase()));
  return (review?.analysis?.suggestedFeatures || []).filter(item => !names.has(String(item.name).toLowerCase()));
}

function suggestedFeatureMarkup(item, index) {
  return `<label class="suggested-feature"><input type="checkbox" name="suggested-feature" value="${index}" checked><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.expected)}</small></span></label>`;
}

function suggestedFeaturesMarkup(page, result) {
  const review = result?.review;
  if (!review) return '';
  const remaining = remainingSuggestions(page, review);
  if (!remaining.length) return '<section aria-label="Suggested features"><h3>Suggested features</h3><p class="visual-empty">Every suggestion is already listed.</p></section>';
  return `<section aria-label="Suggested features"><h3>Suggested features</h3><div class="suggested-list">${remaining.map(suggestedFeatureMarkup).join('')}</div><button type="button" class="text-button" data-action="add-suggested-features">Add ${plural(remaining.length, 'feature', 'features')}</button></section>`;
}

function visualReviewMarkup(page) {
  const canRun = page.captures.desktop.state === 'rendered' && page.captures.desktop.fullPage;
  const button = visualRunButton(canRun);
  const content = visualContentMarkup(canRun);
  const gap = canRun ? '' : '<p class="visual-empty">AI review needs a full-page screenshot.</p>';
  const error = state.visual.error ? `<p class="form-error" role="alert">${escapeHtml(state.visual.error)}</p>` : '';
  const suggestions = suggestedFeaturesMarkup(page, state.visual.result);
  return `<section class="visual-panel content-panel" aria-label="AI image review"><div class="visual-heading"><div><h2>AI view of this page</h2><p>Based on both screenshots. It cannot tell whether buttons or data work.</p></div>${button}</div>${error}${gap}${content}${suggestions}</section>`;
}

function featureMarkup(feature) {
  const expected = feature.expected ? `<p class="feature-expected">Expected: ${escapeHtml(feature.expected)}</p>` : '';
  return `<li class="feature"><div><strong>${escapeHtml(feature.name)}</strong>${expected}${feature.note ? `<p>${escapeHtml(feature.note)}</p>` : ''}${verdictByMarkup(feature.by, feature.at)}</div>${statusPill(feature.status)}</li>`;
}

function checkMarkup(key, entry) {
  const [name, question] = checkNames[key];
  return `<div class="check"><div class="check-heading"><strong>${escapeHtml(name)}</strong>${statusPill(entry.status)}</div><p class="check-question">${escapeHtml(question)}</p>${entry.note ? `<p class="check-note">${escapeHtml(entry.note)}</p>` : ''}${verdictByMarkup(entry.by, entry.at)}</div>`;
}

function auditChecklistMarkup(key, rows) {
  const checked = rows.filter(row => row.status !== 'untested').length;
  const items = rows.map(row => `<div class="audit-item"><div class="check-heading"><strong>${escapeHtml(row.question)}</strong>${statusPill(row.status)}</div>${row.note ? `<p class="check-note">${escapeHtml(row.note)}</p>` : ''}${verdictByMarkup(row.by, row.at)}</div>`).join('');
  return `<details class="audit-disclosure" ${key === 'security' ? 'open' : ''}><summary><span>${escapeHtml(auditNames[key])}</span><small>${checked} / ${rows.length} reviewed</small></summary><div class="audit-list">${items}</div></details>`;
}

function connectionMarkup(row) {
  return `<li class="connection"><div class="connection-title"><code>${escapeHtml(row.method)}</code><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.provenance === 'source' ? 'Source mapped' : row.provenance === 'observed' ? 'Traffic observed' : 'Manual')}</small></div><p class="connection-endpoint">${escapeHtml(row.endpoint)}</p><dl><div><dt>Sends</dt><dd>${escapeHtml(row.sends)}</dd></div><div><dt>Receives</dt><dd>${escapeHtml(row.receives)}</dd></div></dl><p class="connection-source">Evidence: ${escapeHtml(row.source)}</p></li>`;
}

function auditMarkup(page) {
  const sections = Object.entries(page.audit).map(([key, rows]) => auditChecklistMarkup(key, rows)).join('');
  const connections = `<details class="audit-disclosure"><summary><span>Data connections</span><small>${page.connections.length} mapped</small></summary><p class="audit-caveat">These are connections found in the app code. They have not all been verified on the live page.</p><ul class="connections">${page.connections.map(connectionMarkup).join('')}</ul></details>`;
  const editor = state.auditEditing ? auditEditorMarkup(page) : '<button type="button" class="review-button audit-button" data-action="audit-edit">Edit checks & connections</button>';
  return `<section class="inspector-section audit-section"><div class="section-heading"><h3>Security, search & data</h3><span>Page checklist</span></div>${sections}${connections}${editor}</section>`;
}

function qaRunLabel(status) {
  return { passed: 'Saved-example checks passed', failed: 'Some checks failed', error: 'Checks could not run' }[status] || 'Run unavailable';
}

function qaRunFailureMarkup(run) {
  if (run.cases?.length || !run.failures?.length) return '';
  return `<ul class="qa-failures">${run.failures.map(item => `<li><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.detail)}</p></li>`).join('')}</ul>`;
}

function qaRunErrorMarkup(error) {
  return error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : '';
}

function qaRunMarkup(run) {
  return `<div class="qa-result"><div class="qa-result-heading"><strong>${escapeHtml(qaRunLabel(run.status))}</strong><span>${escapeHtml(dateLabel(run.finishedAt))}</span></div><p>${escapeHtml(run.passed)} of ${escapeHtml(run.total)} checks passed using saved examples.</p>${qaCasesMarkup(run)}${qaRunFailureMarkup(run)}${qaRunErrorMarkup(run.error)}<details class="technical-details"><summary>Run details</summary><small>Checkout revision: ${escapeHtml(run.revision || 'unavailable')} · ${escapeHtml(checkoutStateLabel(run))}</small></details></div>`;
}

function checkoutStateLabel(run) {
  if (run.dirty === true) return 'local changes present';
  if (run.dirty === false) return 'clean checkout';
  return 'change status unrecorded';
}

function qaCaseMarkup(item) {
  const label = { passed: 'Pass', failed: 'Fail', skipped: 'Skipped', pending: 'Pending', todo: 'To do' }[item.status] || 'Unclear';
  const detail = item.detail ? `<p>${escapeHtml(item.detail)}</p>` : '';
  return `<li><span class="qa-case-status ${escapeHtml(item.status)}">${label}</span><div><strong>${escapeHtml(item.name)}</strong>${detail}</div></li>`;
}

function qaCasesMarkup(run) {
  if (!run.cases) return '<p class="qa-detail-gap">Case names were not saved for this older run. Run it again to see each check.</p>';
  if (!run.cases.length) return '<p class="qa-detail-gap">No check completed in this run.</p>';
  const files = [...new Set(run.cases.map(item => item.file))];
  const groups = files.map(file => `<div class="qa-case-group"><ol>${run.cases.filter(item => item.file === file).map(qaCaseMarkup).join('')}</ol><details class="technical-details"><summary>Source file</summary><code>${escapeHtml(file)}</code></details></div>`).join('');
  return `<details class="qa-cases" open><summary>Checks run · ${run.cases.length}</summary>${groups}</details>`;
}

function qaPlanMarkup(page) {
  const tests = page.qa.tests.map(item => `<li><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.reason)}</p><code>${escapeHtml(item.file)}</code></li>`).join('');
  const plan = tests ? `<details class="technical-details"><summary>Why these checks were chosen</summary><ul class="qa-tests">${tests}</ul></details>` : '';
  return `${qaPlannedCasesMarkup(page)}${plan}<p class="qa-gap">${escapeHtml(page.qa.note)}</p>`;
}

function qaPlannedCasesMarkup(page) {
  if (!page.qa.tests.length) return '';
  if (state.qa.loading) return '<p class="audit-caveat">Loading the checks for this page…</p>';
  if (state.qa.planError) return `<p class="form-error" role="alert">Could not list checks: ${escapeHtml(state.qa.planError)}</p>`;
  if (!state.qa.plan.length) return '<p class="qa-detail-gap">No runnable cases were found in the selected files.</p>';
  const cases = state.qa.plan.map(item => `<li>${escapeHtml(item.name)}</li>`).join('');
  return `<details class="qa-planned" ${qaPlanOpenAttribute()}><summary>Checks included · ${state.qa.plan.length}</summary><ol>${cases}</ol></details>`;
}

function qaPlanOpenAttribute() {
  if (state.qa.runs[0]?.cases?.length) return '';
  return 'open';
}

function qaHistoryMarkup(page) {
  const run = state.qa.runs[0] || (!state.qa.loading && page.qa.latest);
  const latest = run ? qaRunMarkup(run) : '<p class="audit-caveat">No checks have run for this page yet.</p>';
  const history = state.qa.runs.length > 1 ? `<details class="qa-history"><summary>Earlier runs (${state.qa.runs.length - 1})</summary>${state.qa.runs.slice(1).map(qaRunMarkup).join('')}</details>` : '';
  return `${latest}${history}`;
}

function qaRunButtonText() {
  if (state.qa.running) return 'Running checks…';
  if (!state.qa.plan.length && !state.qa.loading) return 'Checks unavailable';
  return 'Run checks';
}

function qaRunButtonMarkup() {
  const disabled = state.qa.running || state.qa.loading || !state.qa.plan.length;
  return `<button type="button" class="review-button qa-run-button" data-action="run-qa" ${disabled ? 'disabled' : ''}>${qaRunButtonText()}</button>`;
}

function qaControlMarkup() {
  const progress = state.qa.running ? 'Running the selected checks…' : state.qa.loading ? 'Loading checks and past results…' : '';
  const error = state.qa.error ? `<p class="form-error" role="alert">${escapeHtml(state.qa.error)}</p>` : '';
  return `${qaRunButtonMarkup()}<div class="qa-run-state" role="status">${progress}</div>${error}`;
}

function qaMarkup(page) {
  const count = page.qa.tests.length;
  const title = count ? 'Run the page checks' : 'No automated checks yet';
  const intro = count ? 'These checks use saved examples. They cannot prove the live page is ready.' : 'The missing work is listed below.';
  const control = count ? `<div class="qa-control">${qaControlMarkup()}</div>` : '';
  const evidence = count ? `<div class="qa-evidence"><div class="section-heading"><h4>Last run</h4><span>Saved examples</span></div>${qaHistoryMarkup(page)}</div>` : '';
  return `<section class="content-panel qa-section" aria-label="Automated page checks"><div class="qa-heading"><div><h3>${title}</h3><p>${intro}</p></div>${control}</div>${evidence}<div class="qa-plan"><div class="section-heading"><h4>Checks and gaps</h4></div>${qaPlanMarkup(page)}</div></section>`;
}

function auditItemEditor(row, key) {
  return `<div class="audit-edit-row" data-audit-row="${key}" data-id="${escapeHtml(row.id)}"><label>Question<input class="audit-question" required maxlength="220" value="${escapeHtml(row.question)}"></label><div class="audit-edit-status"><label>Status<select class="audit-status"><option value="untested" ${row.status === 'untested' ? 'selected' : ''}>Untested</option><option value="pass" ${row.status === 'pass' ? 'selected' : ''}>Pass</option><option value="needs_work" ${row.status === 'needs_work' ? 'selected' : ''}>Needs work</option></select></label><button type="button" class="remove-row" data-action="remove-row" aria-label="Remove check">Remove</button></div><label>Evidence note<textarea class="audit-note" maxlength="1200" rows="2" placeholder="Required for Pass or Needs work">${escapeHtml(row.note)}</textarea></label></div>`;
}

function connectionEditor(row) {
  const options = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => `<option ${row.method === method ? 'selected' : ''}>${method}</option>`).join('');
  const provenance = [['source', 'Source mapped'], ['observed', 'Traffic observed'], ['manual', 'Manual']].map(([value, label]) => `<option value="${value}" ${row.provenance === value ? 'selected' : ''}>${label}</option>`).join('');
  return `<div class="connection-edit-row" data-connection-row data-id="${escapeHtml(row.id)}"><div class="connection-edit-head"><label>Name<input class="connection-name" required maxlength="100" value="${escapeHtml(row.name)}"></label><button type="button" class="remove-row" data-action="remove-row" aria-label="Remove connection">Remove</button></div><div class="connection-edit-pair"><label>Method<select class="connection-method">${options}</select></label><label>Evidence type<select class="connection-provenance">${provenance}</select></label></div><label>API route<input class="connection-endpoint-input" required maxlength="300" value="${escapeHtml(row.endpoint)}"></label><label>Information sent<input class="connection-sends" required maxlength="400" value="${escapeHtml(row.sends)}"></label><label>Information received<input class="connection-receives" required maxlength="400" value="${escapeHtml(row.receives)}"></label><label>Source file or traffic evidence<input class="connection-source-input" required maxlength="400" value="${escapeHtml(row.source)}"></label></div>`;
}

function auditEditorMarkup(page) {
  const groups = Object.entries(page.audit).map(([key, rows]) => `<div class="audit-edit-group" data-audit-group="${key}"><h4>${auditNames[key]}</h4><div class="audit-edit-list">${rows.map(row => auditItemEditor(row, key)).join('')}</div><button type="button" class="add-finding" data-action="add-check" data-key="${key}">+ Add check</button></div>`).join('');
  return `<form id="audit-form" class="audit-form"><p class="audit-caveat">Edit the questions for this page. Pass and Needs work require a specific evidence note. Source-mapped connections still need runtime verification.</p>${groups}<div class="audit-edit-group"><h4>Connections</h4><div id="connection-edit-list">${page.connections.map(connectionEditor).join('')}</div><button type="button" class="add-finding" data-action="add-connection">+ Add connection</button></div><div id="audit-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save checklist</button><button class="text-button" type="button" data-action="audit-cancel">Cancel</button></div></form>`;
}

function findingEvidenceMarkup(finding) {
  const evidencePath = finding.evidence ? safeCapturePath(`/${finding.evidence}`) : '';
  return evidencePath ? `<a href="${evidencePath}" target="_blank" rel="noopener">Screenshot ↗</a>` : 'No screenshot attached';
}

function findingActionMarkup(finding) {
  if (state.findingForm === finding.id) return '';
  const action = finding.status === 'open' ? 'Resolve' : 'Reopen';
  return `<button type="button" class="finding-action" data-finding-action="${action.toLowerCase()}" data-finding-id="${escapeHtml(finding.id)}">${action}</button>`;
}

function findingMarkup(finding) {
  const resolution = finding.resolution ? `<p class="resolution-note"><strong>Last retest:</strong> ${escapeHtml(finding.resolution)} <small>· ${escapeHtml(dateLabel(finding.resolvedAt))}</small></p>` : '';
  const resolvedBy = verdictByMarkup(finding.resolvedBy, finding.resolvedAt, 'Resolved');
  const form = state.findingForm === finding.id ? resolutionFormMarkup(finding) : '';
  return `<li class="finding"><span class="severity">${escapeHtml(finding.severity)}</span><div class="finding-body"><div class="finding-title"><strong>${escapeHtml(finding.title)}</strong>${statusPill(finding.status)}</div><p>${escapeHtml(finding.detail)}</p><small>${escapeHtml(finding.id)} · ${findingEvidenceMarkup(finding)}</small>${verdictByMarkup(finding.by, finding.at, 'Opened')}${resolution}${resolvedBy}${findingActionMarkup(finding)}${form}</div></li>`;
}

function resolutionFormMarkup(finding) {
  return `<form id="resolution-form" class="finding-form" data-finding-id="${escapeHtml(finding.id)}"><label for="retest-note">What did you retest?</label><textarea id="retest-note" name="note" rows="3" required minlength="20" maxlength="1200" placeholder="Name the environment, action, and observed result."></textarea><div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Mark resolved</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

function newFindingFormMarkup(page) {
  const capture = page.captures.desktop.state === 'rendered' ? `<label class="capture-choice"><input type="checkbox" name="attachCapture"> Attach this screenshot if it shows the issue</label>` : '';
  return `<form id="finding-form" class="finding-form"><label for="finding-title">Issue title</label><input id="finding-title" name="title" required minlength="8" maxlength="120" placeholder="What is wrong?"><label for="finding-severity">Priority</label><select id="finding-severity" name="severity"><option value="P2">P2 · important</option><option value="P1">P1 · blocks core work</option><option value="P0">P0 · critical</option><option value="P3">P3 · minor</option></select><label for="finding-detail">What happened and how to repeat it?</label><textarea id="finding-detail" name="detail" rows="4" required minlength="20" maxlength="1200" placeholder="Where did you start, what did you do, and what happened?"></textarea>${capture}<div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save issue</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

function findingsMarkup(page) {
  const findings = [...page.findings].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || a.severity.localeCompare(b.severity));
  const list = findings.length ? `<ul class="findings">${findings.map(findingMarkup).join('')}</ul>` : '<p class="no-findings">No issues recorded for this page.</p>';
  const form = state.findingForm === 'new' ? newFindingFormMarkup(page) : '';
  const action = state.findingForm === 'new' ? '' : '<button type="button" class="add-finding" data-finding-action="new">+ Add issue</button>';
  return `<section class="inspector-section"><div class="section-heading"><h3>Issues on this page</h3><span>${page.findings.filter(item => item.status === 'open').length} open</span></div>${list}${action}${form}</section>`;
}

function editorEntry(name, entry, prefix) {
  const key = escapeHtml(prefix);
  return `<div class="editor-entry"><label for="${key}-status">${escapeHtml(name)}</label><select id="${key}-status" name="${key}.status"><option value="untested" ${entry.status === 'untested' ? 'selected' : ''}>Untested</option><option value="pass" ${entry.status === 'pass' ? 'selected' : ''}>Pass</option><option value="needs_work" ${entry.status === 'needs_work' ? 'selected' : ''}>Needs work</option></select><label class="sr-only" for="${key}-note">Evidence for ${escapeHtml(name)}</label><textarea id="${key}-note" name="${key}.note" rows="2" placeholder="Exact check or observation; required for Pass or Needs work">${escapeHtml(entry.note)}</textarea></div>`;
}

function editorMarkup(page) {
  const checks = Object.entries(page.checks).map(([key, entry]) => editorEntry(checkNames[key][0], entry, `check-${key}`)).join('');
  const features = page.features.map(feature => editorEntry(feature.name, feature, `feature-${feature.id}`)).join('');
  return `<form id="review-form" class="review-form"><div class="form-intro"><strong>Update this page</strong><p>A Pass or Needs work verdict needs a note naming the check or observed evidence. A screenshot alone is not a feature test.</p></div><h4>Quality checks</h4>${checks}<h4>Feature checks</h4>${features}<div id="form-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save review</button><button class="text-button" type="button" data-action="cancel">Cancel</button></div></form>`;
}

function reviewMarkup(page) {
  const tested = page.features.filter(item => item.status !== 'untested').length;
  const edit = state.editing ? editorMarkup(page) : `<button type="button" class="review-button" data-action="edit">Review this page</button>`;
  return `<section class="inspector content-panel" aria-label="Page review"><div class="inspector-top"><div><h2>Does this page work for people?</h2><p class="review-intro">Check the features and quality questions, then save what you observed.</p></div><span class="review-progress">${reviewedChecks(page)} / 5 reviewed</span></div><section class="inspector-section"><div class="section-heading"><h3>Features on this page</h3><span>${tested} / ${page.features.length} checked</span></div><ul class="features">${page.features.map(featureMarkup).join('')}</ul></section><section class="inspector-section"><div class="section-heading"><h3>Quality questions</h3><span>${reviewedChecks(page)} / 5</span></div><div class="checks">${Object.entries(page.checks).map(([key, entry]) => checkMarkup(key, entry)).join('')}</div></section><section class="inspector-section guidelines"><details><summary>Design guidelines for this project</summary><ul>${state.project.guidelines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details></section>${edit}</section>`;
}

function pageHeaderMarkup(page) {
  const guidance = page.qa.tests.length ? 'Start by running checks, then inspect the page and save your review.' : 'Inspect this page and save what you found.';
  return `<div class="page-heading"><div><p class="page-route">${escapeHtml(page.route)}</p><h1 id="selected-page-heading" tabindex="-1">${escapeHtml(page.name)}</h1><p class="page-guidance">${escapeHtml(guidance)}</p></div><div class="page-verdict"><small>Checklist status</small>${statusPill(page.progress.status)}</div></div>`;
}

function relativeCaptureAge(capture) {
  if (capture.state !== 'rendered' || !capture.capturedAt) return 'Not captured';
  const timestamp = new Date(capture.capturedAt).getTime();
  if (Number.isNaN(timestamp)) return 'Capture time unavailable';
  const elapsedDays = Math.round((Date.now() - timestamp) / 86_400_000);
  const relativeDays = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-elapsedDays, 'day');
  return `Captured ${relativeDays}`;
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

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

// "3 of 12 · Pricing": the page being scanned now, counted from 1.
function scanPosition({ scanned, total, current }) {
  return current ? `${scanned + 1} of ${total} · ${current}` : `${scanned} of ${total}`;
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

function overviewMarkup() {
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

function requirementDetailMarkup(requirement) {
  if (requirement.met) return '<p class="completion-met">Requirement met.</p>';
  const view = requirementViews[requirement.id] || 'review';
  const action = requirementActions[requirement.id] || 'Open';
  return `<p>${escapeHtml(requirement.missing)}</p><button type="button" class="completion-action" data-view="${escapeHtml(view)}">Open ${escapeHtml(action)}</button>`;
}

function requirementChipMarkup(requirement) {
  const met = String(requirement.met);
  const shortName = requirementShortNames[requirement.id] || requirement.label;
  const mark = requirement.met ? '✓' : '•';
  return `<details class="completion-chip ${requirement.met ? 'met' : 'unmet'}" data-requirement="${escapeHtml(requirement.id)}" data-met="${escapeHtml(met)}">
    <summary><span class="completion-mark" aria-hidden="true">${mark}</span><span>${escapeHtml(shortName)}</span></summary>
    <div class="completion-detail"><strong>${escapeHtml(requirement.label)}</strong>${requirementDetailMarkup(requirement)}</div>
  </details>`;
}

function qaCompletionMarkup(page) {
  const message = page.progress.complete ? '<p>This page’s QA is complete.</p>' : '<p>Expand a requirement to see what remains.</p>';
  return `<section class="qa-completion" aria-label="QA completion"><div class="completion-heading"><h2>QA completion</h2>${message}</div><div class="completion-chips">${page.progress.requirements.map(requirementChipMarkup).join('')}</div></section>`;
}

function viewButton(name, label, short, suffix = '') {
  const selected = state.view === name;
  return `<button type="button" class="view-button ${selected ? 'selected' : ''}" data-view="${name}" aria-pressed="${selected}"><span class="label-full">${label}</span><span class="label-short" aria-hidden="true">${short}</span>${suffix ? `<span class="view-badge">${suffix}</span>` : ''}</button>`;
}

function viewNavigationMarkup(page) {
  const open = page.findings.filter(item => item.status === 'open').length;
  return `<nav class="view-navigation" aria-label="Page QA areas">${viewButton('tests', 'Run checks', 'Checks')}${viewButton('capture', 'See page', 'Page')}${viewButton('review', 'My review', 'Review')}${viewButton('risk', 'Safety & search', 'Safety')}${viewButton('findings', 'Issues', 'Issues', open ? String(open) : '')}</nav>`;
}

function activeViewMarkup(page) {
  if (state.view === 'review') return reviewMarkup(page);
  if (state.view === 'risk') return `<section class="inspector content-panel" aria-label="Risk and connections">${auditMarkup(page)}</section>`;
  if (state.view === 'findings') return `<section class="inspector content-panel" aria-label="Issues">${findingsMarkup(page)}</section>`;
  return qaMarkup(page);
}

function toolbarMarkup(page) {
  const navigation = state.view !== 'overview' && state.view !== 'add-project' && page ? viewNavigationMarkup(page) : '';
  const toolbarClass = navigation ? 'toolbar' : 'toolbar overview-toolbar';
  return `<div class="${toolbarClass}"><button type="button" class="page-menu-toggle" data-action="open-pages">Pages</button>${navigation}</div>`;
}

const addProjectCopy = {
  welcome: { eyebrow: 'Welcome to dogfood', title: 'Add your first project', lede: 'Start with a product URL. dogfood finds its pages and scans each one on desktop and mobile.' },
  add: { eyebrow: 'New project', title: 'Add project', lede: 'Enter a URL and dogfood finds its pages and scans each one on desktop and mobile.' },
};

function onboardingButtonText() {
  if (!state.onboarding.running) return 'Add and scan';
  return state.onboarding.job ? 'Scanning…' : 'Adding project…';
}

function onboardingNoticeMarkup() {
  const progress = state.onboarding.running ? `<p class="onboarding-progress" role="status">${onboardingProgressText()}</p>` : '';
  const error = state.onboarding.error ? `<p class="form-error" role="alert">${escapeHtml(state.onboarding.error)}</p>` : '';
  return `${progress}${error}`;
}

function addProjectFormMarkup(welcome) {
  const copy = addProjectCopy[welcome ? 'welcome' : 'add'];
  const disabled = state.onboarding.running ? 'disabled' : '';
  const cancel = welcome ? '' : `<button class="text-button" type="button" data-action="cancel-add-project" ${disabled}>Cancel</button>`;
  const draft = state.projectDraft;
  return `<section class="add-project-panel content-panel" aria-label="Add project">
    <header class="add-project-heading"><p class="page-route">${copy.eyebrow}</p><h1>${copy.title}</h1><p>${copy.lede}</p></header>
    <form id="add-project-form" novalidate>
      <fieldset ${disabled}>
        <label for="product-url">Product URL<input id="product-url" name="url" type="url" required inputmode="url" placeholder="https://example.com" value="${escapeHtml(draft.url)}"></label>
        <label for="project-name">Name <span class="field-optional">Optional</span><input id="project-name" name="name" type="text" value="${escapeHtml(draft.name)}"></label>
        <label for="browser-profile">Chrome profile <span class="field-optional">Optional</span><input id="browser-profile" name="browserProfile" type="text" value="${escapeHtml(draft.browserProfile)}" aria-describedby="browser-profile-hint"></label>
        <p class="field-hint" id="browser-profile-hint">Chrome profile for signed-in pages, e.g. Default</p>
      </fieldset>
      ${onboardingNoticeMarkup()}
      <div class="form-actions"><button class="save-button" type="submit" ${disabled}>${onboardingButtonText()}</button>${cancel}</div>
    </form>
  </section>`;
}

function onboardingProgressText() {
  if (state.onboarding.total === null) return 'Finding pages…';
  return `Scanning ${escapeHtml(scanPosition(state.onboarding))}`;
}

function welcomeMarkup() {
  return `<main class="welcome-state">${addProjectFormMarkup(true)}</main>`;
}

function pageContentMarkup(page) {
  if (state.view === 'overview') return overviewMarkup();
  if (state.view === 'add-project') return addProjectFormMarkup(false);
  if (!page) return '<div class="workspace-empty"><h2>No pages yet</h2><p>No pages have been added to this project.</p></div>';
  if (state.view === 'capture') return `${pageHeaderMarkup(page)}${qaCompletionMarkup(page)}${seePageMarkup(page)}`;
  return `${pageHeaderMarkup(page)}${qaCompletionMarkup(page)}<div class="view-grid">${activeViewMarkup(page)}${captureMarkup(page)}</div>`;
}

function workspaceMarkup() {
  const page = activePage();
  return `<div class="app-window">${sidebarMarkup()}<main class="work-area">${toolbarMarkup(page)}<div class="page-workspace">${pageContentMarkup(page)}</div></main></div>`;
}

function render() {
  if (!state.project && !state.projects.length) {
    app.innerHTML = `${welcomeMarkup()}<div class="save-message" role="status"></div>`;
    return;
  }
  if (!state.project) return;
  ensureSelection();
  syncQaState();
  syncVisualState();
  app.innerHTML = `${workspaceMarkup()}<div class="save-message" role="status">${escapeHtml(state.message)}</div>`;
}

function visualEndpoint(key) {
  const [projectId, pageId] = key.split('/');
  return `/api/projects/${projectId}/pages/${pageId}/visual-review`;
}

function syncVisualState() {
  if (state.view !== 'capture' || !state.pageId) return;
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
  if (state.view === 'capture') render();
}

function visualRunAllowed() {
  return state.visual.key && !state.visual.loading && !state.visual.running;
}

async function runVisualReview() {
  const key = state.visual.key;
  if (!visualRunAllowed()) return;
  state.visual = { ...state.visual, running: true, error: '' };
  render();
  let result = null;
  let error = '';
  try {
    result = await readJson(visualEndpoint(key), { method: 'POST' });
  } catch (failure) { error = failure.message; }
  finishVisualReview(key, result, error);
}

function finishVisualReview(key, result, error) {
  if (state.visual.key !== key) return;
  state.visual = { ...state.visual, running: false, result: result || state.visual.result, error };
  if (state.view === 'capture') render();
}

function checkedSuggestions(page) {
  const remaining = remainingSuggestions(page, state.visual.result?.review);
  return [...document.querySelectorAll('input[name="suggested-feature"]:checked')].map(box => remaining[Number(box.value)]).filter(item => item);
}

async function addSuggestedFeatures(button) {
  const page = activePage();
  const checked = checkedSuggestions(page);
  if (!checked.length) return;
  button.disabled = true;
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: checked.map(item => ({ name: item.name, expected: item.expected })) }),
    });
    state.message = `Added ${plural(checked.length, 'feature', 'features')} to ${page.name}`;
  } catch (error) { state.message = error.message; }
  render();
}

function updateSuggestedButton() {
  const button = document.querySelector('[data-action="add-suggested-features"]');
  if (!button) return;
  const count = document.querySelectorAll('input[name="suggested-feature"]:checked').length;
  button.textContent = `Add ${plural(count, 'feature', 'features')}`;
  button.disabled = count === 0;
}

function syncQaState() {
  if (!state.pageId) return;
  const key = `${state.project.id}/${state.pageId}`;
  if (state.qa.key === key) return;
  state.qa = { key, version: 0, runs: [], plan: [], planError: '', loading: true, running: false, error: '' };
  void loadQaRuns(key);
}

function qaEndpoint(key) {
  const [projectId, pageId] = key.split('/');
  return `/api/projects/${projectId}/pages/${pageId}/qa-runs`;
}

function currentQaRequest(key, version) {
  return state.qa.key === key && state.qa.version === version;
}

function finishQaLoad(key, version, response) {
  if (!currentQaRequest(key, version)) return false;
  state.qa = { ...state.qa, runs: response.runs, plan: response.plan, planError: response.planError, loading: false };
  return true;
}

function failQaLoad(key, version, error) {
  if (!currentQaRequest(key, version)) return false;
  state.qa = { ...state.qa, loading: false, error: error.message };
  return true;
}

async function loadQaRuns(key) {
  const version = state.qa.version;
  try {
    const response = await readJson(qaEndpoint(key));
    if (!finishQaLoad(key, version, response)) return;
  } catch (error) {
    if (!failQaLoad(key, version, error)) return;
  }
  render();
}

function qaRunAllowed() {
  return !state.qa.running && !state.qa.loading && state.qa.plan.length > 0;
}

function finishQaRun(key, result) {
  if (state.project.id === result.project.id) state.project = result.project;
  if (state.qa.key === key) state.qa = { ...state.qa, running: false, runs: [result.run, ...state.qa.runs].slice(0, 5) };
}

function failQaRun(key, error) {
  if (state.qa.key === key) state.qa = { ...state.qa, running: false, error: error.message };
}

async function runQa() {
  const key = state.qa.key;
  if (!qaRunAllowed()) return;
  state.qa = { ...state.qa, version: state.qa.version + 1, running: true, error: '' };
  render();
  try {
    const result = await readJson(qaEndpoint(key), { method: 'POST' });
    finishQaRun(key, result);
  } catch (error) {
    failQaRun(key, error);
  }
  render();
}

function showError(message) {
  app.innerHTML = `<div class="boot error" role="alert"><h1>dogfood could not open</h1><p>${escapeHtml(message)}</p><button type="button" id="retry">Retry</button></div>`;
}

async function readJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function loadProject(id) {
  state.project = await readJson(`/api/projects/${encodeURIComponent(id)}`);
  state.pageId = null;
  state.view = 'overview';
  state.query = '';
  state.filter = 'all';
  state.sort = 'navigation';
  state.browseOpen = false;
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.scan = { key: '', running: false, error: '' };
  state.scanAll = { running: false, total: null, scanned: 0, current: '', error: '' };
  state.onboarding = { job: '', running: false, total: null, scanned: 0, current: null, error: '' };
  state.projectDraft = { url: '', name: '', browserProfile: '' };
  state.qa.key = '';
  state.visual.key = '';
  state.message = '';
  render();
}

async function start() {
  try {
    state.projects = await readJson('/api/projects');
    if (!state.projects.length) {
      state.project = null;
      state.view = 'add-project';
      render();
      return;
    }
    await loadProject(state.projects[0].id);
  } catch (error) { showError(error.message); }
}

function reviewFromForm(form, page) {
  const data = new FormData(form);
  const entry = prefix => ({ status: data.get(`${prefix}.status`), note: data.get(`${prefix}.note`) });
  return {
    checks: Object.fromEntries(Object.keys(checkNames).map(key => [key, entry(`check-${key}`)])),
    features: page.features.map(feature => ({ id: feature.id, ...entry(`feature-${feature.id}`) })),
  };
}

function auditFromForm(form) {
  const audit = Object.fromEntries(Object.keys(auditNames).map(key => [key, [...form.querySelectorAll(`[data-audit-row="${key}"]`)].map(row => ({
    id: row.dataset.id,
    question: row.querySelector('.audit-question').value,
    status: row.querySelector('.audit-status').value,
    note: row.querySelector('.audit-note').value,
  }))]));
  const connections = [...form.querySelectorAll('[data-connection-row]')].map(row => ({
    id: row.dataset.id,
    name: row.querySelector('.connection-name').value,
    method: row.querySelector('.connection-method').value,
    endpoint: row.querySelector('.connection-endpoint-input').value,
    sends: row.querySelector('.connection-sends').value,
    receives: row.querySelector('.connection-receives').value,
    source: row.querySelector('.connection-source-input').value,
    provenance: row.querySelector('.connection-provenance').value,
  }));
  return { audit, connections };
}

async function saveAudit(form) {
  const page = activePage();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/audit`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditFromForm(form)),
    });
    state.auditEditing = false;
    state.message = `Saved ${page.name} checklist locally.`;
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save checklist';
    const box = form.querySelector('#audit-error');
    box.hidden = false;
    box.textContent = error.message;
    box.scrollIntoView({ block: 'nearest' });
  }
}

async function saveReview(form) {
  const page = activePage();
  const body = reviewFromForm(form, page);
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/review`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    state.editing = false;
    state.message = `Saved ${page.name} review locally.`;
    render();
  } catch (error) {
    const box = document.querySelector('#form-error');
    box.hidden = false;
    box.textContent = error.message;
    box.scrollIntoView({ block: 'nearest' });
  }
}

function findingEndpoint(page, id = '') {
  return `/api/projects/${state.project.id}/pages/${page.id}/findings${id ? `/${id}` : ''}`;
}

function showFindingError(error) {
  const box = document.querySelector('#finding-error');
  box.hidden = false;
  box.textContent = error.message;
  box.scrollIntoView({ block: 'nearest' });
}

async function submitFinding(form, endpoint, method, body, message) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const project = await readJson(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (state.project.id !== project.id) return;
    state.project = project;
    state.findingForm = null;
    state.message = message;
    render();
  } catch (error) {
    if (!document.contains(form)) return;
    button.disabled = false;
    button.textContent = label;
    showFindingError(error);
  }
}

async function saveFinding(form) {
  const page = activePage();
  const data = new FormData(form);
  const body = { title: data.get('title'), severity: data.get('severity'), detail: data.get('detail'), attachCapture: data.has('attachCapture') };
  await submitFinding(form, findingEndpoint(page), 'POST', body, `Saved issue on ${page.name}.`);
}

async function resolveFinding(form) {
  const page = activePage();
  const body = { status: 'resolved', note: new FormData(form).get('note') };
  await submitFinding(form, findingEndpoint(page, form.dataset.findingId), 'PUT', body, 'Issue resolved with a retest note.');
}

async function reopenFinding(id) {
  const page = activePage();
  try {
    state.project = await readJson(findingEndpoint(page, id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) });
    state.message = 'Issue reopened.';
    render();
  } catch (error) { state.message = error.message; render(); }
}

function cancelFindingForm() {
  const previous = state.findingForm;
  state.findingForm = null;
  state.message = '';
  render();
  focusFindingAction(previous);
}

function openFindingForm(id) {
  state.findingForm = id;
  state.editing = false;
  state.auditEditing = false;
  render();
  document.querySelector(id === 'new' ? '#finding-title' : '#retest-note')?.focus();
}

function handleFindingButton(button) {
  const action = button.dataset.findingAction;
  if (action === 'reopen') { button.disabled = true; return reopenFinding(button.dataset.findingId); }
  if (action === 'cancel') return cancelFindingForm();
  openFindingForm(action === 'new' ? 'new' : button.dataset.findingId);
}

function focusFindingAction(id) {
  if (id === 'new') return document.querySelector('.add-finding')?.focus();
  const button = [...document.querySelectorAll('.finding-action')].find(item => item.dataset.findingId === id);
  button?.focus();
}

function selectPage(id) {
  state.pageId = id;
  state.view = defaultView(activePage());
  state.browseOpen = false;
  state.query = '';
  state.filter = 'all';
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.message = '';
  render();
  document.querySelector('#selected-page-heading')?.focus();
}

function selectOverview() {
  state.view = 'overview';
  state.browseOpen = false;
  state.message = '';
  render();
  document.querySelector('[data-overview]')?.focus({ preventScroll: true });
}

function selectFilter(filter) {
  state.filter = filter;
  state.editing = false;
  state.auditEditing = false;
  state.findingForm = null;
  state.message = '';
  render();
}

function openAuditEditor() {
  state.auditEditing = true;
  state.findingForm = null;
  render();
  document.querySelector('.audit-question')?.focus();
}

function closeAuditEditor() {
  state.auditEditing = false;
  state.message = '';
  render();
  document.querySelector('.audit-button')?.focus();
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

function blockOpenFormNavigation() {
  if (!document.querySelector('#review-form, #audit-form, #finding-form, #resolution-form')) return false;
  state.message = 'Save or cancel the open form before changing pages or views.';
  document.querySelector('.save-message').textContent = state.message;
  return true;
}

const buttonActions = new Map([
  ['open-pages', openPages],
  ['close-pages', closePages],
  ['edit', () => { state.editing = true; state.findingForm = null; render(); }],
  ['cancel', () => { state.editing = false; state.message = ''; render(); }],
  ['audit-edit', openAuditEditor],
  ['audit-cancel', closeAuditEditor],
  ['remove-row', removeAuditRow],
  ['add-check', button => addAuditRow(button.dataset.key)],
  ['add-connection', addConnectionRow],
  ['run-qa', runQa],
  ['run-visual', runVisualReview],
  ['add-suggested-features', addSuggestedFeatures],
  ['scan', scanActivePage],
  ['scan-all', scanAllPages],
  ['screenshot-device', button => { state.screenshotDevice = button.dataset.screenshotDevice; render(); }],
  ['add-project', openAddProject],
  ['cancel-add-project', () => { state.view = 'overview'; render(); }],
]);

const idleOnboarding = { job: '', running: false, total: null, scanned: 0, current: null, error: '' };

function openAddProject() {
  if (blockOpenFormNavigation()) return;
  state.view = 'add-project';
  state.browseOpen = false;
  state.onboarding = { ...idleOnboarding };
  render();
  document.querySelector('#product-url')?.focus();
}

function isHttpUrl(value) {
  return URL.canParse(value ?? '') && ['http:', 'https:'].includes(new URL(value).protocol);
}

// Only fields the person filled in are sent; the server fills in the rest.
function onboardingInput(form) {
  const data = new FormData(form);
  return Object.fromEntries(['url', 'name', 'browserProfile'].map(key => [key, String(data.get(key) ?? '').trim()]).filter(([, value]) => value));
}

function failOnboarding(message) {
  state.onboarding = { ...state.onboarding, running: false, error: message };
  render();
}

async function submitOnboarding(form) {
  const input = onboardingInput(form);
  state.projectDraft = { url: '', name: '', browserProfile: '', ...input };
  if (!isHttpUrl(input.url)) return failOnboarding('Enter the product URL, starting with http:// or https://.');
  state.onboarding = { ...idleOnboarding, running: true };
  render();
  try {
    const { job } = await readJson('/api/onboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    state.onboarding.job = job;
    await followOnboarding(job);
  } catch (error) { failOnboarding(error.message); }
}

// Polls the onboarding job once a second until it finishes, then opens the new project.
async function followOnboarding(job) {
  const status = await readJson(`/api/jobs/${encodeURIComponent(job)}`);
  if (status.status === 'failed') throw new Error(status.error || 'Onboarding failed.');
  if (status.status === 'done') return openOnboardedProject(status.projectId);
  Object.assign(state.onboarding, { total: status.total, scanned: status.scanned, current: status.current });
  render();
  await new Promise(done => setTimeout(done, 1000));
  return followOnboarding(job);
}

async function openOnboardedProject(id) {
  state.projects = await readJson('/api/projects');
  await loadProject(id);
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

async function scanAllPages() {
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

async function scanActivePage() {
  const page = activePage();
  const key = `${state.project.id}/${page.id}`;
  if (state.scan.running) return;
  state.scan = { key, running: true, error: '' };
  render();
  try {
    const project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/scan`, { method: 'POST' });
    if (project.id === state.project.id) state.project = project;
    state.scan = { key, running: false, error: '' };
    state.visual.key = '';
  } catch (error) { state.scan = { key, running: false, error: error.message }; }
  render();
}

function navigationRequested(button) {
  return button.dataset.page || button.dataset.view || button.dataset.overview !== undefined;
}

function selectView(name) {
  state.view = name;
  if (name === 'capture') state.visual.key = '';
  state.message = '';
  render();
  document.querySelector(`[data-view="${name}"]`)?.focus({ preventScroll: true });
}

function handleNavigationButton(button) {
  if (button.dataset.overview !== undefined) { selectOverview(); return true; }
  if (button.dataset.page) { selectPage(button.dataset.page); return true; }
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
  if (list) list.innerHTML = pageOptionsMarkup(visiblePages());
}

function removeAuditRow(button) {
  const row = button.closest('[data-audit-row], [data-connection-row]');
  const list = row.parentElement;
  if (list.children.length === 1) return showAuditInlineError('Keep at least one entry in each section.');
  row.remove();
  list.querySelector('input')?.focus();
}

function showAuditInlineError(message) {
  const box = document.querySelector('#audit-error');
  box.hidden = false;
  box.textContent = message;
}

function addAuditRow(key) {
  const list = document.querySelector(`[data-audit-group="${key}"] .audit-edit-list`);
  list.insertAdjacentHTML('beforeend', auditItemEditor({ id: crypto.randomUUID(), question: '', status: 'untested', note: '' }, key));
  list.lastElementChild.querySelector('input')?.focus();
}

function addConnectionRow() {
  const list = document.querySelector('#connection-edit-list');
  list.insertAdjacentHTML('beforeend', connectionEditor({ id: crypto.randomUUID(), name: '', method: 'GET', endpoint: '', sends: '', receives: '', source: '', provenance: 'manual' }));
  list.lastElementChild.querySelector('input')?.focus();
}

app.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'retry') return start();
  if (button.dataset.findingAction) return handleFindingButton(button);
  handleButton(button);
});

function handleProjectSelection(select) {
  if (blockOpenFormNavigation()) { select.value = state.project.id; return; }
  loadProject(select.value).catch(error => showError(error.message));
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

app.addEventListener('change', event => {
  if (event.target.id === 'project-select') return handleProjectSelection(event.target);
  if (event.target.id === 'page-filter') return handlePageFilter(event.target);
  if (event.target.id === 'page-sort') return handlePageSort(event.target);
  if (event.target.name === 'suggested-feature') updateSuggestedButton();
});

app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.browseOpen && matchMedia('(max-width: 760px)').matches) closePages();
});

app.addEventListener('input', event => {
  if (event.target.id !== 'page-search') return;
  if (blockOpenFormNavigation()) { event.target.value = state.query; return; }
  state.query = event.target.value;
  renderSidebarPageList();
});

const formHandlers = new Map([
  ['review-form', saveReview],
  ['finding-form', saveFinding],
  ['resolution-form', resolveFinding],
  ['audit-form', saveAudit],
  ['add-project-form', submitOnboarding],
]);

app.addEventListener('submit', event => {
  const handler = formHandlers.get(event.target.id);
  if (!handler) return;
  event.preventDefault();
  handler(event.target);
});

start();
