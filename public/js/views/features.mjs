import { escapeHtml, plural, statusPill } from '../format.mjs';
import { state } from '../state.mjs';

function featuresSentence(features) {
  const count = status => features.filter(feature => feature.status === status).length;
  const rest = features.length - count('pass') - count('needs_work');
  return `${plural(features.length, 'core feature', 'core features')}: ${count('pass')} good, ${count('needs_work')} need work, ${rest} not fully checked yet.`;
}

function pageLinkMarkup(pageId) {
  const page = state.project.pages.find(item => item.id === pageId);
  return page ? `<button type="button" class="feature-page" data-page="${escapeHtml(page.id)}">${escapeHtml(page.name)}</button>` : '';
}

function featureMarkup(feature) {
  const summary = feature.summary ? `<p>${escapeHtml(feature.summary)}</p>` : '';
  return `<li class="core-feature" data-status="${escapeHtml(feature.status)}">
    <div class="core-feature-text"><h2>${escapeHtml(feature.name)}</h2>${summary}<div class="feature-pages">${feature.pageIds.map(pageLinkMarkup).join('')}</div></div>
    ${statusPill(feature.status)}
  </li>`;
}

export function featuresMarkup() {
  const features = state.project.coreFeatures ?? [];
  const sentence = features.length ? featuresSentence(features) : 'The app’s main capabilities, each checked through the pages that deliver it.';
  const body = features.length
    ? `<ul class="core-features content-panel">${features.map(featureMarkup).join('')}</ul>`
    : '<div class="content-panel features-empty"><p>No core features yet. Ask your coding agent to name this app’s main features with dogfood_set_core_features.</p></div>';
  return `<section class="overview-content" aria-label="Features"><header class="overview-heading"><div><h1>Features</h1><p>${escapeHtml(sentence)}</p></div></header>${body}</section>`;
}
