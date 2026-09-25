import { readJson } from '../api.mjs';
import { answerMarkMarkup, escapeHtml, secondsLabel, sourceLabel, verdictByMarkup } from '../format.mjs';
import { activePage, answerWords, questionTopics, state } from '../state.mjs';
import { render } from '../app.mjs';

// Which checklist topics each answer asks, and which answers a person can judge directly.
const answerTopics = { ease: ['accessibility'], safety: ['security', 'scraping'], speed: ['seo'] };
const judged = new Set(['design', 'purpose', 'ease']);

export function answerFor(page, id) {
  return page.progress.answers.find(answer => answer.id === id);
}

export function backMarkup(page) {
  return `<button type="button" class="back-button" data-action="back-to-report">‹ ${escapeHtml(page.name)}</button>`;
}

function partMarkup(part) {
  return `<li>${answerMarkMarkup(sourceLabel(part), part.status)}<div><p>${escapeHtml(part.text)}</p><small>${escapeHtml(sourceLabel(part))}</small></div></li>`;
}

// More than one piece of evidence goes into an answer; each is listed with where it came from.
function partsMarkup(answer) {
  if (answer.parts.length < 2) return '';
  return `<ul class="answer-parts" aria-label="What this answer is made of">${answer.parts.map(partMarkup).join('')}</ul>`;
}

function editAnswerMarkup(answer) {
  if (!judged.has(answer.id)) return '';
  if (state.answerEditing) return answerFormMarkup(answer);
  return '<button type="button" class="save-button" data-action="edit-answer">Update answer</button>';
}

export function answerPanelMarkup(page, answer) {
  const lead = answer.parts.find(part => part.text === answer.summary) ?? answer.parts[0];
  return `<section class="answer-panel content-panel" aria-label="The answer"><div class="answer-verdict">${answerMarkMarkup(answer.name, answer.status)}<strong>${escapeHtml(answerWords[answer.status])}</strong></div><p class="answer-text">${escapeHtml(answer.summary)}</p><p class="answer-source" data-answer-source>${escapeHtml(sourceLabel(lead))}</p>${partsMarkup(answer)}${editAnswerMarkup(answer)}</section>`;
}

function answerFormMarkup(answer) {
  const current = activePage().checks[answer.id];
  const choice = (value, label) => `<label class="choice"><input type="radio" name="status" value="${value}" ${current.status === value ? 'checked' : ''} required> ${label}</label>`;
  return `<form id="answer-form" class="answer-form" data-answer="${escapeHtml(answer.id)}"><fieldset><legend>Your answer to “${escapeHtml(answer.question)}”</legend><div class="choices">${choice('pass', 'Good')}${choice('needs_work', 'Needs work')}</div></fieldset><label for="answer-note">What did you see?</label><textarea id="answer-note" name="note" rows="3" maxlength="1200" placeholder="For example: the Book button is hard to find on a phone.">${escapeHtml(current.note)}</textarea><div id="answer-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save answer</button><button class="text-button" type="button" data-action="cancel-answer">Cancel</button></div></form>`;
}

function questionMarkup(row, topic) {
  const note = row.note ? `<p class="question-note">${escapeHtml(row.note)}</p>` : '';
  const status = row.status === 'untested' ? 'untested' : row.status;
  return `<li class="question" data-question>${answerMarkMarkup(row.question, status)}<div><strong>${escapeHtml(row.question)}</strong><span class="question-topic">${escapeHtml(questionTopics[topic])} · ${escapeHtml(answerWords[status])}</span>${note}${verdictByMarkup(row.by, row.at)}</div></li>`;
}

