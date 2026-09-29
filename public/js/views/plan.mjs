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
  return tasks.find(task => task.id === (typeof next === 'string' ? next : next?.id))
    ?? tasks.find(task => task.status === 'todo')
    ?? null;
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
  const status = receipt.passed === true ? 'Passed' : receipt.passed === false ? 'Failed' : 'Recorded';
  const note = receipt.message || receipt.summary || receipt.error || '';
  return `<div class="task-receipt"><p><strong>Last check: ${escapeHtml(status)}</strong>${note ? ` · ${escapeHtml(note)}` : ''}</p><details><summary>Receipt details</summary><pre>${escapeHtml(JSON.stringify(receipt, null, 2))}</pre></details></div>`;
}

function taskActionsMarkup(task) {
  const busy = Boolean(state.workflow.action);
  const options = [];
  if (task.status === 'todo') options.push(['claim', 'Start work']);
  if (task.status === 'doing' || task.status === 'blocked') options.push(['verify', 'Run checks']);
  if (task.status !== 'accepted' && task.receipt?.passed === true) options.push(['accept', 'Accept task']);
  const actions = options.map(([action, label]) => `<button type="button" class="${action === 'accept' ? 'save-button' : 'text-button'}" data-action="task-${action}" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>${state.workflow.action === `${action}:${task.id}` ? 'Saving…' : label}</button>`).join('');
  return `<div class="form-actions">${actions}<button type="button" class="text-button" data-action="edit-task" data-task-id="${escapeHtml(task.id)}" ${busy ? 'disabled' : ''}>Edit</button></div>`;
}

function taskDetailMarkup(task, tasks) {
  if (!task) return '';
  const relatedPages = (task.pageIds || []).map(id => state.project.pages.find(page => page.id === id)?.name || id);
  const dependencies = (task.dependencies || []).map(id => tasks.find(item => item.id === id)?.title || id);
  const checks = (task.checks || []).map(check => `<li><code>${escapeHtml((check.command || []).join(' '))}</code></li>`).join('');
  return `<section class="content-panel plan-detail" aria-label="Selected task" data-selected-task="${escapeHtml(task.id)}"><div class="plan-detail-head">${taskTitle(task)}</div><p class="task-outcome">${escapeHtml(task.outcome)}</p>${detailLine('Owner', task.owner)}${detailLine('Blocked by', task.blocker)}${detailLine('Handoff', task.handoff)}${detailLine('Pages', relatedPages.join(', '))}${detailLine('Depends on', dependencies.join(', '))}${detailLine('Scope', (task.scope || []).join(', '))}${detailLine('Look for', task.look)}${checks ? `<div class="task-checks"><strong>Completion checks</strong><ul>${checks}</ul></div>` : ''}${receiptMarkup(task.receipt)}${taskActionsMarkup(task)}</section>`;
}

function checkedPagesMarkup(task) {
  if (!state.project.pages.length) return '';
  return `<fieldset class="task-pages"><legend>Related pages <span class="field-optional">optional</span></legend>${state.project.pages.map(page => `<label><input type="checkbox" name="pageIds" value="${escapeHtml(page.id)}" ${(task?.pageIds || []).includes(page.id) ? 'checked' : ''}>${escapeHtml(page.name)}</label>`).join('')}</fieldset>`;
}

function taskFormMarkup(task) {
  if (!state.workflow.formOpen) return '';
  const commands = (task?.checks || []).map(check => JSON.stringify(check.command)).join('\n');
  return `<form id="task-form" class="content-panel task-form" data-task-id="${escapeHtml(task?.id || '')}"><h2>${task ? 'Edit task' : 'Add task'}</h2><label for="task-title">Task</label><input id="task-title" name="title" required maxlength="140" value="${escapeHtml(task?.title || '')}" placeholder="What needs to be done?"><label for="task-outcome">Done when</label><textarea id="task-outcome" name="outcome" required rows="2" placeholder="What result should be visible?">${escapeHtml(task?.outcome || '')}</textarea><label for="task-checks">Checks</label><textarea id="task-checks" name="checks" required rows="3" spellcheck="false" placeholder='["npm","test"]'>${escapeHtml(commands)}</textarea><p class="field-hint">One command array per line, for example <code>["npm","test"]</code>. Each runs directly, without a shell.</p><label for="task-scope">Scope <span class="field-optional">optional</span></label><textarea id="task-scope" name="scope" rows="2" placeholder="One file or area per line">${escapeHtml((task?.scope || []).join('\n'))}</textarea><label for="task-look">What should be visible <span class="field-optional">optional</span></label><textarea id="task-look" name="look" rows="2" placeholder="For example: no overflow at phone width">${escapeHtml(task?.look || '')}</textarea>${checkedPagesMarkup(task)}<p id="task-form-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="save-button" ${state.workflow.action ? 'disabled' : ''}>${task ? 'Save task' : 'Add task'}</button><button type="button" class="text-button" data-action="cancel-task-form">Cancel</button></div></form>`;
}

