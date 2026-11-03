import { readJson } from '../api.mjs';
import { dateLabel, escapeHtml, markdownMarkup } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

// Requests are conversations about work; Done here does not accept a task or page's QA.
const lanes = [['todo', 'To do'], ['running', 'Working'], ['attention', 'Needs you'], ['review', 'Review'], ['done', 'Done']];
const agentNames = { codex: 'Codex', claude: 'Claude Code' };
let poll;

function freshBoard(key = '', selected = '') {
  return { key, data: null, tasks: [], loading: false, loadPromise: null, refreshRequested: false, attempted: false, error: '', action: '', formOpen: false, draft: null, selected, reviews: {}, replies: {}, note: {}, formError: '' };
}

function board() { return state.board ??= freshBoard(); }
function cards() { return board().data?.cards ?? []; }
function endpoint(key, suffix = '') { return `/api/projects/${encodeURIComponent(key)}/board${suffix}`; }
function cardPath(id, action) { return `/cards/${encodeURIComponent(id)}/${action}`; }
function selectedCard() { return cards().find(card => card.id === board().selected); }
function current(b) { return state.project?.id === b.key && state.board === b; }
function active(b) { return current(b) && state.view === 'board'; }
function agentName(backend) { return agentNames[backend] || backend; }
function disabled() { return board().action ? 'disabled' : ''; }
function count(status) { return cards().filter(card => card.status === status).length; }

function summary() {
  if (!cards().length) return 'Give an agent a request, then follow the work here.';
  const attention = count('attention');
  const review = count('review');
  return `${count('running')} working · ${attention} ${attention === 1 ? 'needs' : 'need'} you · ${review} ready for review`;
}

function requestPages() { const planned = board().plannedPages || []; return [...state.project.pages, ...planned.filter(page => !state.project.pages.some(item => item.id === page.id))]; }
function linkForPage(id) { return requestPages().find(page => page.id === id); }

function pageLink(page) {
  return `<button type="button" class="link-button" data-page="${escapeHtml(page.id)}">${escapeHtml(page.name)}</button>`;
}

function commentPreview(card) { return (card.comments?.at(-1)?.text || card.request).slice(0, 280); }
function cardPreview(card) { if (card.summary) return card.summary; if (card.error) return card.error; return commentPreview(card); }
function cardPageName(card) {
  const page = linkForPage(card.pageId);
  return page ? `<span>${escapeHtml(page.name)}</span>` : '';
}
function cardMarkup(card) {
  const selected = board().selected === card.id;
  return `<li><button type="button" aria-label="${escapeHtml(card.title)} · ${escapeHtml(cardStateLabel(card))} · ${escapeHtml(agentName(card.backend))}" class="board-card ${selected ? 'selected' : ''}" data-board-action="select" data-card-id="${escapeHtml(card.id)}" aria-pressed="${selected}"><strong>${escapeHtml(card.title)}</strong><span class="board-card-preview">${escapeHtml(cardPreview(card))}</span><span class="board-card-meta"><span>${escapeHtml(agentName(card.backend))}</span>${cardPageName(card)}</span></button></li>`;
}

function lanesMarkup() {
  return lanes.map(([status, label]) => `<section class="board-lane" aria-labelledby="board-lane-${status}"><div class="board-lane-heading"><h2 id="board-lane-${status}"><span class="board-state-dot board-state-${status}" aria-hidden="true"></span>${label}</h2><span class="board-lane-count">${count(status)}</span></div><ul>${cards().filter(card => card.status === status).map(cardMarkup).join('')}</ul>${count(status) ? '' : '<p class="board-lane-empty">No requests</p>'}</section>`).join('');
}

