import { readJson, visualEndpoint } from '../api.mjs';
import { dateLabel, escapeHtml, externalLinkMarkup, plural, relativeCaptureAge, safeCapturePath, safeServedImagePath, scanLoadTime } from '../format.mjs';
import { deviceNames, deviceViewports, scanAccessibilityNames, scanHeaderNames, scanSeoNames, state, tierNames } from '../state.mjs';
import { render } from '../app.mjs';

function captureImageMarkup(page, capture, imagePath) {
  if (imagePath) return `<a class="capture-image-link" href="${imagePath}" target="_blank" rel="noopener" aria-label="Open full-size screenshot of ${escapeHtml(page.name)}"><img src="${imagePath}" alt="${escapeHtml(page.name)} page captured at ${escapeHtml(capture.viewport)}" loading="eager"></a>`;
  return `<div class="missing-capture"><strong>Not captured</strong><p>${escapeHtml(capture.reason || 'Not captured yet.')}</p><button type="button" class="text-button" data-action="scan">Scan page</button></div>`;
}

function captureEvidence(capture, imagePath) {
  if (!imagePath) return escapeHtml(capture.reason || 'Not captured yet.');
  const tier = tierNames[capture.tier] || capture.tier;
  return `${escapeHtml(tier)} · ${escapeHtml(capture.actor)} · ${escapeHtml(capture.pixelWidth)} × ${escapeHtml(capture.pixelHeight)} px. Rendering only.`;
}

function captureImagePath(capture) {
  return capture.state === 'rendered' ? safeCapturePath(capture.path) : '';
}

export function captureFrameMarkup(page, device) {
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
  if (!change.changed) return `<div class="change-device"><h3>${escapeHtml(deviceNames[device])}: no visual change</h3></div>`;
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

export function seePageMarkup(page) {
  return `<div class="see-page-content"><section class="capture-gallery" aria-label="Page screenshots">${captureFrameMarkup(page, 'desktop')}${captureFrameMarkup(page, 'mobile')}</section>${visualChangesMarkup(page)}${scanResultsMarkup(page)}${visualReviewMarkup(page)}</div>`;
}

const clarityDimensions = { highlighted: 'Highlighted', obvious: 'Obvious', clear: 'Clear' };

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

export function remainingSuggestions(page, review) {
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

export function syncVisualState() {
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