function planBodyMarkup() {
  const workflow = state.workflow;
  if (workflow.loading || !workflow.data) return workflow.error ? `<div class="form-error" role="alert">${escapeHtml(workflow.error)} <button type="button" class="text-button" data-action="retry-workflow">Try again</button></div>` : '<p class="muted" role="status">Loading tasks…</p>';
  const tasks = workflowTasks();
  const current = tasks.find(task => task.status === 'doing');
  const next = nextTask(tasks);
  const selected = tasks.find(task => task.id === workflow.selected) ?? current ?? next ?? tasks[0];
  const editing = tasks.find(task => task.id === workflow.editing);
  const accepted = tasks.filter(task => task.status === 'accepted').length;
  const blocked = tasks.filter(task => task.status === 'blocked');
  const highlights = [current && `<p class="plan-next"><span>Current work</span><strong>${escapeHtml(current.title)}</strong></p>`, next && next.id !== current?.id && `<p class="plan-next"><span>Next task</span><strong>${escapeHtml(next.title)}</strong></p>`].filter(Boolean).join('');
  const blockers = blocked.length ? `<div class="plan-blockers"><strong>Blocked</strong><ul>${blocked.map(task => `<li>${escapeHtml(task.title)}: ${escapeHtml(task.blocker || 'Reason not recorded')}</li>`).join('')}</ul></div>` : '';
  return `<p class="plan-summary">${accepted} of ${tasks.length} accepted${blocked.length ? ` · ${blocked.length} blocked` : ''}</p>${highlights || (tasks.length && accepted === tasks.length ? '<p class="plan-next">All tasks accepted.</p>' : '')}${blockers}${workflow.error ? `<p class="form-error" role="alert">${escapeHtml(workflow.error)}</p>` : ''}${taskFormMarkup(editing)}<div class="plan-layout"><section class="content-panel plan-list" aria-label="Tasks"><div class="panel-heading"><h2>Tasks</h2>${workflow.formOpen ? '' : '<button type="button" class="text-button" data-action="add-task">Add task</button>'}</div>${taskListMarkup(tasks, selected)}</section>${taskDetailMarkup(selected, tasks)}</div>`;
}

export function planMarkup() {
  return `<section class="overview-content plan-view" aria-label="Project plan"><header class="overview-heading"><div><h1>Plan</h1><p>Track the work and the checks that prove it is done.</p></div></header>${planBodyMarkup()}${planDocumentMarkup()}</section>`;
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
  state.workflow = { key: state.project.id, loading: true, data: null, error: '', action: '', formOpen: false, selected: '', editing: '' };
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
  state.workflow.selected = id;
  render();
}

function formError(form, message) {
  const box = form.querySelector('#task-form-error');
  box.textContent = message;
  box.hidden = false;
}

export async function saveTask(form) {
  const values = new FormData(form);
  const title = String(values.get('title') || '').trim();
  const outcome = String(values.get('outcome') || '').trim();
  const lines = String(values.get('checks') || '').split('\n').map(line => line.trim()).filter(Boolean);
  if (!title || !outcome || !lines.length) return formError(form, 'Task, done when, and at least one check are required.');
  let commands;
  try {
    commands = lines.map(line => JSON.parse(line));
    if (commands.some(command => !Array.isArray(command) || !command.length || command.some(arg => typeof arg !== 'string' || !arg))) throw new Error();
  } catch { return formError(form, 'Write each check as a JSON array of words, such as ["npm","test"].'); }
  const existing = workflowTasks().find(task => task.id === form.dataset.taskId);
  const task = { title, outcome, checks: commands.map((command, index) => ({ id: existing?.checks?.[index]?.id || `check-${index + 1}`, command })), scope: String(values.get('scope') || '').split('\n').map(line => line.trim()).filter(Boolean), look: String(values.get('look') || '').trim(), pageIds: values.getAll('pageIds') };
  const path = existing ? `/tasks/${encodeURIComponent(existing.id)}` : '/tasks';
  state.workflow.action = 'save';
  form.querySelector('button[type="submit"]').disabled = true;
  try {
    const saved = await readJson(endpoint(path), { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) });
    const id = saved?.id || saved?.task?.id || existing?.id;
    Object.assign(state.workflow, { formOpen: false, editing: '', selected: id || state.workflow.selected, error: '' });
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