function statusLabel(status) { return lanes.find(([value]) => value === status)?.[1] || status; }
function cardStateLabel(card) {
  if (card.stopRequested) return 'Stopping';
  if (card.starting) return 'Starting';
  if (card.queued) return 'Queued';
  return statusLabel(card.status);
}
function statusMarkup(card) {
  const label = cardStateLabel(card);
  return `<span class="board-status"><span class="board-state-dot board-state-${escapeHtml(card.status)}" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

function actionButton(action, label, primary = false) {
  return `<button type="button" class="${primary ? 'save-button' : 'text-button'}" data-board-action="${action}" ${disabled()}>${escapeHtml(label)}</button>`;
}

const statusActions = {
  running: () => actionButton('stop', 'Stop agent'),
  todo: () => actionButton('run', 'Start agent', true),
  done: () => actionButton('reopen', 'Reopen request'),
  attention: attentionActions,
  review: reviewActions,
};
function hasRun(card) { return Boolean(card.checkout || card.turn); }
function idleCard(card) { return !card.starting && !card.stopRequested && card.status !== 'running'; }
function finishAction(card, label) {
  if (!idleCard(card)) return '';
  if (card.pendingCount) return actionButton('discard-feedback', 'Discard queued feedback');
  return card.queued ? '' : actionButton('complete', label);
}
function attentionActions(card) {
  const retry = idleCard(card) && !card.queued ? actionButton('run', hasRun(card) ? 'Retry agent' : 'Start agent') : '';
  return `${retry}${finishAction(card, 'Mark done')}`;
}
function reviewActions(card) { return finishAction(card, 'Mark reviewed & done'); }
function cardActions(card) { return statusActions[card.status]?.(card) || ''; }

function contextMarkup(card) {
  const page = linkForPage(card.pageId);
  const feature = page?.features.find(item => item.id === card.featureId);
  const task = board().tasks.find(item => item.id === card.taskId);
  return `<div class="board-context"><span>${escapeHtml(agentName(card.backend))}</span>${page ? pageLink(page) : ''}${feature ? `<span>${escapeHtml(feature.name)}</span>` : ''}${task ? `<button type="button" class="link-button" data-project-view="plan">${escapeHtml(task.title)}</button>` : ''}</div>`;
}

function commentAuthor(comment, card) {
  if (comment.by === 'person') return 'You';
  return comment.by === 'agent' ? agentName(card.backend) : 'Update';
}
function commentBody(comment) { return comment.by === 'agent' ? markdownMarkup(comment.text) : `<p>${escapeHtml(comment.text)}</p>`; }
function commentContent(comment, card) {
  return `<div class="board-comment-by"><strong>${escapeHtml(commentAuthor(comment, card))}</strong><time datetime="${escapeHtml(comment.at)}">${escapeHtml(dateLabel(comment.at))}</time></div><div class="board-comment-body">${commentBody(comment)}</div>`;
}
function commentMarkup(comment, card, older) {
  const content = commentContent(comment, card);
  const body = older ? `<details class="board-older-result"><summary>Earlier result · ${escapeHtml(dateLabel(comment.at))}</summary>${content}</details>` : content;
  return `<li class="board-comment board-comment-${escapeHtml(comment.by)}">${body}</li>`;
}
function commentsMarkup(card) {
  const comments = card.comments ?? [];
  const latestAgent = comments.findLastIndex(comment => comment.by === 'agent');
  const text = comments.map((comment, index) => commentMarkup(comment, card, comment.by === 'agent' && index < latestAgent)).join('');
  return comments.length ? `<ol class="board-thread">${text}</ol>` : '';
}

function replyLabel(card, note) {
  if (board().action === 'comment') return 'Sending…';
  if (note) return 'Add note';
  return card.status === 'running' ? 'Send follow-up' : 'Send to agent';
}
function queuedReplyHint(card) { return card.pendingCount ? `${card.pendingCount} follow-up${card.pendingCount === 1 ? '' : 's'} queued for the next turn.` : 'Follow-ups wait for the current turn to finish.'; }
function unsavedIntegration(card) { return card.integration && !card.integration.sourceSaved; }
function replyDisabled(card, note) { return Boolean(board().action || (!note && unsavedIntegration(card))); }
function replyHint(card, note) {
  if (note) return 'Notes stay on this request without starting the agent.';
  if (unsavedIntegration(card)) return 'Save the applied changes above before sending another agent turn. Your reply stays here.';
  if (card.status === 'running') return queuedReplyHint(card);
  if (card.status === 'done') return 'Sending reopens this request in the same agent session.';
  return 'Replies continue this request’s agent session.';
}
function formErrorMarkup(id) {
  const error = board().formError;
  return `<p id="${id}" class="form-error" role="alert" ${error ? '' : 'hidden'}>${escapeHtml(error)}</p>`;
}
function replyFormMarkup(card) {
  const value = board().replies[card.id] || '';
  const note = Boolean(board().note[card.id]);
  const label = card.status === 'done' ? 'Follow up on this request' : 'Your reply';
  return `<form id="board-comment-form" class="board-comment-form" data-card-id="${escapeHtml(card.id)}" data-dirty="${Boolean(value)}"><label for="board-reply">${label}</label><textarea id="board-reply" name="text" rows="3" maxlength="10000" ${disabled()} required placeholder="Add feedback, answer a question, or ask for a change…">${escapeHtml(value)}</textarea><label class="board-note-choice"><input id="board-note" type="checkbox" name="note" ${disabled()} ${note ? 'checked' : ''}> Keep as a note; don’t send to the agent</label><p id="board-reply-hint" class="board-reply-hint">${replyHint(card, note)}</p>${formErrorMarkup('board-comment-error')}<div class="form-actions"><button id="board-reply-send" type="submit" class="save-button" ${replyDisabled(card, note) ? 'disabled' : ''}>${replyLabel(card, note)}</button></div></form>`;
}

function reviewedChanges(card) { const value = board().reviews[card.id]; return value?.turn === card.turn ? value : null; }
function fileChangesMarkup(file) {
  const body = file.omittedReason ? `<p class="muted">${escapeHtml(file.omittedReason)}</p>` : `<pre><code>${escapeHtml(file.patch || file.content || 'No text change.')}</code></pre>`;
  return `<details class="review-file"><summary>${escapeHtml(file.path)} · ${escapeHtml(file.status)}</summary>${body}</details>`;
}
function inertSnapshot(content) {
  const template = document.createElement('template'); template.innerHTML = content;
  template.content.querySelectorAll('script,meta,base,iframe,object,embed,link').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(node => stripSnapshotAttributes(node));
  return template.innerHTML;
}
function stripSnapshotAttributes(node) {
  for (const attribute of [...node.attributes]) {
    if (/^(?:on|src|href|action|formaction|target)/i.test(attribute.name)) node.removeAttribute(attribute.name);
  }
}
function snapshotFrame(content, title) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">`;
  return `<div><h4>${title}</h4><iframe title="${title} HTML snapshot" sandbox="" referrerpolicy="no-referrer" srcdoc="${escapeHtml(policy + inertSnapshot(content))}"></iframe></div>`;
}
function staticPreview(file) {
  if (!file?.content || !/\.html?$/i.test(file.path)) return '';
  return `<details class="review-preview"><summary>Preview ${escapeHtml(file.path)}</summary><p class="field-hint">HTML snapshots. Interactive behavior and external resources are not checked here.</p><div class="review-preview-pair">${file.beforeContent ? snapshotFrame(file.beforeContent, 'Before') : ''}${snapshotFrame(file.content, 'Proposed')}</div></details>`;
}
function integrationRecovery(card) { return card.integration.sourceSaved ? '' : integrationRecoveryMarkup(); }
function integrationRecoveryMarkup() {
  return '<details class="integration-recovery"><summary>Changed source outside Dogfood?</summary><p>If you committed exactly these changes, Save reviewed changes recognizes that commit. Otherwise, finish or preserve any local edits until source is clean, then release this applied-change record. Source stays untouched. If its revision moved on, start a fresh request from the updated source before integrating further changes. Your earlier agent worktree and conversation stay available.</p><button type="button" class="text-button" data-board-action="release-integration">Release applied-change record</button></details>';
}
function appliedMarkup(card) {
  if (!card.integration || card.integration.turn !== card.turn) return '';
  const saved = card.integration.sourceSaved;
  const action = saved ? '<strong>Changes saved to the project source.</strong>' : '<span>Changes applied and staged.</span> <button type="button" class="text-button" data-board-action="save-source">Save reviewed changes</button>';
  return `<p class="integration-receipt" role="status">${action} Run source checks and page QA before accepting the task. ${card.taskId ? '<button type="button" class="link-button" data-project-view="plan">Open linked task</button>' : ''}</p>${integrationRecovery(card)}`;
}
function integrationMarkup(card, review) {
  if (card.integration?.turn === card.turn) return appliedMarkup(card);
  const button = review.integration.available ? `<button type="button" class="text-button" data-board-action="integrate" ${disabled()}>Apply reviewed changes to source</button>` : `<p class="field-hint">${escapeHtml(review.integration.reason)}</p>`;
  return `${button}<p class="field-hint">Applying stages this exact change set in the source checkout. It does not commit, accept QA or deploy.</p>`;
}
function changedFilesMarkup(card) {
  if (!card.checkout) return '';
  const review = reviewedChanges(card);
  const inspect = `<button type="button" class="text-button" data-board-action="inspect" ${disabled()}>${review ? 'Refresh changes' : 'Inspect changes'}</button>`;
  if (!review) return `<section class="board-review-tools">${appliedMarkup(card)}${inspect}</section>`;
  return `<section class="board-review-tools"><h3>Changes and proof</h3>${inspect}${review.files.map(fileChangesMarkup).join('')}${review.files.filter(file => /\.html?$/i.test(file.path)).slice(0, 2).map(staticPreview).join('')}${integrationMarkup(card, review)}</section>`;
}
function outcomeChecks(checks) { return checks ? `<details><summary>Agent-reported checks</summary><ul>${checks}</ul><p class="field-hint">Run source checks after applying. These are the agent’s reported observations.</p></details>` : ''; }
function outcomeGaps(gaps) { return gaps ? `<details open><summary>Still unverified</summary><ul>${gaps}</ul></details>` : ''; }
function outcomeMarkup(card) {
  const outcome = card.outcome; if (!outcome) return '';
  const checks = outcome.checks.map(check => `<li><code>${escapeHtml(check.command)}</code><p>${escapeHtml(check.result)}</p></li>`).join('');
  const gaps = outcome.unverified.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return `<section class="board-outcome"><h3>${outcome.decision ? 'Decision needed' : 'Agent outcome'}</h3><p>${escapeHtml(outcome.summary)}</p>${outcome.previewUrl ? `<a class="text-button" href="${escapeHtml(outcome.previewUrl)}" target="_blank" rel="noopener noreferrer">Open agent preview ↗</a>` : ''}${outcomeChecks(checks)}${outcomeGaps(gaps)}</section>`;
}
function runDetailsMarkup(card) {
  if (!card.session && !card.checkout) return '';
  return `<details class="board-run-details"><summary>Agent session & worktree</summary><dl>${card.session ? `<dt>Session</dt><dd><code>${escapeHtml(card.session)}</code></dd>` : ''}${card.checkout ? `<dt>Worktree</dt><dd><code>${escapeHtml(card.checkout)}</code></dd>` : ''}</dl></details>`;
}
function cardErrorMarkup(card) { return card.error ? `<p class="board-error form-error" role="alert">${escapeHtml(card.error)}</p>` : ''; }
function reviewNoteMarkup(card) { return card.status === 'review' ? '<p class="board-review-note">The agent finished its turn. Review its changes and checks before marking this request done. Page and task acceptance are tracked separately.</p>' : ''; }
function detailContentMarkup(card) {
  return `<div class="board-detail-top"><div>${statusMarkup(card)}<h2 id="board-request-heading" tabindex="-1">${escapeHtml(card.title)}</h2></div><button type="button" class="text-button" data-board-action="close" aria-label="Close request">Close</button></div>${contextMarkup(card)}<div class="board-request-text"><h3>Request</h3><p>${escapeHtml(card.request)}</p></div>${cardErrorMarkup(card)}<div class="board-detail-actions">${cardActions(card)}</div>${reviewNoteMarkup(card)}${outcomeMarkup(card)}${changedFilesMarkup(card)}${commentsMarkup(card)}`;
}
function detailMarkup(card) {
  if (!card) return '';
  return `<section class="board-detail content-panel" aria-labelledby="board-request-heading"><div id="board-detail-content">${detailContentMarkup(card)}</div>${replyFormMarkup(card)}${runDetailsMarkup(card)}</section>`;
}

