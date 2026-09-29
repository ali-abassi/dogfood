import { readJson } from '../api.mjs';
import { escapeHtml } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';
import { planDocumentMarkup } from './docs.mjs';

const labels = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', accepted: 'Accepted' };

function endpoint(path = '') {
  return `/api/projects/${encodeURIComponent(state.project.id)}${path}`;
}

function workflowTasks() {
  return Array.isArray(state.workflow.data?.tasks) ? state.workflow.data.tasks : [];
}

function nextTask(tasks) {
  const next = state.workflow.data?.next;
  return tasks.find(task => task.id === (typeof next === 'string' ? next : next?.id)) ?? null;
}

function taskTitle(task) {
  return `<span class="task-status task-status-${escapeHtml(task.status)}">${escapeHtml(labels[task.status] || task.status)}</span><strong>${escapeHtml(task.title)}</strong>`;
}

function taskListMarkup(tasks, selected) {
  if (!tasks.length) return '<p class="plan-empty">No tasks yet. Add the first task with an outcome and a check.</p>';
  return `<ul class="plan-tasks">${tasks.map(task => `<li><button type="button" class="plan-task ${selected?.id === task.id ? 'selected' : ''}" data-action="select-task" data-task-id="${escapeHtml(task.id)}" aria-pressed="${selected?.id === task.id}">${taskTitle(task)}<span>${escapeHtml(task.outcome)}</span></button></li>`).join('')}</ul>`;
}

function detailLine(label, value) {
  if (!value) return '';
  return `<p class="task-detail-line"><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</p>`;
}

function receiptMarkup(receipt) {
  if (!receipt) return '<p class="muted">No check receipt yet.</p>';
  return `<div class="task-receipt"><p><strong>Last check: ${escapeHtml(receiptStatus(receipt))}</strong>${receiptNoteMarkup(receipt)}</p><details><summary>Receipt details</summary><pre>${escapeHtml(JSON.stringify(receipt, null, 2))}</pre></details></div>`;
}

function receiptStatus(receipt) {
  return receipt.passed === true ? 'Passed' : receipt.passed === false ? 'Failed' : 'Recorded';
}

function receiptNoteMarkup(receipt) {
  const note = receipt.message || receipt.summary || receipt.error;
  return note ? ` · ${escapeHtml(note)}` : '';
}

function availableTaskActions(task) {
  const options = [];
  if (canStart(task)) options.push(['claim', 'Start work']);
  if (canVerify(task)) options.push(['verify', 'Run checks']);
  if (canAccept(task)) options.push(['accept', 'Accept task']);
  return options;
}

function canStart(task) { return task.status === 'todo' && !task.owner; }
function canVerify(task) { return task.status === 'doing' && task.owner === 'person'; }
function canAccept(task) { return task.status !== 'accepted' && task.owner === 'person' && task.receipt?.passed === true; }

function taskActionButton([action, label], task, busy) {
  const style = action === 'accept' ? 'save-button' : 'text-button';
  const text = state.workflow.action === `${action}:${task.id}` ? 'Saving…' : label;
  return `<button type="button" class="${style}" data-action="task-${action}" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>${text}</button>`;
}

function taskActionsMarkup(task) {
  if (task.owner && task.owner !== 'person') return recoveryMarkup(task);
  const busy = Boolean(state.workflow.action);
  const actions = availableTaskActions(task).map(option => taskActionButton(option, task, busy)).join('');
  return `<div class="form-actions">${actions}<button type="button" class="text-button" data-action="edit-task" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>Edit</button></div>`;
}

function recoveryMarkup(task) {
  const open = state.workflow.recovering === task.id;
  const form = open ? recoveryFormMarkup(task) : `<button type="button" class="text-button" data-action="recover-task" data-task-id="${escapeHtml(task.id)}">Recover task…</button>`;
  return `<div class="task-recovery"><p class="muted">${escapeHtml(task.owner)} owns this task.</p>${form}</div>`;
}

function recoveryFormMarkup(task) {
  return `<form id="task-recovery-form" class="task-recovery-form" data-task-id="${escapeHtml(task.id)}"><label for="task-recovery-reason">Why is this task being released from ${escapeHtml(task.owner)}?</label><textarea id="task-recovery-reason" name="reason" rows="2" required minlength="12" placeholder="For example: the previous agent run stopped without a handoff."></textarea><p id="task-recovery-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="text-button">Release ownership</button><button type="button" class="text-button" data-action="cancel-task-recovery">Cancel</button></div></form>`;
}

