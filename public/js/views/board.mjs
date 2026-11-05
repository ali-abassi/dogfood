import { readJson } from '../api.mjs';
import { dateLabel, escapeHtml, markdownMarkup } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';
import { attachmentComposer, attachmentGallery, draftImages, hasImageDrafts, firstImageDraft, clearImages, releaseImagePreviews, addImages, removeImage, imagePayload, clipboardImages, commentIdentity } from './board-images.mjs';
import { prepareBoardDrafts, waitForBoardDrafts, saveBoardDrafts, flushBoardDrafts, draftStorageLoading, draftStorageStatus, draftStorageError, protectPendingDraft } from './board-drafts.mjs';
import { deliveryBadge, deliveryMarkup, readyWorkMarkup, queueMarkup, contractMarkup } from './board-work.mjs';

// Requests are conversations about work; Done here does not accept a task or page's QA.
const lanes = [['todo', 'To do'], ['running', 'Working'], ['attention', 'Needs you'], ['review', 'Review'], ['done', 'Closed']];
const intentNames = { build: 'Build or change', discovery: 'Explore the idea', qa: 'Review and test' };
const intentHints = { build: 'Make a scoped change in an isolated checkout. Include the outcome, limits and how to verify it.', discovery: 'Ask questions and propose scope before building. The agent cannot approve its own plan.', qa: 'Inspect the app and record evidence and findings. This request does not apply source changes.' };
const laneHints = { todo: 'Saved or queued', running: 'Agent turn in progress', attention: 'Answer or fix setup', review: 'Inspect the result', done: 'Conversation closed' };
const agentNames = { codex: 'Codex', claude: 'Claude Code' };
let poll;

function freshBoard(key = '', selected = '') {
  return { key, data: null, tasks: [], loading: false, loadPromise: null, refreshRequested: false, attempted: false, error: '', action: '', formOpen: false, draft: null, selected, reviews: {}, replies: {}, images: {}, note: {}, formError: '', search: '', filter: 'all', queue: null, queueError: '', section: initialSection(selected), queuePage: '', qaBackend: 'codex' };
}

function initialSection(selected) {
  if (selected) return 'requests';
  const section = new URLSearchParams(window.location.search).get('boardView');
  return ['ready', 'qa'].includes(section) ? section : 'requests';
}

function board() { return state.board ??= freshBoard(); }
function cards() { return board().data?.cards ?? []; }
function endpoint(key, suffix = '') { return `/api/projects/${encodeURIComponent(key)}/board${suffix}`; }
function cardPath(id, action) { return `/cards/${encodeURIComponent(id)}/${action}`; }
function selectedCard() { return cards().find(card => card.id === board().selected); }
function current(b) { return state.project?.id === b.key && state.board === b; }
function active(b) { return current(b) && state.view === 'board'; }
function agentName(backend) { return agentNames[backend] || backend; }
function draftBusy() { return Boolean(board().action) || draftStorageLoading(board()); }
function disabled() { return draftBusy() ? 'disabled' : ''; }
function count(status) { return cards().filter(card => card.status === status).length; }
function matchesFilter(card) {
  const filter = board().filter;
  if (filter === 'all') return true;
  return filter === 'active' ? card.status !== 'done' : card.status === filter;
}
function matchesSearch(card) {
  const text = [card.title, card.request, card.summary, card.delivery?.task?.title, agentName(card.backend)].join(' ');
  return text.toLowerCase().includes(board().search.toLowerCase().trim());
}
function cardPriority(card) { return card.delivery?.task?.priority ?? 2; }
function byPriority(a, b) { return cardPriority(a) - cardPriority(b) || Date.parse(a.createdAt) - Date.parse(b.createdAt); }
function visibleCards() { return cards().filter(matchesFilter).filter(matchesSearch).sort(byPriority); }

function executionSummary() {
  const running = cards().filter(card => card.status === 'running');
  const unknown = running.filter(card => card.execution?.state === 'unknown').length;
  const fetching = running.filter(card => card.execution?.state === 'fetching_result').length;
  return [`${running.length - unknown - fetching} working`, unknown ? `${unknown} status unavailable` : '', fetching ? `${fetching} fetching result` : ''].filter(Boolean);
}
function summary() {
  if (!cards().length) return 'Give an agent a request, then follow the work here.';
  const attention = count('attention');
  return [...executionSummary(), `${attention} ${attention === 1 ? 'needs' : 'need'} you`, `${count('review')} ready for review`].join(' · ');
}

function requestPages() { const planned = board().plannedPages || []; return [...state.project.pages, ...planned.filter(page => !state.project.pages.some(item => item.id === page.id))]; }
function linkForPage(id) { return requestPages().find(page => page.id === id); }

function pageLink(page) {
  return `<button type="button" class="link-button" data-page="${escapeHtml(page.id)}">${escapeHtml(page.name)}</button>`;
}