function option(value, label, selected) { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }
function draftValues() { return { title: '', request: '', backend: 'codex', pageId: '', featureId: '', taskId: '', ...board().draft }; }

function featureOptions(data) {
  const page = linkForPage(data.pageId);
  return `<label for="board-feature">Feature <span class="field-optional">optional</span></label><select id="board-feature" name="featureId" ${page ? '' : 'disabled'}>${option('', page ? 'Whole page' : 'Choose a page first', data.featureId)}${(page?.features ?? []).map(feature => option(feature.id, feature.name, data.featureId)).join('')}</select>`;
}

function hasRequestDraft() { return Boolean(board().draft?.title || board().draft?.request); }
function runnerAvailable(backend) { return board().data?.agents?.find(agent => agent.id === backend)?.available === true; }
function requestFieldsMarkup(data) {
  return `<label for="board-title">Title</label><input id="board-title" name="title" required maxlength="160" value="${escapeHtml(data.title)}" placeholder="What needs to change?"><label for="board-request">What should the agent do?</label><textarea id="board-request" name="request" rows="4" required maxlength="10000" placeholder="Describe the result you want and how to check it.">${escapeHtml(data.request)}</textarea><div class="board-form-pair"><div><label for="board-backend">Agent</label><select id="board-backend" name="backend">${Object.entries(agentNames).map(([id, label]) => option(id, label, data.backend)).join('')}</select></div><div><label for="board-page">Related page <span class="field-optional">optional</span></label><select id="board-page" name="pageId">${option('', 'Project-wide', data.pageId)}${requestPages().map(page => option(page.id, page.name, data.pageId)).join('')}</select></div></div>`;
}
function requestContextMarkup(data) {
  const open = Boolean(board().linksOpen || data.featureId || data.taskId);
  return `<details class="board-request-context" ${open ? 'open' : ''}><summary>Link a feature or planned task</summary><div class="board-form-pair"><div>${featureOptions(data)}</div><div><label for="board-task">Planned task <span class="field-optional">optional</span></label><select id="board-task" name="taskId">${option('', 'No linked task', data.taskId)}${board().tasks.map(task => option(task.id, task.title, data.taskId)).join('')}</select></div></div></details>`;
}
function requestActionsMarkup(available) {
  const busy = Boolean(board().action);
  return `<div class="form-actions"><button type="submit" name="intent" value="start" class="save-button" ${!available || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Create & start'}</button><button type="submit" name="intent" value="save" class="text-button" ${disabled()}>Save for later</button><button type="button" class="text-button" data-board-action="cancel" ${disabled()}>Cancel</button></div>`;
}
function requestFormMarkup() {
  if (!board().formOpen) return '';
  const data = draftValues();
  const available = runnerAvailable(data.backend);
  return `<form id="board-request-form" class="board-request-form content-panel" data-dirty="${hasRequestDraft()}"><div class="panel-heading"><h2>New request</h2></div>${requestFieldsMarkup(data)}${requestContextMarkup(data)}<p id="board-agent-unavailable" class="board-reply-hint" ${available ? 'hidden' : ''}>The agent runner is unavailable. You can save this request for later.</p>${formErrorMarkup('board-request-error')}${requestActionsMarkup(available)}</form>`;
}
function boardHeadingMarkup() {
  const buttonClass = board().selected ? 'text-button' : 'save-button';
  const newButton = board().formOpen ? '' : `<button type="button" class="${buttonClass}" data-board-action="new">New request</button>`;
  return `<div class="page-heading board-heading"><div><h1 id="board-heading" tabindex="-1">Agent board</h1><p id="board-summary" class="board-summary">${escapeHtml(summary())}</p></div>${newButton}</div>`;
}
function loadErrorMarkup() {
  const error = board().error;
  return `<div id="board-load-error" class="form-error" role="alert" ${error ? '' : 'hidden'}>${escapeHtml(error)} ${error ? '<button type="button" class="text-button" data-board-action="refresh">Try again</button>' : ''}</div>`;
}
function emptyBoardMarkup() {
  if (!board().data || cards().length || board().formOpen) return '';
  return '<section class="board-empty-state" aria-labelledby="board-empty-heading"><h2 id="board-empty-heading">Your next change starts here</h2><p>Create a request for Claude Code or Codex. Follow its progress, answer questions, and review the result in one place.</p></section>';
}
function boardLoadingMarkup() { return !board().data ? '<p class="muted" role="status" id="board-loading">Loading requests…</p>' : ''; }
export function boardMarkup() {
  const data = board().data;
  return `<div class="agent-board" data-ui>${boardHeadingMarkup()}${loadErrorMarkup()}${requestFormMarkup()}${boardLoadingMarkup()}<div id="board-empty-host">${emptyBoardMarkup()}</div><div id="board-lanes" class="board-lanes" role="region" aria-label="Agent requests" ${data ? '' : 'hidden'}>${data ? lanesMarkup() : ''}</div><div id="board-detail-host">${detailMarkup(selectedCard())}</div></div>`;
}