function taskDetailMarkup(task, tasks) {
  if (!task) return '';
  const pageNames = namedPageIds(task.pageIds || []);
  const dependencyNames = namedTaskIds(task.dependencies || [], tasks);
  return `<section class="content-panel plan-detail" aria-label="Selected task" data-selected-task="${escapeHtml(task.id)}"><div class="plan-detail-head">${taskTitle(task)}</div><p class="task-outcome">${escapeHtml(task.outcome)}</p>${detailLine('Owner', task.owner)}${detailLine('Blocked by', task.blocker)}${detailLine('Handoff', task.handoff)}${latestRecoveryMarkup(task)}${detailLine('Pages', pageNames.join(', '))}${detailLine('Depends on', dependencyNames.join(', '))}${detailLine('Scope', (task.scope || []).join(', '))}${detailLine('Look for', task.look)}${taskChecksMarkup(task)}${receiptMarkup(task.receipt)}${taskActionsMarkup(task)}</section>`;
}

function latestRecoveryMarkup(task) {
  const latest = task.recoveries?.at(-1);
  return latest ? detailLine(`Released from ${latest.from}`, latest.reason) : '';
}

function namedPageIds(ids) {
  return ids.map(id => state.project.pages.find(page => page.id === id)?.name || id);
}

function namedTaskIds(ids, tasks) {
  return ids.map(id => tasks.find(item => item.id === id)?.title || id);
}

function taskChecksMarkup(task) {
  const checks = (task.checks || []).map(check => `<li><code>${escapeHtml((check.command || []).join(' '))}</code></li>`).join('');
  return checks ? `<div class="task-checks"><strong>Completion checks</strong><ul>${checks}</ul></div>` : '';
}

function checkedPagesMarkup(task) {
  if (!state.project.pages.length) return '';
  return `<fieldset class="task-pages"><legend>Related pages <span class="field-optional">optional</span></legend>${state.project.pages.map(page => `<label><input type="checkbox" name="pageIds" value="${escapeHtml(page.id)}" ${task.pageIds.includes(page.id) ? 'checked' : ''}>${escapeHtml(page.name)}</label>`).join('')}</fieldset>`;
}

const blankTask = { id: '', title: '', outcome: '', checks: [], scope: [], look: '', pageIds: [], status: 'todo', blocker: '', handoff: '', owner: '' };

function statusOptions(task) {
  if (task.status === 'accepted') return ['accepted'];
  if (task.status === 'doing') return ['doing', 'todo', 'blocked'];
  return ['todo', 'blocked'];
}

function workStateMarkup(task) {
  return `<label for="task-status">Work state</label><select id="task-status" name="status">${statusOptions(task).map(status => `<option value="${status}" ${task.status === status ? 'selected' : ''}>${labels[status]}</option>`).join('')}</select><label for="task-blocker">Blocked by <span class="field-optional">if blocked</span></label><input id="task-blocker" name="blocker" value="${escapeHtml(task.blocker)}" placeholder="What needs to change?"><label for="task-handoff">Handoff <span class="field-optional">optional</span></label><textarea id="task-handoff" name="handoff" rows="2" placeholder="What should the next person know?">${escapeHtml(task.handoff)}</textarea>${ownerReleaseMarkup(task)}`;
}

function ownerReleaseMarkup(task) {
  if (!task.owner) return '';
  return `<label class="task-release"><input type="checkbox" name="releaseOwner"> Release ${escapeHtml(task.owner)} as owner</label>`;
}

function taskSubmitLabel(task) {
  return task ? 'Save task' : 'Add task';
}

function workStateForForm(task, data) {
  return task && task.status !== 'accepted' ? workStateMarkup(data) : '';
}

function taskFormMarkup(task) {
  if (!state.workflow.formOpen) return '';
  const data = { ...blankTask, ...task };
  const commands = data.checks.map(check => JSON.stringify(check.command)).join('\n');
  const action = task ? 'Edit' : 'Add';
  return `<form id="task-form" class="content-panel task-form" data-task-id="${escapeHtml(data.id)}"><h2>${action} task</h2><label for="task-title">Task</label><input id="task-title" name="title" required maxlength="140" value="${escapeHtml(data.title)}" placeholder="What needs to be done?"><label for="task-outcome">Done when</label><textarea id="task-outcome" name="outcome" required rows="2" placeholder="What result should be visible?">${escapeHtml(data.outcome)}</textarea><label for="task-checks">Checks</label><textarea id="task-checks" name="checks" required rows="3" spellcheck="false" placeholder='["npm","test"]'>${escapeHtml(commands)}</textarea><p class="field-hint">One command array per line, for example <code>["npm","test"]</code>. Each runs directly, without a shell.</p><label for="task-scope">Scope <span class="field-optional">optional</span></label><textarea id="task-scope" name="scope" rows="2" placeholder="One file or area per line">${escapeHtml(data.scope.join('\n'))}</textarea><label for="task-look">What should be visible <span class="field-optional">optional</span></label><textarea id="task-look" name="look" rows="2" placeholder="For example: no overflow at phone width">${escapeHtml(data.look)}</textarea>${checkedPagesMarkup(data)}${workStateForForm(task, data)}<p id="task-form-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="save-button" ${state.workflow.action ? 'disabled' : ''}>${taskSubmitLabel(task)}</button><button type="button" class="text-button" data-action="cancel-task-form">Cancel</button></div></form>`;
}