function cleanBrief(text) { return text.replace(/^Dogfood full-page QA request · v1\s*/, ''); }
function requestText(card) { return cleanBrief(card.request); }
function commentPreview(card) { return (card.comments?.at(-1)?.text || requestText(card)).slice(0, 280); }
function attentionPreview(card) { return card.error || card.outcome?.decision || card.summary || commentPreview(card); }
function cardPreview(card) { if (card.status === 'attention') return attentionPreview(card); if (card.summary) return cleanBrief(card.summary); if (card.error) return card.error; return commentPreview(card); }
function cardPageName(card) {
  const page = linkForPage(card.pageId);
  return page ? `<span>${escapeHtml(page.name)}</span>` : '';
}
function cardMarkup(card) {
  const selected = board().selected === card.id;
  return `<li><button type="button" aria-label="${escapeHtml(card.title)} · ${escapeHtml(cardStateLabel(card))} · ${escapeHtml(agentName(card.backend))}" class="board-card ${selected ? 'selected' : ''}" data-board-action="select" data-card-id="${escapeHtml(card.id)}" aria-pressed="${selected}"><strong>${escapeHtml(card.title)}</strong><span class="board-card-preview">${escapeHtml(cardPreview(card))}</span><span class="board-card-meta"><span>${escapeHtml(agentName(card.backend))}</span><span>${escapeHtml(cardStateLabel(card))}</span>${cardPageName(card)}</span>${deliveryBadge(card)}<time class="board-card-time" datetime="${escapeHtml(card.updatedAt)}">Updated ${escapeHtml(dateLabel(card.updatedAt))}</time></button></li>`;
}

function lanesMarkup() {
  return lanes.map(([status, label]) => `<section class="board-lane" aria-labelledby="board-lane-${status}"><div class="board-lane-heading"><h2 id="board-lane-${status}"><span class="board-state-dot board-state-${status}" aria-hidden="true"></span>${label}</h2><span class="board-lane-count">${visibleCards().filter(card => card.status === status).length}</span></div><p class="board-lane-hint">${laneHints[status]}</p><ul>${visibleCards().filter(card => card.status === status).map(cardMarkup).join('')}</ul>${visibleCards().some(card => card.status === status) ? '' : '<p class="board-lane-empty">No requests</p>'}</section>`).join('');
}