function rememberSelection(id) {
  const query = new URLSearchParams(window.location.search);
  query.set('project', state.project.id);
  query.set('view', 'board');
  if (id) query.set('card', id); else query.delete('card');
  history.replaceState(null, '', `${window.location.pathname}?${query}`);
}

function schedulePoll(b) {
  clearTimeout(poll);
  if (active(b)) poll = setTimeout(() => loadBoard(b, false), 4000);
}

function updateRunnerAvailability() {
  const available = runnerAvailable(draftValues().backend);
  const start = document.querySelector('#board-request-form button[value="start"]');
  if (start) start.disabled = !available || Boolean(board().action);
  const note = document.getElementById('board-agent-unavailable');
  if (note) note.hidden = available;
}
function editingBoard(b) { return b.formOpen || Boolean(b.replies[b.selected]) || document.activeElement?.closest('#board-comment-form'); }
function updateReplyLabels(card) {
  const note = Boolean(board().note[card.id]);
  const hint = document.getElementById('board-reply-hint');
  if (hint) hint.textContent = replyHint(card, note);
  const send = document.getElementById('board-reply-send');
  if (send) { send.textContent = replyLabel(card, note); send.disabled = replyDisabled(card, note); }
}
function openedDetailIndices(root) { return [...root.querySelectorAll('details')].map((node, index) => node.open ? index : -1).filter(index => index >= 0); }
function restoreDetails(root, opened) { const details = root.querySelectorAll('details'); opened.forEach(index => { if (details[index]) details[index].open = true; }); }
function updateSelectedDetail() {
  const card = selectedCard();
  const root = document.getElementById('board-detail-content');
  if (!card || !root) return;
  const reply = document.getElementById('board-reply');
  const focused = document.activeElement === reply;
  const before = reply?.getBoundingClientRect().top;
  const opened = openedDetailIndices(root);
  root.innerHTML = detailContentMarkup(card);
  restoreDetails(root, opened);
  updateReplyLabels(card);
  if (focused) window.scrollBy(0, reply.getBoundingClientRect().top - before);
}
function updateBoardErrorNode() {
  const root = document.getElementById('board-load-error');
  if (!root) return;
  root.hidden = !board().error;
  root.textContent = board().error;
}
function updateBoardDataNodes() {
  const root = document.querySelector('#board-lanes');
  if (root) { root.innerHTML = lanesMarkup(); root.hidden = false; }
  document.querySelector('#board-loading')?.remove();
  const empty = document.getElementById('board-empty-host');
  if (empty) empty.innerHTML = emptyBoardMarkup();
  updateRunnerAvailability();
  updateSelectedDetail();
  updateBoardErrorNode();
  const summaryNode = document.querySelector('#board-summary');
  if (summaryNode) summaryNode.textContent = summary();
}
function updateSurface(b) {
  if (!active(b)) return;
  if (!editingBoard(b)) { render(); return; }
  updateBoardDataNodes();
}
async function loadTasks(b) {
  try {
    const workflow = await readJson(`/api/projects/${encodeURIComponent(b.key)}/workflow`);
    if (current(b)) { b.tasks = workflow.tasks ?? []; b.plannedPages = workflow.plannedPages ?? []; }
  } catch { /* Requests can be used before a task plan exists. */ }
}
function loadFailed(b, error) { if (current(b)) b.error = error.message; }
function loadFinished(b) {
  b.loading = false;
  if (!current(b) || b.refreshRequested) return;
  updateSurface(b);
  schedulePoll(b);
}
async function readBoard(b, first) {
  try {
    const data = await readJson(endpoint(b.key));
    if (!current(b)) return;
    if (!b.refreshRequested) { b.data = data; b.error = ''; }
    if (first) await loadTasks(b);
  } catch (error) { loadFailed(b, error); }
  finally { loadFinished(b); }
}
function loadBoard(b, first) {
  if (b.loadPromise) return b.loadPromise;
  b.loading = true;
  b.attempted = true;
  b.loadPromise = readBoard(b, first).finally(() => { b.loadPromise = null; });
  return b.loadPromise;
}
async function refreshAfterMutation(b) {
  b.refreshRequested = true;
  if (b.loadPromise) await b.loadPromise;
  if (!current(b)) return;
  b.refreshRequested = false;
  await loadBoard(b, false);
}