function loadingMarkup(workflow) {
  if (!workflow.error) return '<p class="muted" role="status">Loading tasks…</p>';
  return `<div class="form-error" role="alert">${escapeHtml(workflow.error)} <button type="button" class="text-button" data-action="retry-workflow">Try again</button></div>`;
}

function highlightedTask(label, task) {
  return task ? `<p class="plan-next"><span>${label}</span><strong>${escapeHtml(task.title)}</strong></p>` : '';
}

function nextHighlight(next, current) {
  if (!next) return '';
  if (next.id === current?.id) return '';
  return highlightedTask('Next task', next);
}

function noReadyTaskMarkup(tasks) {
  if (!tasks.length) return '';
  if (tasks.every(task => task.status === 'accepted')) return '<p class="plan-next">All tasks accepted.</p>';
  return '<p class="plan-next">No task is ready. Review blockers and ownership below.</p>';
}

function highlightsMarkup(tasks, current, next) {
  const lines = highlightedTask('Current work', current) + nextHighlight(next, current);
  return lines || noReadyTaskMarkup(tasks);
}

function blockedTasksMarkup(blocked) {
  if (!blocked.length) return '';
  const rows = blocked.map(task => `<li>${escapeHtml(task.title)}: ${escapeHtml(task.blocker || 'Reason not recorded')}</li>`).join('');
  return `<div class="plan-blockers"><strong>Blocked</strong><ul>${rows}</ul></div>`;
}

function planListMarkup(tasks, selected) {
  const add = state.workflow.formOpen ? '' : '<button type="button" class="text-button" data-action="add-task">Add task</button>';
  return `<section class="content-panel plan-list" aria-label="Tasks"><div class="panel-heading"><h2>Tasks</h2>${add}</div>${taskListMarkup(tasks, selected)}</section>`;
}

function planSummaryMarkup(tasks, blocked) {
  const accepted = tasks.filter(task => task.status === 'accepted').length;
  const blockedCount = blocked.length ? ` · ${blocked.length} blocked` : '';
  return `<p class="plan-summary">${accepted} of ${tasks.length} accepted${blockedCount}</p>`;
}

function planBodyMarkup() {
  const workflow = state.workflow;
  if (workflow.loading || !workflow.data) return loadingMarkup(workflow);
  const tasks = workflowTasks();
  const current = tasks.find(task => task.status === 'doing');
  const next = nextTask(tasks);
  const selected = selectedTask(tasks, current, next);
  const editing = tasks.find(task => task.id === workflow.editing);
  const blocked = tasks.filter(task => task.status === 'blocked');
  return `${planSummaryMarkup(tasks, blocked)}${highlightsMarkup(tasks, current, next)}${blockedTasksMarkup(blocked)}${workflowErrorMarkup(workflow)}${taskFormMarkup(editing)}<div class="plan-layout">${planListMarkup(tasks, selected)}${taskDetailMarkup(selected, tasks)}</div>`;
}

function selectedTask(tasks, current, next) {
  return tasks.find(task => task.id === state.workflow.selected) ?? current ?? next ?? tasks[0];
}

function workflowErrorMarkup(workflow) {
  return workflow.error ? `<p class="form-error" role="alert">${escapeHtml(workflow.error)}</p>` : '';
}

export function planMarkup() {
  return `<section class="overview-content plan-view" aria-label="Project plan"><header class="overview-heading"><div><h1>Plan</h1><p>Track the work and the checks that prove it is done.</p></div><button type="button" class="text-button" data-action="retry-workflow" ${state.workflow.loading || state.workflow.formOpen ? 'disabled' : ''}>Refresh tasks</button></header>${planBodyMarkup()}${planDocumentMarkup()}</section>`;
}

async function loadWorkflow(projectId) {
  try {
    const data = await readJson(`/api/projects/${encodeURIComponent(projectId)}/workflow`);
    if (state.workflow.key === projectId) Object.assign(state.workflow, { loading: false, data, error: '' });
  } catch (error) {
    if (state.workflow.key === projectId) Object.assign(state.workflow, { loading: false, error: error.message });
  }
  render();
}

export function syncWorkflowState() {
  if (state.view !== 'plan' || !state.project || state.workflow.key === state.project.id) return;
  state.workflow = { key: state.project.id, loading: true, data: null, error: '', action: '', formOpen: false, selected: '', editing: '', recovering: '' };
  void loadWorkflow(state.project.id);
}