function questionOptions(status) {
  return [['untested', 'Not checked'], ['pass', 'Good'], ['needs_work', 'Needs work']].map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${label}</option>`).join('');
}

function questionEditorMarkup(row, topic) {
  const id = `${topic}-${row.id}`;
  return `<div class="question-edit" data-question-row data-topic="${escapeHtml(topic)}" data-id="${escapeHtml(row.id)}"><label for="${escapeHtml(id)}-status">${escapeHtml(row.question)}</label><select id="${escapeHtml(id)}-status">${questionOptions(row.status)}</select><label class="sr-only" for="${escapeHtml(id)}-note">What did you see?</label><textarea id="${escapeHtml(id)}-note" rows="2" maxlength="1200" placeholder="What did you see? Needed for Good or Needs work.">${escapeHtml(row.note)}</textarea></div>`;
}

function questionsFormMarkup(page, topics) {
  const rows = topics.flatMap(topic => page.audit[topic].map(row => questionEditorMarkup(row, topic))).join('');
  return `<form id="questions-form" class="questions-form">${rows}<div id="questions-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save answers</button><button class="text-button" type="button" data-action="cancel-questions">Cancel</button></div></form>`;
}

function questionsMarkup(page, topics) {
  if (state.questionsEditing) return `<section class="content-panel" aria-label="Questions"><h2>Questions</h2>${questionsFormMarkup(page, topics)}</section>`;
  const rows = topics.flatMap(topic => page.audit[topic].map(row => questionMarkup(row, topic))).join('');
  const primary = judged.has(state.view) ? 'text-button' : 'save-button';
  return `<section class="content-panel" aria-label="Questions"><div class="panel-heading"><h2>Questions</h2><button type="button" class="${primary}" data-action="answer-questions">Answer questions</button></div><ul class="questions">${rows}</ul></section>`;
}

