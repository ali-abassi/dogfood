import { readJson } from '../api.mjs';
import { answerMarkMarkup, escapeHtml, plural, verdictByMarkup } from '../format.mjs';
import { activePage, state } from '../state.mjs';
import { render } from '../app.mjs';
import { answerFor, answerPanelMarkup, backMarkup } from './answer.mjs';
import { findingsMarkup } from './issues.mjs';
import { qaMarkup } from './tests.mjs';

function thingMarkup(feature) {
  const expected = feature.expected || 'What should happen is not written down yet.';
  const note = feature.note ? `<p class="thing-note">${escapeHtml(feature.note)}</p>` : '';
  return `<li class="thing" data-thing>${answerMarkMarkup(feature.name, feature.status)}<div><strong class="thing-name">${escapeHtml(feature.name)}</strong><p class="thing-expected">${escapeHtml(expected)}</p>${note}${verdictByMarkup(feature.by, feature.at)}</div></li>`;
}

function thingOptions(status) {
  return [['untested', 'Not checked'], ['pass', 'Works'], ['needs_work', 'Needs work']].map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`).join('');
}

function thingEditorMarkup(feature) {
  const id = `thing-${feature.id}`;
  return `<div class="question-edit" data-thing-row data-id="${escapeHtml(feature.id)}"><label for="${escapeHtml(id)}-status">${escapeHtml(feature.name)}</label><select id="${escapeHtml(id)}-status">${thingOptions(feature.status)}</select><label class="sr-only" for="${escapeHtml(id)}-note">What happened when you tried it?</label><textarea id="${escapeHtml(id)}-note" rows="2" maxlength="1200" placeholder="What happened when you tried it? Needed for Works or Needs work.">${escapeHtml(feature.note)}</textarea></div>`;
}

function thingsFormMarkup(page) {
  return `<form id="things-form" class="questions-form">${page.features.map(thingEditorMarkup).join('')}<div id="things-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save answers</button><button class="text-button" type="button" data-action="cancel-things">Cancel</button></div></form>`;
}

function addThingMarkup() {
  if (!state.addingThing) return '<button type="button" class="link-button" data-action="add-thing">Add a thing people can do</button>';
  return `<form id="add-thing-form" class="finding-form" novalidate><label for="thing-name">What can people do here?</label><input id="thing-name" name="name" required maxlength="80" placeholder="For example: Book a lesson for a child"><label for="thing-expected">What should happen when it works?</label><input id="thing-expected" name="expected" required maxlength="200" placeholder="For example: the booking is confirmed and an email arrives"><div id="add-thing-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="text-button" type="submit">Add</button><button class="text-button" type="button" data-action="cancel-add-thing">Cancel</button></div></form>`;
}

export function remainingSuggestions(page, review) {
  const names = new Set(page.features.map(feature => feature.name.toLowerCase()));
  return (review?.analysis?.suggestedFeatures || []).filter(item => !names.has(String(item.name).toLowerCase()));
}

function suggestionMarkup(item, index) {
  return `<label class="suggested-feature"><input type="checkbox" name="suggested-feature" value="${index}" checked><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.expected)}</small></span></label>`;
}

function suggestionsMarkup(page) {
  const remaining = remainingSuggestions(page, state.visual.result?.review);
  if (!remaining.length) return '';
  return `<section class="page-suggestions" aria-label="Suggested by the AI"><h3>The AI thinks people can also do these</h3><div class="suggested-list">${remaining.map(suggestionMarkup).join('')}</div><button type="button" class="text-button" data-action="add-suggested-features">Add ${plural(remaining.length, 'thing', 'things')}</button></section>`;
}

function thingsMarkup(page) {
  const body = state.thingsEditing ? thingsFormMarkup(page) : `<ul class="things">${page.features.map(thingMarkup).join('')}</ul>`;
  const empty = page.features.length ? '' : '<p class="muted">Nothing is listed yet. Add what people come to this page to do, or let the AI suggest it.</p>';
  const update = page.features.length && !state.thingsEditing ? '<button type="button" class="text-button" data-action="edit-things">Update answers</button>' : '';
  return `<section class="content-panel" aria-label="Things you can do here"><div class="panel-heading"><h2>Things you can do here</h2>${update}</div>${empty}${body}${addThingMarkup()}${suggestionsMarkup(page)}</section>`;
}

function scanErrorsMarkup(page) {
  const problems = page.progress.scanProblems.filter(problem => !problem.endsWith('scrolls sideways'));
  if (!problems.length) return '';
  return `<section class="content-panel" aria-label="Found by the page check"><h2>Found by the page check</h2><ul class="plain-list">${problems.map(problem => `<li>${escapeHtml(problem)}</li>`).join('')}</ul></section>`;
}

function connectionMarkup(row) {
  return `<li><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.method)} ${escapeHtml(row.endpoint)}</span><small>Sends ${escapeHtml(row.sends)} · Gets ${escapeHtml(row.receives)}</small></li>`;
}

function connectionsMarkup(page) {
  if (!page.connections.length) return '';
  return `<details class="content-panel fact-disclosure" data-connections><summary>Data this page loads and sends · ${page.connections.length}</summary><ul class="connection-list">${page.connections.map(connectionMarkup).join('')}</ul></details>`;
}

export function worksMarkup(page) {
  const answer = answerFor(page, 'works');
  const tests = page.qa.tests.length ? qaMarkup(page) : '';
  return `<section class="answer-detail" data-answer-detail="works">${backMarkup(page)}<h1 id="answer-heading" tabindex="-1">${escapeHtml(answer.name)}</h1><p class="answer-question">${escapeHtml(answer.question)}</p>${answerPanelMarkup(page, answer)}${thingsMarkup(page)}${findingsMarkup(page)}${scanErrorsMarkup(page)}${tests}${connectionsMarkup(page)}</section>`;
}

export async function addThing(form) {
  const page = activePage();
  const data = new FormData(form);
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/features`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: [{ name: String(data.get('name')).trim(), expected: String(data.get('expected')).trim() }] }),
    });
    Object.assign(state, { addingThing: false, message: 'Added' });
    render();
  } catch (error) {
    const box = form.querySelector('#add-thing-error');
    box.hidden = false;
    box.textContent = error.message;
  }
}