function needsInitialLoad(b) { return !b.attempted && !b.loading; }
function applyBoardDestination() {
  if (!state.boardDestination) return;
  Object.assign(board(), { selected: state.boardDestination, formOpen: false, attempted: false });
}
export function syncBoardState() {
  if (board().key !== state.project.id) state.board = freshBoard(state.project.id, state.boardDestination || '');
  else applyBoardDestination();
  state.boardDestination = '';
  if (state.view !== 'board') { clearTimeout(poll); return; }
  if (needsInitialLoad(board())) void loadBoard(board(), true);
  else schedulePoll(board());
}

export function hasBoardDrafts() { return hasRequestDraft() || Object.values(board().replies).some(text => Boolean(text.trim())); }
export function closeBoardEditors() { board().formOpen = false; board().formError = ''; }
export function discardBoardDrafts() {
  const b = board();
  closeBoardEditors();
  b.draft = null; b.replies = {}; b.note = {};
}
export function reviewBoardDraft() {
  const b = board();
  Object.assign(state, { view: 'board', browseOpen: false });
  if (hasRequestDraft()) { b.formOpen = true; b.selected = ''; }
  else b.selected = Object.keys(b.replies).find(id => b.replies[id].trim()) || '';
  rememberSelection(b.selected);
  render();
  focus(b.formOpen ? 'board-title' : 'board-reply');
}

