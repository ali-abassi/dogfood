import { escapeHtml, plural, statusPill } from '../format.mjs';
import { state } from '../state.mjs';

// Good, needs work, and everything not fully checked; each part is named only when it has features in it.
function featureCounts(features) {
  const good = features.filter(feature => feature.status === 'pass').length;
  const needs = features.filter(feature => feature.status === 'needs_work').length;
  return [['pass', good, 'good'], ['needs_work', needs, 'need work'], ['untested', features.length - good - needs, 'not fully checked']];
}

function summaryMarkup(features) {
  const counts = featureCounts(features);
  const parts = counts.filter(([, count]) => count).map(([, count, label]) => `${count} ${label}`);
  const bar = counts.filter(([, count]) => count)
    .map(([status, count]) => `<span class="feature-bar-part status-${status}" style="flex-grow:${count}"></span>`).join('');
  return `<p>${escapeHtml([plural(features.length, 'core feature', 'core features'), ...parts].join(' · '))}</p><div class="feature-bar" aria-hidden="true">${bar}</div>`;
}

function pageLinkMarkup(pageId) {
  const page = state.project.pages.find(item => item.id === pageId);
  return page ? `<button type="button" class="feature-page" data-page="${escapeHtml(page.id)}">${escapeHtml(page.name)}</button>` : '';
}

function featureMarkup(feature) {
  const summary = feature.summary ? `<p>${escapeHtml(feature.summary)}</p>` : '';
  return `<li class="core-feature" data-status="${escapeHtml(feature.status)}">
    <div class="core-feature-head"><h2>${escapeHtml(feature.name)}</h2>${statusPill(feature.status)}</div>
    ${summary}<div class="feature-pages">${feature.pageIds.map(pageLinkMarkup).join('')}</div>
  </li>`;
}

export function featuresMarkup() {
  const features = state.project.coreFeatures ?? [];
  const lede = features.length ? summaryMarkup(features) : '<p>The app’s main capabilities, each checked through the pages that deliver it.</p>';
  const body = features.length
    ? `<ul class="core-features content-panel">${features.map(featureMarkup).join('')}</ul>`
    : '<div class="doc-empty content-panel"><h2>No core features yet</h2><p>Ask your coding agent to name this app’s main features with dogfood_set_core_features.</p></div>';
  return `<section class="overview-content" aria-label="Features"><header class="overview-heading"><div class="features-lede"><h1>Features</h1>${lede}</div></header>${body}</section>`;
}
