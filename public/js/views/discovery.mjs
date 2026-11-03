import { state } from '../state.mjs';
import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { render, loadProject } from '../app.mjs';

const rounds = [
  { title: 'Who and why', fields: ['idea', 'audience', 'problem', 'success'] },
  { title: 'Journey and boundaries', fields: ['journey', 'constraints', 'exclusions', 'risks'] },
  { title: 'Pages and proof', fields: ['proof'] },
];
const labels = { idea: 'What are you building?', audience: 'Who is it for, and when do they need it?', problem: 'What problem does it solve?', success: 'What outcome would make this worthwhile?', journey: 'Walk through the main journey, from start to result.', constraints: 'What constraints must the project respect?', exclusions: 'What is deliberately outside this version?', risks: 'What can go wrong, and how should people recover?', proof: 'What evidence will show the journey works?' };
const hints = { idea: 'Describe the idea in your own words.', audience: 'Name the person, trigger and current alternative.', problem: 'Describe the concrete consequence or wasted effort.', success: 'Use an observable outcome rather than a vanity count.', journey: 'Include roles, data changes and the final confirmation.', constraints: 'Budget, platforms, accessibility, integrations, privacy or timing. Say none if there are none.', exclusions: 'Make the boundaries explicit. Say none if this is already the smallest scope.', risks: 'Include empty states, invalid input, interruptions and provider failures.', proof: 'Name the critical checks and what should be visible on a computer and phone.' };
function local() { return state.discovery ??= { key: '', data: null, loading: false, error: '', busy: false, round: 0, draft: null, dirty: false, active: false, newQuestions: '', backend: 'claude' }; }
function endpoint(suffix = '', projectId = state.project.id) { return `/api/projects/${encodeURIComponent(projectId)}/readiness${suffix}`; }
function draft() {
  const data = local();
  return data.draft ??= structuredClone({ mode: data.data.mode, answers: data.data.answers, pages: data.data.pages, questions: data.data.questions, decisions: data.data.decisions.map(item => item.text) });
}
function errorMarkup() { return local().error ? `<p class="form-error" role="alert">${escapeHtml(local().error)}</p><button type="button" class="text-button" data-discovery-action="reload">Reload saved answers and discard this draft</button>` : ''; }
function introMarkup(data) {
  const note = data.imported ? 'This is an existing project. Its current work can continue; discovery has not been certified unless the current scope is reviewed below.' : 'Answer the questions, define pages and features, then review the scope before the first build.';
  return `<header class="overview-heading"><div><h1>Discovery</h1><p>${note}</p></div><button type="button" class="text-button" data-project-view="map">View product map</button></header><p class="discovery-stage">${escapeHtml(data.label)}</p>`;
}
function fieldMarkup(key) {
  return `<label for="discovery-${key}">${escapeHtml(labels[key])}</label><textarea id="discovery-${key}" name="answer:${key}" rows="3" maxlength="8000" aria-describedby="hint-${key}">${escapeHtml(draft().answers[key] || '')}</textarea><p class="field-hint" id="hint-${key}">${escapeHtml(hints[key])}</p>`;
}
function roundTabsMarkup() {
  return `<nav class="discovery-rounds" aria-label="Discovery rounds">${rounds.map((round, index) => `<button type="button" class="text-button" data-discovery-action="round" data-round="${index}" ${index === local().round ? 'aria-current="step"' : ''}>${index + 1}. ${round.title}</button>`).join('')}</nav>`;
}
function featureLines(page) { return page.features.map(item => `${item.name} | ${item.expected}`).join('\n'); }
function plannedPageMarkup(page, index) {
  return `<fieldset class="discovery-page"><legend>Page ${index + 1}</legend><label for="planned-name-${index}">Page name</label><input id="planned-name-${index}" name="page:${index}:name" value="${escapeHtml(page.name)}" maxlength="160"><label for="planned-route-${index}">Route</label><input id="planned-route-${index}" name="page:${index}:route" value="${escapeHtml(page.route)}" placeholder="/booking" maxlength="1000"><label for="planned-features-${index}">What can people do here?</label><textarea id="planned-features-${index}" name="page:${index}:features" rows="3" placeholder="Book a visit | A confirmed booking survives reload">${escapeHtml(featureLines(page))}</textarea><p class="field-hint">One feature per line: its name, then | and what success looks like.</p><button type="button" class="text-button" data-discovery-action="remove-page" data-index="${index}">Remove planned page</button></fieldset>`;
}
function pagesMarkup() {
  return `<section class="discovery-pages"><h3>Planned pages and features</h3><p>These are planned outcomes. They become QA pages when the app exists.</p>${draft().pages.map(plannedPageMarkup).join('')}<button type="button" class="text-button" data-discovery-action="add-page" ${draft().pages.length >= 40 ? 'disabled' : ''}>Add a planned page</button></section>`;
}
function questionMarkup(question) {
  return `<label for="question-${question.id}">${escapeHtml(question.text)}${question.material ? ' · scope decision' : ''}</label><textarea id="question-${question.id}" name="question:${question.id}" rows="2" placeholder="Leave empty while this question is unresolved.">${escapeHtml(question.answer || '')}</textarea>`;
}
function decisionsMarkup() {
  return `<section class="discovery-decisions"><h3>Decisions and open questions</h3>${draft().questions.map(questionMarkup).join('')}<label for="discovery-new-questions">What still needs an answer?</label><textarea id="discovery-new-questions" name="newQuestions" rows="2" placeholder="One material question per line.">${escapeHtml(local().newQuestions)}</textarea><label for="discovery-decisions">Decisions and reasons</label><textarea id="discovery-decisions" name="decisions" rows="3" placeholder="One decision and its reason per line.">${escapeHtml(draft().decisions.join('\n'))}</textarea></section>`;
}
function formMarkup() {
  const round = rounds[local().round];
  const details = local().round === 2 ? pagesMarkup() + decisionsMarkup() : '';
  return `<form id="discovery-form" class="content-panel discovery-form" data-dirty="${Boolean(local().dirty)}" aria-busy="${local().busy}" ${local().busy ? 'inert' : ''}><h2>${round.title}</h2>${round.fields.map(fieldMarkup).join('')}${details}<div class="form-actions"><button type="submit" class="save-button" ${local().busy ? 'disabled' : ''}>${local().busy ? 'Saving…' : 'Save answers'}</button>${nextRoundMarkup()}</div></form>`;
}
function nextRoundMarkup() {
  if (local().round === 2) return '';
  return `<button type="button" class="text-button" data-discovery-action="round" data-round="${local().round + 1}">Next questions</button>`;
}
function reviewMarkup(data) {
  const items = scopeIssuesMarkup(data);
  const receipt = reviewReceiptMarkup(data);
  return reviewSectionMarkup(items, receipt, data);
}
function scopeIssuesMarkup(data) {
  return data.issues.length ? `<ul>${data.issues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>The scope, boundaries and proof are ready to review.</p>';
}
function reviewReceiptMarkup(data) {
  return data.reviewed ? `<p>Reviewed by ${escapeHtml(data.review.by)} · ${escapeHtml(data.review.at)}. A material edit or document change requires review again.</p>` : '';
}
function reviewSectionMarkup(items, receipt, data) {
  return `<section class="content-panel discovery-review"><h2>Review the scope</h2>${receipt}${items}${baselineMarkup(data)}<div class="form-actions"><button type="button" class="text-button" data-discovery-action="documents" ${local().busy ? 'disabled' : ''}>Create missing Vision and Plan drafts</button><button type="button" class="text-button" data-discovery-action="review" ${local().busy || data.issues.length ? 'disabled' : ''}>Review current scope</button></div><p class="field-hint">Draft creation preserves existing files. Scope review does not accept implementation or QA.</p></section>`;
}
function baselineMarkup(data) {
  if (data.stage !== 'baseline') return '';
  return `<div class="discovery-baseline"><p>The agent starts from committed source. Save the reviewed Vision and Plan as its versioned starting point. This only commits unchanged drafts created here; other work must be preserved separately.</p><button type="button" class="text-button" data-discovery-action="baseline" ${local().busy ? 'disabled' : ''}>Save reviewed scope baseline</button></div>`;
}
function askAgentMarkup() {
  return `<section class="content-panel discovery-agent"><h2>Work through it with your agent</h2><p>Ask the next three to five questions that can change this scope. The same conversation can turn your answers into the Vision and plan.</p><label for="discovery-agent">Agent</label><select id="discovery-agent" name="discoveryBackend"><option value="claude" ${local().backend === 'claude' ? 'selected' : ''}>Claude Code</option><option value="codex" ${local().backend === 'codex' ? 'selected' : ''}>Codex</option></select><button type="button" class="text-button" data-discovery-action="ask" ${local().busy ? 'disabled' : ''}>Ask agent next questions</button></section>`;
}
export function discoveryMarkup() {
  const data = local();
  if (data.loading || !data.data) return `<section class="overview-content"><h1>Discovery</h1>${errorMarkup()}<p role="status">Reading project scope…</p></section>`;
  return `<section class="overview-content discovery-view" aria-label="Project discovery">${introMarkup(data.data)}${errorMarkup()}${roundTabsMarkup()}${formMarkup()}${reviewMarkup(data.data)}${askAgentMarkup()}</section>`;
}
async function fetchReadiness(key) {
  const current = local(); current.loading = true;
  try { const value = await readJson(endpoint()); if (current.key === key) current.data = value; }
  catch (error) { if (current.key === key) current.error = error.message; }
  finally { current.loading = false; if (state.view === 'discovery') render(); }
}
export function syncDiscoveryState() {
  const current = local();
  if (state.view !== 'discovery') { current.active = false; return; }
  const key = state.project.id;
  if (current.active && current.key === key) return;
  enterDiscovery(current, key);
}
function enterDiscovery(current, key) {
  current.active = true;
  if (current.key !== key) Object.assign(current, { key, data: null, draft: null, loading: true, error: '', round: 0, dirty: false, newQuestions: '' });
  if (!current.dirty) { current.draft = null; fetchReadiness(key); }
}
function lines(value) { return value.split('\n').map(item => item.trim()).filter(Boolean); }
function featureId(previous, index) { return previous?.[index]?.id || `feature-${index + 1}`; }
function featureFromLine(line, index, previous) {
  const separator = line.indexOf('|');
  const name = separator < 0 ? line : line.slice(0, separator).trim();
  const expected = separator < 0 ? '' : line.slice(separator + 1).trim();
  return { id: featureId(previous, index), name, expected };
}
function pageInput(form, page, index) {
  const data = new FormData(form), name = data.get(`page:${index}:name`);
  if (name === null) return page;
  const route = data.get(`page:${index}:route`), features = data.get(`page:${index}:features`);
  return { ...page, name: String(name), route: String(route), features: lines(String(features)).map((line, i) => featureFromLine(line, i, page.features)) };
}
function questionInput(data, question) {
  const value = data.get(`question:${question.id}`);
  if (value === null) return question;
  const answer = String(value).trim();
  return { ...question, answer, status: answer ? 'answered' : 'open' };
}
function newQuestion(text, questions) {
  let index = questions.length + 1;
  while (questions.some(item => item.id === `question-${index}`)) index += 1;
  return { id: `question-${index}`, text, material: true, status: 'open', answer: '' };
}
function collectDraft(form, commitQuestions = false) {
  if (!form) return;
  const value = draft(), data = new FormData(form);
  for (const [key, content] of data) if (key.startsWith('answer:')) value.answers[key.slice(7)] = String(content);
  value.pages = value.pages.map((page, index) => pageInput(form, page, index));
  value.questions = value.questions.map(question => questionInput(data, question));
  updateDecisions(value, data, commitQuestions);
}
function updateDecisions(value, data, commitQuestions) {
  if (data.has('decisions')) value.decisions = lines(String(data.get('decisions')));
  if (!data.has('newQuestions')) return;
  local().newQuestions = String(data.get('newQuestions'));
  if (!commitQuestions) return;
  appendQuestions(value);
}
function appendQuestions(value) {
  for (const text of lines(local().newQuestions)) if (!value.questions.some(item => item.text === text)) value.questions.push(newQuestion(text, value.questions));
  local().newQuestions = '';
}
async function saveAnswers() {
  collectDraft(document.getElementById('discovery-form'), true);
  const value = { ...draft(), expectedRevision: local().data.revision };
  const current = local(), key = current.key;
  const saved = await readJson(endpoint('', key), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  if (current.key !== key) return null;
  current.data = saved; current.draft = null; current.dirty = false;
  return state.project.id === key ? saved : null;
}
async function scopeAction(action) {
  const data = await saveAnswers();
  if (!data) return;
  const body = { expectedRevision: data.revision };
  if (['review', 'baseline'].includes(action)) body.contractHash = data.contractHash;
  const current = local(), key = data.projectId;
  const saved = await readJson(endpoint(`/${action}`, key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (current.key === key) current.data = saved;
}
const discoveryRequest = 'Run discovery for this project before implementation. Read dogfood_project_readiness for its saved answers, open material questions and planned pages/features. Ask the next three to five dependency-ordered questions, with recommended answers and tradeoffs. Do not guess missing user decisions. Treat answered questions as resolved and record decision provenance. Continue in this card; use dogfood_save_brief with the current expectedRevision to persist agreed answers. Draft Vision and Plan only from resolved answers in your isolated checkout; do not use document creation tools to write outside that checkout; do not mark scope reviewed or start a build for the user. Return NEEDS_INPUT: followed by the next specific questions. No implementation, deployment, purchases, account changes, delegation or new browser sessions.';
async function askAgent() {
  const key = state.project.id;
  const saved = await saveAnswers();
  if (!saved) return;
  const card = await readJson(`/api/projects/${encodeURIComponent(key)}/board/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Discover ${state.project.name}`, request: discoveryRequest, backend: local().backend, intent: 'discovery', start: true }) });
  if (state.project.id === key) await loadProject(key, { view: 'board', cardId: card.id });
}
async function runAction(action) {
  const current = local(); if (current.busy) return;
  collectDraft(document.getElementById('discovery-form'), true);
  current.busy = true; current.error = ''; render();
  try { await action(); }
  catch (error) { current.error = error.message; }
  finally { current.busy = false; render(); }
}
function pageAction(button) {
  local().dirty = true;
  collectDraft(document.getElementById('discovery-form'));
  if (button.dataset.discoveryAction === 'remove-page') draft().pages.splice(Number(button.dataset.index), 1);
  else draft().pages.push({ id: `page-${Date.now().toString(36)}`, name: '', route: '/', features: [] });
  render();
}
async function reloadAnswers() {
  Object.assign(local(), { draft: null, dirty: false, error: '', newQuestions: '' });
  await fetchReadiness(state.project.id);
}
function localAction(button) {
  const action = button.dataset.discoveryAction;
  if (action === 'round') { collectDraft(document.getElementById('discovery-form'), true); local().round = Number(button.dataset.round); render(); return; }
  if (['add-page', 'remove-page'].includes(action)) { pageAction(button); return; }
  const actions = { reload: reloadAnswers, baseline: () => scopeAction('baseline'), documents: () => scopeAction('documents'), review: () => scopeAction('review'), ask: askAgent };
  if (actions[action]) runAction(actions[action]);
}
export function registerDiscoveryEvents(app) {
  app.addEventListener('submit', event => { if (event.target.id !== 'discovery-form') return; event.preventDefault(); runAction(saveAnswers); });
  app.addEventListener('click', event => { const button = event.target.closest('[data-discovery-action]'); if (button) localAction(button); });
  app.addEventListener('change', event => { if (event.target.id === 'discovery-agent') local().backend = event.target.value; });
  app.addEventListener('input', event => { if (event.target.closest('#discovery-form')) { local().dirty = true; collectDraft(document.getElementById('discovery-form')); } });
}