function draftHasText(values) { return Boolean(values.title || values.request || values.text); }
function rememberReply(form, values) {
  board().replies[form.dataset.cardId] = values.text || '';
  board().note[form.dataset.cardId] = values.note === 'on';
}
function rememberDraft(form) {
  const values = Object.fromEntries(new FormData(form));
  if (form.id === 'board-request-form') board().draft = values;
  if (form.id === 'board-comment-form') rememberReply(form, values);
  form.dataset.dirty = String(draftHasText(values));
}

function inlineError(id, message) {
  board().formError = message;
  const node = document.getElementById(id);
  if (node) { node.textContent = message; node.hidden = !message; }
}

function focus(id) { document.getElementById(id)?.focus({ preventScroll: true }); }

export function openBoardRequest(pageId = '', seed = {}) {
  const b = board();
  Object.assign(state, { view: 'board', browseOpen: false, message: '' });
  if (!hasRequestDraft()) b.draft = { pageId, ...seed };
  Object.assign(b, { formOpen: true, selected: '', formError: '' });
  rememberSelection('');
  render();
  focus('board-title');
}
function showMutationError(b, error, form) {
  if (!current(b)) return;
  b[form ? 'formError' : 'error'] = error.message;
}
function finishMutation(b, focusId) {
  b.action = '';
  if (!active(b)) return;
  render();
  focus(focusId);
}
async function mutate(action, operation, options) {
  const settings = { form: false, focusId: 'board-request-heading', ...options };
  const b = board();
  if (b.action) return;
  b.action = action;
  b.error = ''; b.formError = '';
  render();
  try { await operation(b); }
  catch (error) { showMutationError(b, error, settings.form); }
  finally { finishMutation(b, settings.focusId); }
}
async function post(b, path, body = {}) {
  return readJson(endpoint(b.key, path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function savedRequest(b, saved) {
  b.selected = saved.id ?? saved.card?.id ?? '';
  b.formOpen = false; b.draft = null;
  rememberSelection(b.selected);
}
async function createRequest(form, submitter) {
  rememberDraft(form);
  const draft = draftValues();
  if (!draft.title.trim() || !draft.request.trim()) return inlineError('board-request-error', 'Add a title and describe what the agent should do.');
  const input = { ...draft, start: submitter?.value === 'start' };
  await mutate('create', async b => {
    const saved = await post(b, '/cards', input);
    if (!current(b)) return;
    savedRequest(b, saved);
    await refreshAfterMutation(b);
  }, { form: true, focusId: 'board-request-heading' });
}
async function sendComment(form) {
  rememberDraft(form);
  const id = form.dataset.cardId;
  const text = (board().replies[id] || '').trim();
  if (!text) return inlineError('board-comment-error', 'Write a reply first.');
  const input = { text, send: !board().note[id] };
  await mutate('comment', async b => {
    await post(b, cardPath(id, 'comment'), input);
    if (!current(b)) return;
    b.replies[id] = '';
    await refreshAfterMutation(b);
  }, { form: true, focusId: 'board-reply' });
}
async function runAction(action) {
  if (!board().selected) return;
  const id = board().selected;
  await mutate(action, async b => {
    await post(b, cardPath(id, action));
    if (current(b)) await refreshAfterMutation(b);
  });
}
function selectCard(button) {
  const b = board();
  if (b.formOpen && hasRequestDraft()) return inlineError('board-request-error', 'Save or cancel your new request before opening another.');
  b.formOpen = false;
  b.selected = button.dataset.cardId; b.formError = '';
  rememberSelection(b.selected);
  render(); focus('board-request-heading');
  document.getElementById('board-detail-host')?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}
function closeCard() { board().selected = ''; rememberSelection(''); render(); }
function cancelRequest() {
  if (hasRequestDraft() && !window.confirm('Discard this request draft?')) return;
  board().formOpen = false; board().draft = null; board().formError = '';
  render(); focus('board-heading');
}
async function inspectChanges() {
  const id = board().selected;
  await mutate('inspect', async b => { const review = await readJson(endpoint(b.key, cardPath(id, 'diff'))); if (current(b)) b.reviews[id] = { ...review, turn: selectedCard().turn }; });
}
async function integrateChanges() {
  const card = selectedCard(), review = reviewedChanges(card);
  if (!review?.integration.available) return;
  await mutate('integrate', async b => { await post(b, cardPath(card.id, 'integrate'), { fingerprint: review.fingerprint }); if (current(b)) await refreshAfterMutation(b); });
}
async function saveSourceChanges() {
  const card = selectedCard();
  if (!card?.integration || card.integration.sourceSaved) return;
  await mutate('save-source', async b => { await post(b, cardPath(card.id, 'save-source'), { integrationId: card.integration.id }); if (current(b)) await refreshAfterMutation(b); });
}
async function releaseSourceIntegration() {
  const card = selectedCard();
  if (!card?.integration || card.integration.sourceSaved) return;
  await mutate('release-integration', async b => { await post(b, cardPath(card.id, 'release-integration'), { integrationId: card.integration.id }); if (current(b)) await refreshAfterMutation(b); });
}
const boardActions = {
  new: () => openBoardRequest(),
  refresh: () => loadBoard(board(), !board().data),
  inspect: inspectChanges,
  integrate: integrateChanges,
  'save-source': saveSourceChanges,
  'release-integration': releaseSourceIntegration,
  select: selectCard,
  close: closeCard,
  cancel: cancelRequest,
  ...Object.fromEntries(['run', 'stop', 'complete', 'reopen', 'discard-feedback'].map(action => [action, () => runAction(action)])),
};
function boardClick(button) { boardActions[button.dataset.boardAction]?.(button); }
function handleBoardInput(event) {
  const form = event.target.closest('#board-request-form, #board-comment-form');
  if (form) rememberDraft(form);
}
function handleBoardChange(event) {
  const form = event.target.closest('#board-request-form, #board-comment-form');
  if (!form) return;
  rememberDraft(form);
  if (event.target.id === 'board-page') board().draft.featureId = '';
  const id = event.target.id;
  if (['board-page', 'board-backend', 'board-note'].includes(id)) { render(); focus(id); }
}
function handleBoardSubmit(event) {
  const handlers = { 'board-request-form': createRequest, 'board-comment-form': sendComment };
  const handler = handlers[event.target.id];
  if (!handler) return;
  event.preventDefault();
  void handler(event.target, event.submitter);
}

export function registerBoardEvents(app) {
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-board-action]');
    if (button) boardClick(button);
    if (event.target.closest('[data-action="request-page-change"]')) openBoardRequest(state.pageId);
  });
  app.addEventListener('toggle', event => { if (event.target.classList?.contains('board-request-context')) board().linksOpen = event.target.open; }, true);
  app.addEventListener('input', handleBoardInput);
  app.addEventListener('change', handleBoardChange);
  app.addEventListener('submit', handleBoardSubmit);
}