function statusLabel(status) { return lanes.find(([value]) => value === status)?.[1] || status; }
function cancelledCard(card) { return card.status === 'done' && card.closure?.kind === 'cancelled'; }
function cardStateLabel(card) {
  if (cancelledCard(card)) return 'Cancelled';
  if (card.stopRequested) return 'Stopping';
  if (card.starting) return 'Starting';
  return observedStateLabel(card);
}
function observedStateLabel(card) {
  if (card.execution?.label) return card.execution.label;
  if (card.status === 'running') return 'Working';
  return card.queued ? 'Queued' : statusLabel(card.status);
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
  todo: card => card.delivery?.launch?.allowed === false ? `<p class="field-hint">${escapeHtml(card.delivery.launch.reason)}</p>` : actionButton('run', 'Start agent', true),
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
function needsAnswer(card) { return !card.error && Boolean(card.outcome?.decision); }
function attentionPrimary(card) { return needsAnswer(card) ? actionButton('reply', 'Answer agent') : actionButton('run', hasRun(card) ? 'Retry agent' : 'Start agent'); }
function attentionActions(card) {
  const retry = idleCard(card) && !card.queued ? attentionPrimary(card) : '';
  return `${retry}${finishAction(card, 'Close request')}`;
}
function reviewActions(card) { return finishAction(card, 'Close reviewed request'); }
function waitingToStart(card) { return card.status !== 'running' && (card.queued || card.starting); }
function queuedAction(card) { return actionButton('stop', card.starting ? 'Stop starting agent' : 'Cancel queued start'); }
function cardIntentName(card) { return intentNames[card.intent || 'build']; }
function cardActions(card) {
  if (card.stopRequested) return '<span class="field-hint" role="status">Stopping the agent…</span>';
  if (card.cancellable) return cancellableActions(card);
  if (waitingToStart(card)) return queuedAction(card);
  return idleActions(card);
}
function idleActions(card) { return statusActions[card.status]?.(card) || ''; }

function cancellableActions(card) {
  const start = card.queued ? '' : statusActions.todo(card);
  return `${start}${actionButton('cancel-saved', 'Cancel request')}`;
}

function contextMarkup(card) {
  const page = linkForPage(card.pageId);
  const feature = page?.features.find(item => item.id === card.featureId);
  const task = board().tasks.find(item => item.id === card.taskId);
  return `<div class="board-context"><span>${escapeHtml(agentName(card.backend))}</span><span>${cardIntentName(card)}</span>${page ? pageLink(page) : ''}${feature ? `<span>${escapeHtml(feature.name)}</span>` : ''}${task ? `<button type="button" class="link-button" data-project-view="plan">${escapeHtml(task.title)}</button>` : ''}</div>`;
}

function commentAuthor(comment, card) {
  if (comment.by === 'person') return 'You';
  return comment.by === 'agent' ? agentName(card.backend) : 'Update';
}
function agentCommentMarkup(text) {
  const packets = [...text.matchAll(/```dogfood-result\s*\n([\s\S]*?)\n```/gi)];
  const narrative = text.replace(/```dogfood-result[\s\S]*?```/gi, '').trim();
  const details = packets.map(match => `<details class="board-result-packet"><summary>Structured result</summary><pre><code>${escapeHtml(match[1])}</code></pre></details>`).join('');
  return `${markdownMarkup(narrative)}${details}`;
}
function commentBody(comment) { return comment.by === 'agent' ? agentCommentMarkup(comment.text) : `<p>${escapeHtml(comment.text)}</p>`; }
function commentContent(comment, card) {
  return `<div class="board-comment-by"><strong>${escapeHtml(commentAuthor(comment, card))}</strong><time datetime="${escapeHtml(comment.at)}">${escapeHtml(dateLabel(comment.at))}</time></div><div class="board-comment-body">${commentBody(comment)}${attachmentGallery(comment.attachments)}</div>`;
}
function commentMarkup(comment, card) {
  return `<li class="board-comment board-comment-${escapeHtml(comment.by)}" data-comment-id="${escapeHtml(comment.id)}">${commentContent(comment, card)}</li>`;
}
function threadMarkup(comments, card) { return comments.length ? `<ol class="board-thread">${comments.map(comment => commentMarkup(comment, card)).join('')}</ol>` : ''; }
function completedReply(comment) { return comment.by === 'agent' && comment.sent === undefined; }
function visibleConversationStart(comments, card) {
  const latest = comments.findLastIndex(completedReply);
  if (card.status === 'running') return latest + 1;
  if (latest < 0) return 0;
  const sameTurn = comments.findIndex(comment => comment.by === 'agent' && comment.turn === comments[latest].turn);
  return sameTurn < 0 ? latest : sameTurn;
}
function commentsMarkup(card) {
  const comments = card.comments ?? [];
  const latestAgent = visibleConversationStart(comments, card);
  if (!comments.length) return '';
  if (latestAgent <= 0) return threadMarkup(comments, card);
  return `<details class="board-history" data-detail-key="history"><summary>Earlier conversation · ${latestAgent} messages</summary>${threadMarkup(comments.slice(0, latestAgent), card)}</details>${threadMarkup(comments.slice(latestAgent), card)}`;
}

function replyLabel(card, note) {
  if (board().action === 'comment') return 'Sending…';
  if (note) return 'Add note';
  return card.status === 'running' ? 'Send follow-up' : 'Send to agent';
}
function queuedReplyHint(card) { return card.pendingCount ? `${card.pendingCount} follow-up${card.pendingCount === 1 ? '' : 's'} queued for the next turn.` : 'Follow-ups wait for the current turn to finish.'; }
function unsavedIntegration(card) { return card.integration && !card.integration.sourceSaved; }
function replyDisabled(card, note) { return draftBusy() || Boolean(!note && unsavedIntegration(card)); }
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
function replyHasDraft(card) { return Boolean(board().replies[card.id]) || draftImages(board(), card.id).length > 0; }
function replyFormMarkup(card) {
  const value = board().replies[card.id] || '';
  const note = Boolean(board().note[card.id]);
  const label = card.status === 'done' ? 'Follow up on this request' : 'Your reply';
  return `<form id="board-comment-form" class="board-comment-form" data-card-id="${escapeHtml(card.id)}" data-dirty="${replyHasDraft(card)}"><label for="board-reply">${label}</label><textarea id="board-reply" name="text" rows="3" maxlength="10000" ${disabled()} placeholder="Add feedback, answer a question, or ask for a change…">${escapeHtml(value)}</textarea>${attachmentComposer(draftImages(board(), card.id), draftBusy())}<label class="board-note-choice"><input id="board-note" type="checkbox" name="note" ${disabled()} ${note ? 'checked' : ''}> Keep as a note; don’t send to the agent</label><p id="board-reply-hint" class="board-reply-hint">${replyHint(card, note)}</p>${formErrorMarkup('board-comment-error')}${draftStatusMarkup()}<div class="form-actions"><button id="board-reply-send" type="submit" class="save-button" ${replyDisabled(card, note) ? 'disabled' : ''}>${replyLabel(card, note)}</button></div></form>`;
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
function outcomeChecks(checks) { return checks ? `<section class="board-reported-checks"><h4>Agent-reported checks</h4><ul>${checks}</ul><p class="field-hint">Run source checks after applying. These are the agent’s reported observations.</p></section>` : ''; }
function outcomeGaps(gaps) { return gaps ? `<section class="board-unverified"><h4>Still unverified</h4><ul>${gaps}</ul></section>` : ''; }
function outcomeMarkup(card) {
  if (!card.outcome) return '';
  if (card.error || card.status === 'running') return '';
  return outcomeBodyMarkup(card.outcome);
}
function outcomeSummary(outcome) { return outcome.summary === outcome.decision ? '' : `<p>${escapeHtml(outcome.summary)}</p>`; }
function outcomeBodyMarkup(outcome) {
  const checks = outcome.checks.map(check => `<li><code>${escapeHtml(check.command)}</code><p>${escapeHtml(check.result)}</p>${check.evidence ? `<p class="field-hint">Evidence: ${escapeHtml(check.evidence)}</p>` : ''}</li>`).join('');
  const gaps = outcome.unverified.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  return `<section class="board-outcome"><h3>${outcome.decision ? 'Decision needed' : 'Agent outcome'}</h3>${outcomeSummary(outcome)}${outcome.decision ? `<p class="board-decision"><strong>${escapeHtml(outcome.decision)}</strong></p>` : ''}${outcome.previewUrl ? `<a class="text-button" href="${escapeHtml(outcome.previewUrl)}" target="_blank" rel="noopener noreferrer">Open agent preview ↗</a>` : ''}${outcomeChecks(checks)}${outcomeGaps(gaps)}</section>`;
}
function contextReceiptMarkup(card) {
  const context = card.contextManifest;
  if (!context) return '';
  return `<dt>Saved context · turn ${escapeHtml(context.turn)}</dt><dd>Task, sent decisions and image references are saved for this turn.<br><code>${escapeHtml(context.path)}</code></dd>`;
}
function routeMarkup(card) { return card.route ? `<dt>Model route</dt><dd><code>${escapeHtml(card.route)}</code></dd>` : ''; }
function runDetailsMarkup(card) {
  if (!card.session && !card.checkout) return '';
  return `<details class="board-run-details"><summary>Agent session & worktree</summary><dl>${card.session ? `<dt>Session</dt><dd><code>${escapeHtml(card.session)}</code></dd>` : ''}${card.checkout ? `<dt>Worktree</dt><dd><code>${escapeHtml(card.checkout)}</code></dd>` : ''}${routeMarkup(card)}${contextReceiptMarkup(card)}</dl></details>`;
}
function cardErrorMarkup(card) { return card.error ? `<p class="board-error form-error" role="alert">${escapeHtml(card.error)}</p>` : ''; }
function reviewNoteMarkup(card) { return card.status === 'review' ? '<p class="board-review-note">The agent finished its turn. Review its changes and checks before closing the conversation. Delivery verification above tracks the linked task and pages.</p>' : ''; }
function requestMarkup(card) {
  const text = requestText(card);
  if (text.length < 800) return `<div class="board-request-text"><h3>Request</h3><p>${escapeHtml(text)}</p></div>`;
  const first = text.split('\n\n')[0];
  const preview = first.length > 360 ? `${first.slice(0, 360)}…` : first;
  return `<div class="board-request-text"><h3>Request</h3><p>${escapeHtml(preview)}</p><details class="board-full-brief" data-detail-key="full-brief"><summary>Full agent brief</summary><p>${escapeHtml(text)}</p></details></div>`;
}
function detailContentMarkup(card) {
  return `<div class="board-detail-top"><div>${statusMarkup(card)}<h2 id="board-request-heading" tabindex="-1">${escapeHtml(card.title)}</h2></div><button type="button" class="text-button" data-board-action="close" aria-label="Close request">Close</button></div>${contextMarkup(card)}${deliveryMarkup(card, Boolean(board().action))}${requestMarkup(card)}${cardErrorMarkup(card)}<div class="board-detail-actions">${cardActions(card)}</div>${reviewNoteMarkup(card)}${outcomeMarkup(card)}${changedFilesMarkup(card)}${commentsMarkup(card)}`;
}
function detailMarkup(card) {
  if (!card) return '';
  return `<section class="board-detail content-panel" aria-labelledby="board-request-heading"><div id="board-detail-content">${detailContentMarkup(card)}</div>${replyFormMarkup(card)}<div id="board-run-details-host">${runDetailsMarkup(card)}</div></section>`;
}

function option(value, label, selected) { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }
function draftValues() { return { title: '', request: '', backend: 'codex', intent: 'build', pageId: '', featureId: '', taskId: '', doneWhen: '', constraints: '', ...board().draft }; }

function featureOptions(data) {
  const page = linkForPage(data.pageId);
  return `<label for="board-feature">Feature <span class="field-optional">optional</span></label><select id="board-feature" name="featureId" ${page ? '' : 'disabled'}>${option('', page ? 'Whole page' : 'Choose a page first', data.featureId)}${(page?.features ?? []).map(feature => option(feature.id, feature.name, data.featureId)).join('')}</select>`;
}

function hasRequestDraft() { const draft = board().draft || {}; return ['title', 'request', 'doneWhen', 'constraints'].some(key => Boolean(draft[key])); }
function runnerAvailable(backend) { return board().data?.agents?.find(agent => agent.id === backend)?.available === true; }
function requestFieldsMarkup(data) {
  return `<label for="board-intent">Type of work</label><select id="board-intent" name="intent" aria-describedby="board-intent-hint">${Object.entries(intentNames).map(([id, label]) => option(id, label, data.intent)).join('')}</select><p id="board-intent-hint" class="field-hint">${intentHints[data.intent]}</p><label for="board-title">Title</label><input id="board-title" name="title" required maxlength="160" value="${escapeHtml(data.title)}" placeholder="What needs to change?"><label for="board-request">What should the agent do?</label><textarea id="board-request" name="request" rows="4" required maxlength="10000" placeholder="Describe the result you want and how to check it.">${escapeHtml(data.request)}</textarea><label for="board-done-when">Done when <span class="field-optional">expected result and proof</span></label><textarea id="board-done-when" name="doneWhen" rows="2" maxlength="2000" placeholder="What must work, and what evidence should the agent return?">${escapeHtml(data.doneWhen)}</textarea><label for="board-constraints">Boundaries <span class="field-optional">optional</span></label><input id="board-constraints" name="constraints" maxlength="1000" value="${escapeHtml(data.constraints)}" placeholder="What must the agent preserve or leave alone?"><div class="board-form-pair"><div><label for="board-backend">Agent</label><select id="board-backend" name="backend">${Object.entries(agentNames).map(([id, label]) => option(id, label, data.backend)).join('')}</select></div><div><label for="board-page">Related page <span class="field-optional">optional</span></label><select id="board-page" name="pageId">${option('', 'Project-wide', data.pageId)}${requestPages().map(page => option(page.id, page.name, data.pageId)).join('')}</select></div></div>`;
}
function requestContextMarkup(data) {
  return `<section class="board-request-context" aria-label="Related work"><h3>Related work <span class="field-optional">optional</span></h3><div class="board-form-pair"><div>${featureOptions(data)}</div><div><label for="board-task">Planned task <span class="field-optional">optional</span></label><select id="board-task" name="taskId">${option('', 'No linked task', data.taskId)}${board().tasks.map(task => option(task.id, task.title, data.taskId)).join('')}</select></div></div></section>`;
}
function requestActionsMarkup(available) {
  const busy = draftBusy();
  return `<div class="form-actions"><button type="submit" name="submitAction" value="start" class="save-button" ${!available || busy ? 'disabled' : ''}>${busy ? 'Saving…' : 'Create & start'}</button><button type="submit" name="submitAction" value="save" class="text-button" ${disabled()}>Save for later</button><button type="button" class="text-button" data-board-action="cancel" ${disabled()}>Cancel</button></div>`;
}
function requestFormMarkup() {
  if (!board().formOpen) return '';
  const data = draftValues();
  const available = runnerAvailable(data.backend);
  return `<form id="board-request-form" class="board-request-form content-panel" data-dirty="${hasRequestDraft()}"><fieldset class="board-draft-fields" ${draftBusy() ? 'disabled' : ''}><div class="panel-heading"><h2>New request</h2></div>${requestFieldsMarkup(data)}${requestContextMarkup(data)}${contractMarkup(board().tasks.find(task => task.id === data.taskId))}<p id="board-agent-unavailable" class="board-reply-hint" ${available ? 'hidden' : ''}>PAL is unavailable. Install PAL and sign in to your agent, then start this saved request.</p>${formErrorMarkup('board-request-error')}${draftStatusMarkup()}<p class="field-hint">Starting uses your local agent account and a separate checkout. You review the returned work before it enters project source.</p>${requestActionsMarkup(available)}</fieldset></form>`;
}
function boardHeadingMarkup() {
  const buttonClass = board().selected ? 'text-button' : 'save-button';
  const newButton = board().formOpen || board().section !== 'requests' ? '' : `<button type="button" class="${buttonClass}" data-board-action="new" ${disabled()}>New request</button>`;
  return `<div class="page-heading board-heading"><div><h1 id="board-heading" tabindex="-1">Agent board</h1><p id="board-summary" class="board-summary">${escapeHtml(summary())}</p></div><div class="board-heading-actions"><button type="button" class="link-button" data-project-view="help">How it works</button>${newButton}</div></div>`;
}
function loadErrorMarkup() {
  const error = board().error;
  return `<div id="board-load-error" class="form-error" role="alert" ${error ? '' : 'hidden'}>${escapeHtml(error)} ${error ? '<button type="button" class="text-button" data-board-action="refresh">Try again</button>' : ''}</div>`;
}
function emptyBoardMarkup() {
  if (!board().data || cards().length || board().formOpen) return '';
  return '<section class="board-empty-state" aria-labelledby="board-empty-heading"><h2 id="board-empty-heading">No requests yet</h2><p>Send a task from Plan or create a request here. Choose the type of work; the agent returns its result for your review.</p></section>';
}
function boardLoadingMarkup() { return !board().data ? '<p class="muted" role="status" id="board-loading">Loading requests…</p>' : ''; }
function noMatches() { return cards().length > 0 && visibleCards().length === 0; }
function sectionVisibility(name) { return board().section === name ? '' : 'hidden'; }
export function boardMarkup() {
  const data = board().data;
  return `<div class="agent-board ${board().selected ? 'has-selection' : ''}" data-ui>${boardHeadingMarkup()}${loadErrorMarkup()}${boardNavigation()}${requestFormMarkup()}${boardLoadingMarkup()}<div id="board-ready-host" ${sectionVisibility('ready')}>${readyWorkMarkup(data)}</div>${workQueuePanel()}<div id="board-requests-view" ${sectionVisibility('requests')}>${toolbarMarkup()}<div id="board-empty-host">${emptyBoardMarkup()}</div><div class="board-workspace"><div id="board-lanes" class="board-lanes" role="region" aria-label="Agent requests" ${data ? '' : 'hidden'}>${data ? lanesMarkup() : ''}</div><p id="board-filter-empty" class="muted" ${noMatches() ? '' : 'hidden'}>No requests match these filters.</p><div id="board-detail-host">${detailMarkup(selectedCard())}</div></div></div></div>`;
}


function toolbarMarkup() {
  return `<div class="board-toolbar"><label for="board-search" class="sr-only">Search requests</label><input id="board-search" type="search" placeholder="Search requests…" value="${escapeHtml(board().search)}"><label for="board-filter" class="sr-only">Filter requests</label><select id="board-filter">${[['all','All requests'],['active','Open requests'],['attention','Needs you'],['review','Ready for review'],['done','Closed requests']].map(([value,label]) => option(value,label,board().filter)).join('')}</select></div>`;
}
function boardNavigation() {
  const b = board();
  const options = [['requests', 'Requests', cards().length], ['ready', 'Ready tasks', b.data?.readyTasks?.length], ['qa', 'QA coverage', b.queue?.summary?.needsReview]];
  return `<nav class="board-navigation" aria-label="Agent work"><div>${options.map(([id,label,total]) => `<button type="button" data-board-action="section" data-section="${id}" aria-pressed="${b.section === id}">${label}${Number.isInteger(total) ? `<span>${total}</span>` : ''}</button>`).join('')}</div></nav>`;
}
function workQueuePanel() {
  return `<section id="board-work-queue" class="board-work-queue" aria-label="QA coverage" ${sectionVisibility('qa')}><div id="board-work-queue-body">${queueMarkup(board().queue, board().queueError, Boolean(board().action), board().qaBackend, board().queuePage)}</div></section>`;
}
function showBoardSection(button) {
  const b = board();
  if (b.formOpen && hasRequestDraft()) return inlineError('board-request-error', 'Save or cancel your request before switching views.');
  b.section = button.dataset.section; b.selected = ''; b.formOpen = false;
  rememberSelection(''); render();
  document.querySelector(`[data-section="${b.section}"]`)?.focus({ preventScroll: true });
}
function showQueuePage(button) {
  board().queuePage = button.dataset.pageId || button.value;
  render();
  document.getElementById('queue-page-heading')?.focus({ preventScroll: true });
}
async function loadQueue(b) {
  try { const data = await readJson(`/api/projects/${encodeURIComponent(b.key)}/work-queue`); if (current(b)) { b.queue = data; b.queueError = ''; } }
  catch (error) { if (current(b)) b.queueError = error.message; }
}
async function refreshQueue() {
  const b = board();
  await loadQueue(b);
  if (!active(b)) return;
  const root = document.getElementById('board-work-queue-body');
  if (root) root.innerHTML = queueMarkup(b.queue, b.queueError, Boolean(b.action), b.qaBackend, b.queuePage);
  updateBoardNavigation();
}
function prepareTask(id) {
  const task = board().tasks.find(item => item.id === id);
  if (!task) return;
  openBoardRequest(task.pageIds?.[0] || '', { taskId: task.id, title: task.title, request: task.outcome, doneWhen: task.look || '', intent: 'build' });
}
async function prepareReview(pageId) {
  const backend = document.getElementById('board-qa-backend')?.value || 'codex';
  await mutate('queue-review', async b => {
    const saved = await readJson(`/api/projects/${encodeURIComponent(b.key)}/work-queue/${encodeURIComponent(pageId)}/request`, { method: 'POST', body: JSON.stringify({ backend }) });
    if (!current(b)) return;
    b.selected = saved.request.id; b.formOpen = false; b.section = 'requests';
    rememberSelection(b.selected);
    await refreshAfterMutation(b);
    await loadQueue(b);
  });
}

function rememberSelection(id) {
  const query = new URLSearchParams(window.location.search);
  query.set('project', state.project.id);
  query.set('view', 'board');
  if (board().section === 'requests') query.delete('boardView'); else query.set('boardView', board().section);
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
function editingBoard(b) { return b.formOpen || hasReplyDrafts() || document.activeElement?.closest('.board-toolbar, .board-navigation, #board-ready-host, #board-comment-form, #board-work-queue'); }
function updateReplyLabels(card) {
  const note = Boolean(board().note[card.id]);
  const hint = document.getElementById('board-reply-hint');
  if (hint) hint.textContent = replyHint(card, note);
  const send = document.getElementById('board-reply-send');
  if (send) { send.textContent = replyLabel(card, note); send.disabled = replyDisabled(card, note); }
}
function detailKey(node) { return `${node.closest('[data-comment-id]')?.dataset.commentId || ''}:${node.dataset.detailKey || node.querySelector(':scope > summary')?.textContent}`; }
function detailStates(root) { return new Map([...root.querySelectorAll('details')].map(node => [detailKey(node), node.open])); }
function restoreDetails(root, opened) { root.querySelectorAll('details').forEach(node => { if (opened.has(detailKey(node))) node.open = opened.get(detailKey(node)); }); }
function updateRunDetails(card) {
  const root = document.getElementById('board-run-details-host');
  if (!root) return;
  const opened = detailStates(root);
  root.innerHTML = runDetailsMarkup(card);
  restoreDetails(root, opened);
  const label = document.querySelector('label[for="board-reply"]');
  if (label) label.textContent = card.status === 'done' ? 'Follow up on this request' : 'Your reply';
}
function updateSelectedDetail() {
  const card = selectedCard();
  const root = document.getElementById('board-detail-content');
  if (!card || !root) return;
  const reply = document.getElementById('board-reply');
  const focused = document.activeElement === reply;
  const before = reply?.getBoundingClientRect().top;
  const opened = detailStates(root);
  root.innerHTML = detailContentMarkup(card);
  restoreDetails(root, opened);
  updateReplyLabels(card);
  updateRunDetails(card);
  if (focused) window.scrollBy(0, reply.getBoundingClientRect().top - before);
}
function updateBoardErrorNode() {
  const root = document.getElementById('board-load-error');
  if (!root) return;
  root.hidden = !board().error;
  root.textContent = board().error;
}
function updateBoardNavigation() {
  const nav = document.querySelector('.board-navigation');
  if (nav && !nav.contains(document.activeElement)) nav.outerHTML = boardNavigation();
}
function updateBoardExtras() {
  updateBoardNavigation();
  const ready = document.getElementById('board-ready-host');
  if (ready && !ready.contains(document.activeElement)) ready.innerHTML = readyWorkMarkup(board().data);
  const filtered = document.getElementById('board-filter-empty');
  if (filtered) filtered.hidden = !noMatches();
}
function updateBoardDataNodes() {
  const root = document.querySelector('#board-lanes');
  updateBoardExtras();
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
function needsBoardRender(b) { return !document.getElementById('board-detail-content') && (selectedCard() || !editingBoard(b)); }
function updateSurface(b) {
  if (!active(b)) return;
  if (needsBoardRender(b)) { render(); return; }
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
    await loadTasks(b);
    if (first) await loadQueue(b);
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
  Object.assign(board(), { selected: state.boardDestination, section: 'requests', formOpen: false, attempted: false });
}
function showDraftStatus() { return hasBoardDrafts() || draftStorageError(board()) || draftStorageLoading(board()); }
function updateDraftStatus() {
  document.querySelectorAll('[data-board-draft-status]').forEach(node => {
    node.textContent = draftStorageStatus(board()); node.hidden = !showDraftStatus();
    node.className = draftStorageError(board()) ? 'form-error' : 'field-hint';
  });
}
function draftStatusMarkup() { return `<p data-board-draft-status role="status" class="${draftStorageError(board()) ? 'form-error' : 'field-hint'}" ${showDraftStatus() ? '' : 'hidden'}>${escapeHtml(draftStorageStatus(board()))}</p>`; }
function draftStorageChanged(b) {
  if (!active(b)) return;
  if (!draftStorageLoading(b) && !b.draftHydrated) { b.draftHydrated = true; render(); return; }
  updateDraftStatus();
}
function resetBoardProject() { releaseImagePreviews(board()); state.board = freshBoard(state.project.id, state.boardDestination || ''); }
export function syncBoardState() {
  if (board().key !== state.project.id) resetBoardProject();
  else applyBoardDestination();
  state.boardDestination = '';
  const b = board(); prepareBoardDrafts(b, () => draftStorageChanged(b));
  if (state.view !== 'board') { clearTimeout(poll); return; }
  if (needsInitialLoad(board())) void loadBoard(board(), true);
  else schedulePoll(board());
}

export function hasBoardDrafts() { return hasRequestDraft() || hasReplyDrafts(); }
function hasReplyDrafts() { return Object.values(board().replies).some(text => Boolean(text.trim())) || hasImageDrafts(board()); }
export function closeBoardEditors() { board().formOpen = false; board().formError = ''; }
export function discardBoardDrafts() {
  const b = board();
  closeBoardEditors();
  clearImages(b); b.draft = null; b.replies = {}; b.note = {}; b.commentAttempts = {};
  saveBoardDrafts(b); return flushBoardDrafts(b);
}
export function reviewBoardDraft() {
  const b = board(); b.section = 'requests';
  Object.assign(state, { view: 'board', browseOpen: false });
  if (hasRequestDraft()) { b.formOpen = true; b.selected = ''; }
  else b.selected = Object.keys(b.replies).find(id => b.replies[id].trim()) || firstImageDraft(b);
  rememberSelection(b.selected);
  render();
  focus(b.formOpen ? 'board-title' : 'board-reply');
}

function draftHasText(values) { return Boolean(values.title || values.request || values.text || values.doneWhen || values.constraints); }
function rememberReply(form, values) {
  board().replies[form.dataset.cardId] = values.text || '';
  board().note[form.dataset.cardId] = values.note === 'on';
}
function rememberDraft(form) {
  const values = Object.fromEntries(new FormData(form));
  if (form.id === 'board-request-form') board().draft = values;
  if (form.id === 'board-comment-form') rememberReply(form, values);
  form.dataset.dirty = String(draftHasText(values) || draftImages(board(), form.dataset.cardId).length > 0);
  saveBoardDrafts(board());
}

function inlineError(id, message) {
  board().formError = message;
  const node = document.getElementById(id);
  if (node) { node.textContent = message; node.hidden = !message; }
}

function focus(id) { document.getElementById(id)?.focus({ preventScroll: true }); }

export async function openBoardRequest(pageId = '', seed = {}) {
  const b = board();
  await waitForBoardDrafts(b);
  if (!current(b)) return;
  Object.assign(state, { view: 'board', browseOpen: false, message: '' });
  if (!hasRequestDraft()) b.draft = { pageId, ...seed };
  Object.assign(b, { formOpen: true, selected: '', section: 'requests', formError: '' });
  rememberSelection('');
  saveBoardDrafts(b);
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
  b.formOpen = false; b.draft = null; b.section = 'requests';
  rememberSelection(b.selected);
}
function requestInput(draft, submitter) {
  const { doneWhen, constraints, ...fields } = draft;
  const sections = [['Done when', doneWhen], ['Boundaries', constraints]].filter(([,text]) => text?.trim()).map(([label,text]) => `${label}:\n${text.trim()}`);
  return { ...fields, request: [fields.request.trim(), ...sections].join('\n\n'), start: submitter?.value === 'start' };
}
async function createRequest(form, submitter) {
  rememberDraft(form);
  const draft = draftValues();
  if (!draft.title.trim() || !draft.request.trim()) return inlineError('board-request-error', 'Add a title and describe what the agent should do.');
  const input = requestInput(draft, submitter);
  if (input.request.length > 10000) return inlineError('board-request-error', 'Keep the complete brief under 10,000 characters.');
  await mutate('create', async b => {
    await persistBeforeSend(b);
    const saved = await post(b, '/cards', input);
    if (!current(b)) return;
    savedRequest(b, saved);
    saveBoardDrafts(b); await flushBoardDrafts(b);
    await refreshAfterMutation(b);
  }, { form: true, focusId: 'board-request-heading' });
}
async function persistBeforeSend(b) {
  saveBoardDrafts(b);
  if (!await flushBoardDrafts(b)) throw new Error('Could not save this draft safely. '+draftStorageStatus(b));
}
async function sendComment(form) {
  rememberDraft(form);
  const id = form.dataset.cardId;
  const text = (board().replies[id] || '').trim();
  const images = draftImages(board(), id);
  if (!text && !images.length) return inlineError('board-comment-error', 'Write a reply or attach an image first.');
  const input = { text, send: !board().note[id] };
  input.clientRequestId = commentIdentity(board(), id, input, images);
  await mutate('comment', async b => {
    await persistBeforeSend(b);
    input.attachments = await imagePayload(images);
    await post(b, cardPath(id, 'comment'), input);
    if (!current(b)) return;
    b.replies[id] = ''; clearImages(b, id); delete b.commentAttempts[id];
    saveBoardDrafts(b); await flushBoardDrafts(b);
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
  b.selected = button.dataset.cardId; b.formError = ''; b.section = 'requests';
  rememberSelection(b.selected);
  render(); focus('board-request-heading');
  document.getElementById('board-request-heading')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}
function closeCard() { board().selected = ''; rememberSelection(''); render(); }
function cancelRequest() {
  if (hasRequestDraft() && !window.confirm('Discard this request draft?')) return;
  board().formOpen = false; board().draft = null; board().formError = '';
  saveBoardDrafts(board()); void flushBoardDrafts(board());
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
async function cancelSavedRequest() {
  if (selectedCard()?.pendingCount && !window.confirm('Cancel this request and discard its queued feedback? The conversation and discarded feedback stay in its history.')) return;
  await runAction('cancel');
}
function answerAgent() { const reply = document.getElementById('board-reply'); reply?.scrollIntoView({ block: 'center', behavior: 'instant' }); reply?.focus({ preventScroll: true }); }
const boardActions = {
  'attach-images': () => document.getElementById('board-image-input')?.click(),
  'remove-image': button => { removeImage(board(), board().selected, button.dataset.imageId); updateImageDraft(); },
  section: showBoardSection,
  'queue-page': showQueuePage,
  reply: answerAgent,
  'planned-request': button => prepareTask(button.dataset.taskId),
  'queue-review': button => prepareReview(button.dataset.pageId),
  'refresh-queue': () => refreshQueue(),
  new: () => openBoardRequest(),
  refresh: () => loadBoard(board(), !board().data),
  inspect: inspectChanges,
  integrate: integrateChanges,
  'save-source': saveSourceChanges,
  'release-integration': releaseSourceIntegration,
  select: selectCard,
  close: closeCard,
  cancel: cancelRequest,
  'cancel-saved': cancelSavedRequest,
  ...Object.fromEntries(['run', 'stop', 'complete', 'reopen', 'discard-feedback', 'verify-task', 'accept-task', 'reopen-task'].map(action => [action, () => runAction(action)])),
};
function boardClick(button) { boardActions[button.dataset.boardAction]?.(button); }
function handleBoardInput(event) {
  const form = event.target.closest('#board-request-form, #board-comment-form');
  if (event.target.id === 'board-search') { board().search = event.target.value; updateBoardDataNodes(); return; }
  if (form) rememberDraft(form);
}
function changeBoardFilter(target) {
  if (target.id === 'board-qa-page') { showQueuePage(target); return true; }
  if (target.id === 'board-qa-backend') { board().qaBackend = target.value; return true; }
  if (target.id === 'board-filter') { board().filter = target.value; updateBoardDataNodes(); return true; }
  return false;
}
function handleImageSelection(target) {
  if (target.id !== 'board-image-input') return false;
  acceptImages(target.files); target.value = ''; return true;
}
function changeBoardField(target) { return handleImageSelection(target) || changeBoardFilter(target); }
function handleBoardChange(event) {
  if (changeBoardField(event.target)) return;
  const form = event.target.closest('#board-request-form, #board-comment-form');
  if (!form) return;
  rememberDraft(form);
  if (event.target.id === 'board-page') { board().draft.featureId = ''; saveBoardDrafts(board()); }
  const id = event.target.id;
  if (['board-page', 'board-backend', 'board-note', 'board-intent', 'board-task'].includes(id)) { render(); focus(id); }
}
function handleBoardSubmit(event) {
  const handlers = { 'board-request-form': createRequest, 'board-comment-form': sendComment };
  const handler = handlers[event.target.id];
  if (!handler) return;
  event.preventDefault();
  void handler(event.target, event.submitter);
}

function updateImageDraft() {
  const host = document.getElementById('board-image-drafts');
  if (host) host.innerHTML = attachmentComposer(draftImages(board(), board().selected), draftBusy(), true);
  const form = document.getElementById('board-comment-form');
  if (form) rememberDraft(form);
}
function acceptImages(files) {
  if (draftBusy()) return;
  try { addImages(board(), board().selected, [...files]); inlineError('board-comment-error', ''); }
  catch (error) { inlineError('board-comment-error', error.message); }
  updateImageDraft();
}
function pasteImages(event) {
  if (!event.target.closest('#board-comment-form')) return;
  const files = clipboardImages(event.clipboardData);
  if (!files.length) return;
  event.preventDefault(); acceptImages(files);
}
export function registerBoardEvents(app) {
  window.addEventListener('beforeunload', protectPendingDraft);
  app.addEventListener('paste', pasteImages);
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-board-action]');
    if (button) boardClick(button);
    if (event.target.closest('[data-action="request-page-change"]')) openBoardRequest(state.pageId);
  });
  app.addEventListener('input', handleBoardInput);
  app.addEventListener('change', handleBoardChange);
  app.addEventListener('submit', handleBoardSubmit);
}
