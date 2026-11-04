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
  return `<section class="delivery-page-status"><h4>Related pages · ${pages.filter(page => page.accepted).length}/${pages.length} accepted</h4><ul class="delivery-pages">${pages.map(deliveryPage).join('')}</ul></section>`;
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
  if (!tasks.length) return '<section class="board-ready-work"><h2>No tasks ready yet</h2><p class="muted">Add a task in Plan or finish its dependencies. Ready tasks appear here when an agent can take them.</p><button type="button" class="text-button" data-project-view="plan">Open Plan</button></section>';
  return `<section class="board-ready-work"><h2>Ready for an agent</h2><p class="muted">These planned tasks have no unfinished dependencies. Prepare a request to review its scope and choose an agent.</p><ul>${tasks.map(readyTask).join('')}</ul></section>`;
}
function queueAction(page, busy) {
  if (page.request) return `<button type="button" class="text-button" data-board-action="select" data-card-id="${esc(page.request.id)}">Open review request</button>`;
  return `<button type="button" class="text-button" data-board-action="queue-review" data-page-id="${esc(page.id)}" ${busy ? 'disabled' : ''}>Prepare review</button>`;
}
function gapMarkup(check) { return `<li>${esc(check.missing || check.label)}</li>`; }
function queueRequirementGroup(title, rows) {
  return rows ? `<section class="queue-requirement-group"><h4>${title}</h4><ul class="queue-requirements">${rows}</ul></section>` : '';
}
function queueGaps(page) {
  const gaps = page.missingChecks.map(gapMarkup).join('');
  const findings = page.openFindings.map(issue => `<li>${esc(issue.title)}</li>`).join('');
  const acceptance = page.acceptanceGaps.map(gapMarkup).join('');
  const debt = (page.liveDebt || []).map(item => `<li>${esc(item.name || item.label || item.id)}${item.note ? ` — ${esc(item.note)}` : ''}</li>`).join('');
  return queueRequirementGroup('Required checks', gaps) + queueRequirementGroup('Open findings', findings) + queueRequirementGroup('Before acceptance', acceptance) + queueRequirementGroup('Live verification', debt);
}
function queuePage(page, selected) {
  return `<li><button type="button" data-board-action="queue-page" data-page-id="${esc(page.id)}" aria-pressed="${page.id === selected}"><strong>${esc(page.name)}</strong><span>${page.missingCount} missing ${page.missingCount === 1 ? 'check' : 'checks'} · ${page.openFindings.length} open ${page.openFindings.length === 1 ? 'finding' : 'findings'}</span><span>${page.request ? 'Review request saved' : 'Review not assigned'}</span></button></li>`;
}
function queuePageDetail(page, busy) {
  return `<section class="queue-page-detail" aria-labelledby="queue-page-heading"><div class="panel-heading"><div><h3 id="queue-page-heading" tabindex="-1">${esc(page.name)}</h3><p class="muted">${esc(page.route)}</p></div>${queueAction(page, busy)}</div>${queueGaps(page)}<button type="button" class="link-button" data-page="${esc(page.id)}">Open page evidence</button></section>`;
}
function queuePagePicker(pages, selected) {
  return `<div class="queue-mobile-picker"><label for="board-qa-page">Page to review</label><select id="board-qa-page">${pages.map(page => `<option value="${esc(page.id)}" ${page.id === selected ? 'selected' : ''}>${esc(page.name)} · ${page.missingCount} missing checks</option>`).join('')}</select></div>`;
}
function queueBody(queue, busy, backend, selected) {
  const page = queue.pages.find(page => page.id === selected) || queue.pages[0];
  return `<div class="queue-heading"><h2>Pages to review</h2><p class="muted">Choose a page. Review its remaining checks, then open or prepare an agent request.</p></div><div class="work-queue-controls"><label for="board-qa-backend">Review agent</label><select id="board-qa-backend"><option value="codex" ${backend === 'codex' ? 'selected' : ''}>Codex</option><option value="claude" ${backend === 'claude' ? 'selected' : ''}>Claude Code</option></select><button type="button" class="text-button" data-board-action="refresh-queue">Refresh coverage</button></div>${queuePagePicker(queue.pages, page.id)}<div class="queue-workspace"><ul class="work-queue-list" aria-label="Pages needing review">${queue.pages.map(item => queuePage(item, page.id)).join('')}</ul>${queuePageDetail(page, busy)}</div>`;
}
export function queueMarkup(queue, error, busy, backend, selected) {
  if (error) return `<p class="form-error" role="alert">${esc(error)} <button type="button" class="text-button" data-board-action="refresh-queue">Retry coverage</button></p>`;
  if (!queue) return '<p class="muted">Loading required checks…</p>';
  if (!queue.pages.length) return '<h2>No outstanding checks</h2><p class="muted">The registered pages have no outstanding requirements. Discovery determines whether that inventory covers the full product.</p>';
  return queueBody(queue, busy, backend, selected);
}
function contractChecks(checks = []) {
  return `<section class="contract-checks"><h4>${checks.length} required command checks</h4><ul>${checks.map(check => `<li><code>${esc(check.command.join(' '))}</code></li>`).join('')}</ul></section>`;
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
