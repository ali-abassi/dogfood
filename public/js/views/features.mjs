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
  return `<p class="feature-counts">${escapeHtml([plural(features.length, 'core feature', 'core features'), ...parts].join(' · '))}</p>`;
}

function pageLinkMarkup(pageId) {
  const page = state.project.pages.find(item => item.id === pageId);
  return page ? `<button type="button" class="feature-page" data-page="${escapeHtml(page.id)}" aria-label="Open ${escapeHtml(page.name)} page evidence">${escapeHtml(page.name)} <span aria-hidden="true">→</span></button>` : '';
}

function evidenceMarkup(feature) {
  const links = feature.pageIds.map(pageLinkMarkup).filter(Boolean);
  if (!links.length) return '<p class="feature-no-evidence">No linked pages yet. Ask your coding agent to link the pages that deliver this feature.</p>';
  return `<div class="feature-evidence"><p>Page evidence</p><div class="feature-pages">${links.join('')}</div></div>`;
}

function featureMarkup(feature) {
  const summary = feature.summary ? `<p>${escapeHtml(feature.summary)}</p>` : '';
  return `<li class="core-feature" data-status="${escapeHtml(feature.status)}">
    <div class="core-feature-head"><h2>${escapeHtml(feature.name)}</h2>${statusPill(feature.status)}</div>
    ${summary}${evidenceMarkup(feature)}
  </li>`;
}

export function featuresMarkup() {
  const features = state.project.coreFeatures ?? [];
  const lede = '<p>The main things people can do in this app. Results come from the linked page checks.</p>';
  const body = features.length
    ? `<ul class="core-features content-panel">${features.map(featureMarkup).join('')}</ul>`
    : '<div class="doc-state content-panel"><h2>No core features yet</h2><p>Ask your coding agent to list this app’s main capabilities and link each one to the pages that deliver it.</p><p>Each linked page will show what works and what still needs checking.</p><button type="button" class="save-button" data-project-view="overview">View pages</button></div>';
  const action = features.length ? '<button type="button" class="text-button" data-project-view="overview">View pages</button>' : '';
  return `<section class="overview-content features-view" aria-label="Features"><header class="overview-heading"><div class="features-lede"><h1>Features</h1>${lede}${features.length ? summaryMarkup(features) : ''}</div>${action}</header>${body}</section>`;
}
