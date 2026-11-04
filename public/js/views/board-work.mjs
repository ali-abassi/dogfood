import { escapeHtml as esc } from '../format.mjs';

const priorities = ['Urgent', 'High', 'Normal', 'Low'];
const met = row => ['pass', 'met'].includes(row.status);
export function deliveryBadge(card) {
  const d = card.delivery;
  if (!d) return '';
  return `<span class="board-delivery-badge ${d.state === 'accepted' ? 'is-verified' : ''}">${esc(d.label)}</span>`;
}
function actionControl(next, busy) { return `<button type="button" class="text-button" data-board-action="${next.kind}" ${busy ? 'disabled' : ''}>${esc(next.label)}</button>`; }
function deliveryAction(next, busy, pageId) {
  if (!next) return '';
  if (next.kind === 'open-page') return `<button type="button" class="link-button" data-page="${esc(pageId)}">Review page evidence</button>`;
  if (['inspect', 'save-source', 'verify-task', 'accept-task', 'reopen-task'].includes(next.kind)) return actionControl(next, busy);
  return next.kind === 'open-plan' ? '<button type="button" class="link-button" data-project-view="plan">Open task in Plan</button>' : '';
}
function requirementMarkup(row) {
  return `<li class="delivery-requirement"><span class="delivery-mark ${met(row) ? 'is-met' : ''}" aria-hidden="true">${met(row) ? '✓' : '–'}</span><div><strong>${esc(row.label)}</strong><span>${esc(row.detail || row.status)}</span></div></li>`;
}
function deliveryPage(page) {
  return `<li><button type="button" class="link-button" data-page="${esc(page.id)}">${esc(page.name)}</button><span>${page.accepted ? 'Accepted' : esc(page.reason || 'Needs verification')}</span></li>`;
}
function deliveryPages(pages = []) {
  if (!pages.length) return '';
  return `<details data-detail-key="delivery-pages"><summary>Related page verification · ${pages.filter(page => page.accepted).length}/${pages.length}</summary><ul class="delivery-pages">${pages.map(deliveryPage).join('')}</ul></details>`;
}
function deliveryRequirements(rows = []) { return rows.length ? `<ol class="delivery-requirements">${rows.map(requirementMarkup).join('')}</ol>` : ''; }
export function deliveryMarkup(card, busy) {
  const d = card.delivery;
  if (!d) return '';
  return `<section class="board-delivery" aria-label="Delivery verification"><div class="board-delivery-heading"><h3>${esc(d.label)}</h3>${deliveryAction(d.nextAction, busy, card.pageId)}</div><p>${esc(d.summary)}</p>${d.task ? `<p class="board-task-outcome"><strong>Done when</strong> ${esc(d.task.outcome)}</p>` : ''}${deliveryRequirements(d.requirements)}${deliveryPages(d.pages)}</section>`;
}
function readyTask(task) {
  return `<li><div><strong>${esc(task.title)}</strong><span>${esc(priorities[task.priority] || 'Normal')} priority · ${esc(task.outcome)}</span></div><button type="button" class="text-button" data-board-action="planned-request" data-task-id="${esc(task.id)}">Prepare request</button></li>`;
}
export function readyWorkMarkup(data) {
  const tasks = data?.readyTasks || [];
  if (!tasks.length) return '';
  return `<details class="board-ready-work"><summary>${tasks.length} planned ${tasks.length === 1 ? 'task ready' : 'tasks ready'} for an agent</summary><ul>${tasks.map(readyTask).join('')}</ul></details>`;
}
function queueAction(page, busy) {
  if (page.request) return `<button type="button" class="text-button" data-board-action="select" data-card-id="${esc(page.request.id)}">Open review request</button>`;
  return `<button type="button" class="text-button" data-board-action="queue-review" data-page-id="${esc(page.id)}" ${busy ? 'disabled' : ''}>Prepare review</button>`;
}
function gapMarkup(check) { return `<li>${esc(check.missing || check.label)}</li>`; }
function queueGaps(page) {
  const gaps = page.missingChecks.map(gapMarkup).join('');
  const findings = page.openFindings.map(issue => `<li>${esc(issue.title)}</li>`).join('');
  const acceptance = page.acceptanceGaps.map(gapMarkup).join('');
  const debt = (page.liveDebt || []).map(item => `<li>Live verification: ${esc(item.name || item.label || item.id)}${item.note ? ` — ${esc(item.note)}` : ''}</li>`).join('');
  return gaps + findings + acceptance + debt;
}
function queuePage(page, busy) {
  return `<li><div class="work-queue-page"><button type="button" class="link-button" data-page="${esc(page.id)}">${esc(page.name)}</button><span>${page.missingCount} missing ${page.missingCount === 1 ? 'check' : 'checks'} · ${page.openFindings.length} open ${page.openFindings.length === 1 ? 'finding' : 'findings'}</span></div><div class="work-queue-action">${queueAction(page, busy)}</div><details><summary>What remains</summary><ul>${queueGaps(page)}</ul></details></li>`;
}
function queueBody(queue, busy, backend) {
  return `<p class="field-hint">${queue.summary.needsReview} pages need attention in the registered inventory. Preparing a review saves a scoped request with every required check; it does not start an agent.</p><div class="work-queue-controls"><label for="board-qa-backend">Review agent</label><select id="board-qa-backend"><option value="codex" ${backend === 'codex' ? 'selected' : ''}>Codex</option><option value="claude" ${backend === 'claude' ? 'selected' : ''}>Claude Code</option></select><button type="button" class="text-button" data-board-action="refresh-queue">Refresh coverage</button></div><ul class="work-queue-list">${queue.pages.map(page => queuePage(page, busy)).join('')}</ul>`;
}
export function queueMarkup(queue, error, busy, backend = 'codex') {
  if (error) return `<p class="form-error" role="alert">${esc(error)} <button type="button" class="text-button" data-board-action="refresh-queue">Retry coverage</button></p>`;
  if (!queue) return '<p class="muted">Loading required checks…</p>';
  if (!queue.pages.length) return '<p class="muted">No outstanding checks in the registered page inventory. Discovery determines whether that inventory covers the full product.</p>';
  return queueBody(queue, busy, backend);
}
function contractChecks(checks = []) {
  return `<details><summary>${checks.length} required command checks</summary><ul>${checks.map(check => `<li><code>${esc(check.command.join(' '))}</code></li>`).join('')}</ul></details>`;
}
function contractScope(task) {
  const scope = (task.scope || []).join(', ') || 'See task outcome';
  const deps = (task.dependencies || []).join(', ') || 'No dependencies';
  return `<dl><dt>Scope</dt><dd>${esc(scope)}</dd><dt>Depends on</dt><dd>${esc(deps)}</dd></dl>`;
}
export function contractMarkup(task) {
  if (!task) return '';
  return `<section class="board-linked-contract" aria-label="Linked task contract"><strong>${esc(task.title)}</strong><p>${esc(task.outcome)}</p>${contractScope(task)}${task.look ? `<p><strong>Visible result:</strong> ${esc(task.look)}</p>` : ''}${contractChecks(task.checks)}</section>`;
}