function factMarkup(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function presentOrMissing(value) {
  return value ? `Present: ${value}` : 'Missing';
}

function speedFactsMarkup(page) {
  if (!page.scan) return '<section class="content-panel" aria-label="Measured"><h2>Measured</h2><p class="muted">Not measured yet. Check the page to time it.</p></section>';
  const [desktop, mobile] = [page.scan.viewports.desktop, page.scan.viewports.mobile];
  return `<section class="content-panel" aria-label="Measured"><h2>Measured</h2><dl class="facts">${factMarkup('Load time on a computer', secondsLabel(desktop.loadMs))}${factMarkup('Load time on a phone', secondsLabel(mobile.loadMs))}${factMarkup('Page title', presentOrMissing(desktop.seo.title))}${factMarkup('Search description', presentOrMissing(desktop.seo.description))}${factMarkup('Main headings', String(desktop.seo.h1Count))}${factMarkup('Language', desktop.seo.lang || 'Not set')}</dl></section>`;
}

const headerWords = { 'content-security-policy': 'Limits which scripts can run', 'strict-transport-security': 'Always uses a secure connection', 'x-frame-options': 'Cannot be hidden inside another site', 'x-content-type-options': 'Files are read only as their real type', 'referrer-policy': 'Limits what other sites learn about visitors' };

function safetyFactsMarkup(page) {
  if (!page.scan) return '';
  const headers = page.scan.viewports.desktop.headers;
  const rows = Object.entries(headerWords).map(([name, words]) => factMarkup(words, headers[name] ? 'Yes' : 'No')).join('');
  return `<details class="content-panel fact-disclosure"><summary>Protections the page asks browsers for</summary><dl class="facts">${rows}</dl></details>`;
}

function easeFactsMarkup(page) {
  if (!page.scan) return '';
  const { desktop, mobile } = page.scan.viewports;
  const counts = mobile.accessibility;
  return `<section class="content-panel" aria-label="Measured"><h2>Measured</h2><dl class="facts">${factMarkup('Scrolls sideways on a phone', mobile.horizontalOverflow ? 'Yes' : 'No')}${factMarkup('Scrolls sideways on a computer', desktop.horizontalOverflow ? 'Yes' : 'No')}${factMarkup('Images without a description', String(counts.imagesWithoutAlt))}${factMarkup('Fields without a label', String(counts.unlabeledFields))}${factMarkup('Buttons without a name', String(counts.unnamedButtons))}</dl></section>`;
}

function currentAnalysis() {
  const result = state.visual.result;
  return result?.review && !result.stale ? result.review.analysis : null;
}

function purposeFactsMarkup(id, analysis) {
  if (id !== 'purpose') return '';
  return `<dl class="facts">${factMarkup('What the page seems to be for', analysis.pagePurpose)}${factMarkup('The main thing to do', analysis.primaryAction)}</dl>`;
}

function improvementsMarkup(analysis) {
  if (!analysis.improvements.length) return '';
  return `<h3>What would make it better</h3><ul>${analysis.improvements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

// The AI's own words about this answer, from its check of the current screenshots.
function aiNotesMarkup(id) {
  const analysis = currentAnalysis();
  if (!analysis) return '';
  const reason = analysis.dimensions[id] ? `<p>${escapeHtml(analysis.dimensions[id].reason)}</p>` : '';
  return `<section class="content-panel ai-notes" aria-label="What the AI saw"><h2>What the AI saw</h2>${reason}${purposeFactsMarkup(id, analysis)}${improvementsMarkup(analysis)}</section>`;
}

function designRulesMarkup() {
  const rules = state.project.guidelines ?? [];
  if (!rules.length) return '';
  return `<details class="content-panel fact-disclosure"><summary>This app’s design rules</summary><ul>${rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')}</ul></details>`;
}

const evidenceFor = {
  design: page => `${aiNotesMarkup('design')}${designRulesMarkup(page)}`,
  purpose: () => aiNotesMarkup('purpose'),
  ease: page => `${aiNotesMarkup('ease')}${easeFactsMarkup(page)}${questionsMarkup(page, answerTopics.ease)}`,
  safety: page => `${questionsMarkup(page, answerTopics.safety)}${safetyFactsMarkup(page)}`,
  speed: page => `${speedFactsMarkup(page)}${questionsMarkup(page, answerTopics.speed)}`,
};

export function answerDetailMarkup(page) {
  const answer = answerFor(page, state.view);
  return `<section class="answer-detail" data-answer-detail="${escapeHtml(answer.id)}">${backMarkup(page)}<h1 id="answer-heading" tabindex="-1">${escapeHtml(answer.name)}</h1><p class="answer-question">${escapeHtml(answer.question)}</p>${answerPanelMarkup(page, answer)}${evidenceFor[answer.id](page)}</section>`;
}

function showFormError(form, selector, message) {
  const box = form.querySelector(selector);
  box.hidden = false;
  box.textContent = message;
}

async function patchVerdicts(body) {
  const page = activePage();
  return readJson(`/api/projects/${state.project.id}/pages/${page.id}/verdicts`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function submitVerdicts(form, errorSelector, body, message) {
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    state.project = await patchVerdicts(body);
    Object.assign(state, { answerEditing: false, questionsEditing: false, thingsEditing: false, message });
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = label;
    showFormError(form, errorSelector, error.message);
  }
}

export async function saveAnswer(form) {
  const data = new FormData(form);
  const note = String(data.get('note') ?? '').trim();
  if (!data.get('status')) return showFormError(form, '#answer-error', 'Choose Good or Needs work.');
  if (note.length < 12) return showFormError(form, '#answer-error', 'Write at least 12 characters about what you saw.');
  const checks = { [form.dataset.answer]: { status: data.get('status'), note } };
  await submitVerdicts(form, '#answer-error', { checks }, 'Answer saved');
}

function questionsFromForm(form) {
  const audit = {};
  for (const row of form.querySelectorAll('[data-question-row]')) {
    (audit[row.dataset.topic] ??= []).push({ id: row.dataset.id, status: row.querySelector('select').value, note: row.querySelector('textarea').value });
  }
  return audit;
}

export async function saveQuestions(form) {
  await submitVerdicts(form, '#questions-error', { audit: questionsFromForm(form) }, 'Answers saved');
}

export async function saveThings(form) {
  const features = [...form.querySelectorAll('[data-thing-row]')].map(row => ({ id: row.dataset.id, status: row.querySelector('select').value, note: row.querySelector('textarea').value }));
  await submitVerdicts(form, '#things-error', { features }, 'Answers saved');
}