export function retryWorkflow() {
  if (!state.project || state.workflow.loading) return;
  Object.assign(state.workflow, { loading: true, error: '' });
  render();
  void loadWorkflow(state.project.id);
}

export function openTaskForm(taskId = '') {
  Object.assign(state.workflow, { formOpen: true, editing: taskId, error: '' });
  render();
  document.querySelector('#task-title')?.focus();
}

export function cancelTaskForm() {
  Object.assign(state.workflow, { formOpen: false, editing: '', error: '' });
  render();
}

export function selectTask(id) {
  state.workflow.recovering = '';
  state.workflow.selected = id;
  render();
}

export function openTaskRecovery(id) {
  state.workflow.recovering = id;
  render();
  document.querySelector('#task-recovery-reason')?.focus();
}

export function cancelTaskRecovery() {
  state.workflow.recovering = '';
  render();
}

export async function recoverTask(form) {
  const reason = fieldText(new FormData(form), 'reason');
  const errorBox = form.querySelector('#task-recovery-error');
  if (reason.length < 12) {
    errorBox.textContent = 'Explain why this task needs to be released (at least 12 characters).';
    errorBox.hidden = false;
    return;
  }
  const id = form.dataset.taskId;
  state.workflow.action = `recover:${id}`;
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    await readJson(endpoint(`/tasks/${encodeURIComponent(id)}`), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ releaseOwner: true, recoveryReason: reason }) });
    state.workflow.recovering = '';
    await loadWorkflow(state.project.id);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  }
  state.workflow.action = '';
  form.querySelector('button[type="submit"]')?.removeAttribute('disabled');
  render();
}

function formError(form, message) {
  const box = form.querySelector('#task-form-error');
  box.textContent = message;
  box.hidden = false;
}

function fieldText(values, name) {
  return String(values.get(name) ?? '').trim();
}

function fieldLines(values, name) {
  return fieldText(values, name).split('\n').map(line => line.trim()).filter(Boolean);
}

function validCommand(command) {
  return Array.isArray(command) && command.length > 0 && command.every(arg => typeof arg === 'string' && arg.length > 0);
}

function parseCommand(line) {
  let command;
  try { command = JSON.parse(line); } catch { throw new Error('Write each check as a JSON array of words, such as ["npm","test"].'); }
  if (!validCommand(command)) throw new Error('Write each check as a JSON array of words, such as ["npm","test"].');
  return command;
}

function checkItem(command, index, existing) {
  return { id: existing?.checks?.[index]?.id ?? `check-${index + 1}`, command };
}

function buildTask(values, existing) {
  const title = fieldText(values, 'title');
  const outcome = fieldText(values, 'outcome');
  const lines = fieldLines(values, 'checks');
  if (!title || !outcome || !lines.length) throw new Error('Task, done when, and at least one check are required.');
  const checks = lines.map((line, index) => checkItem(parseCommand(line), index, existing));
  const task = { title, outcome, checks, scope: fieldLines(values, 'scope'), look: fieldText(values, 'look'), pageIds: values.getAll('pageIds') };
  if (editableWorkState(existing)) Object.assign(task, editedTaskFields(values));
  return task;
}

function editableWorkState(existing) {
  return existing && existing.status !== 'accepted';
}

function editedTaskFields(values) {
  const status = fieldText(values, 'status');
  const blocker = fieldText(values, 'blocker');
  if (status === 'blocked' && !blocker) throw new Error('Add a reason before blocking this task.');
  return { status, blocker, handoff: fieldText(values, 'handoff'), releaseOwner: values.has('releaseOwner') };
}

async function persistTask(task, existing) {
  const path = existing ? `/tasks/${encodeURIComponent(existing.id)}` : '/tasks';
  const method = existing ? 'PATCH' : 'POST';
  return readJson(endpoint(path), { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) });
}

export async function saveTask(form) {
  const existing = workflowTasks().find(task => task.id === form.dataset.taskId);
  let task;
  try { task = buildTask(new FormData(form), existing); }
  catch (error) { return formError(form, error.message); }
  state.workflow.action = 'save';
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    const saved = await persistTask(task, existing);
    Object.assign(state.workflow, { formOpen: false, editing: '', selected: saved.id, error: '' });
    await loadWorkflow(state.project.id);
  } catch (error) { formError(form, error.message); }
  state.workflow.action = '';
  form.querySelector('button[type="submit"]')?.removeAttribute('disabled');
  render();
}

export async function taskAction(action, id) {
  if (state.workflow.action) return;
  state.workflow.action = `${action}:${id}`;
  state.workflow.error = '';
  render();
  try {
    await readJson(endpoint(`/tasks/${encodeURIComponent(id)}/${action}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: 'person' }) });
    state.workflow.selected = id;
    await loadWorkflow(state.project.id);
  } catch (error) { state.workflow.error = error.message; }
  state.workflow.action = '';
  render();
}
