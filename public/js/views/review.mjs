import { readJson } from '../api.mjs';
import { escapeHtml, statusPill, verdictByMarkup } from '../format.mjs';
import { activePage, checkNames, reviewedChecks, state } from '../state.mjs';
import { render } from '../app.mjs';

function featureMarkup(feature) {
  const expected = feature.expected ? `<p class="feature-expected"><span>Expected</span> ${escapeHtml(feature.expected)}</p>` : '';
  const evidence = feature.note ? `<p class="check-note">${escapeHtml(feature.note)}</p>` : '';
  return `<li class="feature"><div><strong>${escapeHtml(feature.name)}</strong>${expected}${evidence}${verdictByMarkup(feature.by, feature.at)}</div>${statusPill(feature.status)}</li>`;
}

function checkMarkup(key, entry) {
  const [name, question] = checkNames[key];
  return `<div class="check"><div class="check-heading"><strong>${escapeHtml(name)}</strong>${statusPill(entry.status)}</div><p class="check-question">${escapeHtml(question)}</p>${entry.note ? `<p class="check-note">${escapeHtml(entry.note)}</p>` : ''}${verdictByMarkup(entry.by, entry.at)}</div>`;
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

export function reviewMarkup(page) {
  const tested = page.features.filter(item => item.status !== 'untested').length;
  const edit = state.editing ? editorMarkup(page) : `<button type="button" class="review-button" data-action="edit">Review this page</button>`;
  return `<section class="inspector content-panel" aria-label="Page review"><div class="inspector-top"><div><h2>Does this page work for people?</h2><p class="review-intro">Check the features and quality questions, then save what you observed.</p></div><span class="review-progress">${reviewedChecks(page)} / 5 reviewed</span></div><section class="inspector-section"><div class="section-heading"><h3>Features on this page</h3><span>${tested} / ${page.features.length} checked</span></div><ul class="features">${page.features.map(featureMarkup).join('')}</ul></section><section class="inspector-section"><div class="section-heading"><h3>Quality questions</h3><span>${reviewedChecks(page)} / 5</span></div><div class="checks">${Object.entries(page.checks).map(([key, entry]) => checkMarkup(key, entry)).join('')}</div></section><section class="inspector-section guidelines"><details><summary>Design guidelines for this project</summary><ul>${state.project.guidelines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details></section>${edit}</section>`;
}

function reviewFromForm(form, page) {
  const data = new FormData(form);
  const entry = prefix => ({ status: data.get(`${prefix}.status`), note: data.get(`${prefix}.note`) });
  return {
    checks: Object.fromEntries(Object.keys(checkNames).map(key => [key, entry(`check-${key}`)])),
    features: page.features.map(feature => ({ id: feature.id, ...entry(`feature-${feature.id}`) })),
  };
}

export async function saveReview(form) {
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
