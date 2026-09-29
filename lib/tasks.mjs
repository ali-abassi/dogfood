import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { dataDir, root } from './paths.mjs';
import { projectDocs } from './project-docs.mjs';
import { idPattern } from './schema.mjs';
import { projectView, readProject, validationError } from './store.mjs';
import { checkoutRevision } from './revision.mjs';

const exec = promisify(execFile);
const version = 1;
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const definitionKeys = ['title', 'outcome', 'scope', 'dependencies', 'pageIds', 'priority', 'checks', 'look'];
const mutableKeys = new Set([...definitionKeys, 'status', 'blocker', 'handoff', 'releaseOwner']);
const statuses = new Set(['todo', 'doing', 'blocked', 'accepted']);
const maxOutput = 64_000;

function error(message, status = 400) {
  return Object.assign(validationError(message), { status });
}

function id(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value) || value.length > 80) throw error(`${label} must use lowercase letters, numbers or dashes.`);
  return value;
}

function words(value, label, max = 2000, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max) throw error(`${label} must be ${min}–${max} characters.`);
  return value.trim();
}

function actorName(actor) { return words(actor, 'Actor', 120); }

function list(value, label, limit = 60, unique = true) {
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw error(`${label} must be a list of short strings.`);
  const items = value.map(item => item.trim());
  if (unique && new Set(items).size !== items.length) throw error(`${label} has duplicates.`);
  return items;
}

function checks(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw error('A task needs 1–20 checks.');
  const result = value.map(check => {
    if (!check || Object.keys(check).some(key => !['id', 'command'].includes(key))) throw error('A check only accepts id and command.');
    const checkId = id(check.id, 'Check ID');
    const command = list(check.command, 'Check command', 30, false);
    if (!command.length || command.some(arg => arg.length > 1000)) throw error('Check command needs an argv list.');
    return { id: checkId, command };
  });
  if (new Set(result.map(check => check.id)).size !== result.length) throw error('Check IDs must be unique.');
  return result;
}

function fileFor(projectId) {
  return join(dataDir, 'workflows', `${id(projectId, 'Project ID')}.json`);
}

function read(file, projectId) {
  if (!existsSync(file)) return { version, projectId, tasks: [] };
  const document = JSON.parse(readFileSync(file, 'utf8'));
  if (document.version !== version || document.projectId !== projectId || !Array.isArray(document.tasks)) throw error('Unsupported workflow format.');
  return document;
}

function lock(file, action) {
  mkdirSync(join(dataDir, 'workflows'), { recursive: true });
  const path = `${file}.lock`;
  for (let attempt = 0; ; attempt += 1) {
    try { closeSync(openSync(path, 'wx')); break; }
    catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
      if (Date.now() - statSync(path, { throwIfNoEntry: false })?.mtimeMs > 30_000) rmSync(path, { force: true });
      if (attempt >= 250) throw error('Workflow is busy; try again.', 503);
      pause(20);
    }
  }
  try { return action(); }
  finally { rmSync(path, { force: true }); }
}

function mutate(projectId, action) {
  readProject(projectId);
  const file = fileFor(projectId);
  return lock(file, () => {
    const document = read(file, projectId);
    const result = action(document);
    if (result === undefined) return document;
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`);
    renameSync(temporary, file);
    return result;
  });
}

function taskById(document, taskId) {
  const task = document.tasks.find(item => item.id === taskId);
  if (!task) throw error(`Task ${taskId} does not exist.`, 404);
  return task;
}

function nextTaskId(document) {
  let number = 1;
  while (document.tasks.some(task => task.id === `task-${number}`)) number += 1;
  return `task-${number}`;
}

function knownPages(project, pageIds) {
  const known = new Set(project.pages.map(page => page.id));
  for (const pageId of pageIds) if (!known.has(pageId)) throw error(`Page ${pageId} does not exist in ${project.id}.`);
}

function validDependencies(document, task) {
  const known = new Set(document.tasks.map(item => item.id));
  for (const dependency of task.dependencies) {
    if (!known.has(dependency)) throw error(`Dependency ${dependency} does not exist.`);
    if (dependency === task.id) throw error('A task cannot depend on itself.');
  }
  const byId = new Map(document.tasks.map(item => [item.id, item]));
  const visits = new Set();
  function visit(current) {
    if (visits.has(current)) throw error('Task dependencies contain a cycle.');
    visits.add(current);
    for (const dependency of byId.get(current)?.dependencies ?? []) visit(dependency);
    visits.delete(current);
  }
  for (const item of document.tasks) visit(item.id);
}

function definition(input, current, project) {
  const task = { ...current };
  task.title = words(input.title ?? current.title, 'Title', 160);
  task.outcome = words(input.outcome ?? current.outcome, 'Outcome');
  task.scope = list(input.scope ?? current.scope ?? [], 'Scope');
  task.dependencies = list(input.dependencies ?? current.dependencies ?? [], 'Dependencies').map(value => id(value, 'Dependency ID'));
  task.pageIds = list(input.pageIds ?? current.pageIds ?? [], 'Page IDs').map(value => id(value, 'Page ID'));
  task.priority = input.priority ?? current.priority ?? 2;
  if (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 3) throw error('Priority must be 0–3.');
  task.checks = checks(input.checks ?? current.checks);
  task.look = words(input.look ?? current.look ?? '', 'Visible acceptance', 1000, task.pageIds.length ? 1 : 0);
  knownPages(project, task.pageIds);
  return task;
}

function signature(task) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(definitionKeys.map(key => [key, task[key]])))).digest('hex');
}

function dependenciesAccepted(document, task) {
  return task.dependencies.every(dependency => taskById(document, dependency).status === 'accepted');
}

function invalidateDependents(document, changedId) {
  const dependents = document.tasks.filter(task => task.dependencies.includes(changedId));
  for (const task of dependents) {
    task.receipt = null;
    if (task.status === 'accepted') task.status = 'todo';
    invalidateDependents(document, task.id);
  }
}

function ownedBy(task, actor) {
  if (task.owner && task.owner !== actor) throw error(`Task is owned by ${task.owner}.`, 409);
}

function checkout(project) {
  if (!project.source?.checkout) throw error('Project needs a local checkout for checks.');
  const path = resolve(root, project.source.checkout);
  if (!existsSync(path)) throw error('Project checkout does not exist.');
  return path;
}

function currentRevision(projectId) {
  const revision = checkoutRevision(checkout(readProject(projectId)));
  if (!revision.revision || !revision.fingerprint) throw error('Checkout revision is unavailable; checks require a Git checkout.', 409);
  return revision;
}

export function workflow(projectId) {
  readProject(projectId);
  const tasks = read(fileFor(projectId), projectId).tasks;
  const ready = tasks.filter(task => task.status === 'todo' && !task.owner && task.dependencies.every(dep => tasks.find(item => item.id === dep)?.status === 'accepted'));
  const next = ready.toSorted((a, b) => a.priority - b.priority || tasks.indexOf(a) - tasks.indexOf(b))[0] ?? null;
  const summary = Object.fromEntries([...statuses].map(status => [status, tasks.filter(task => task.status === status).length]));
  return { tasks, next, summary };
}

export function addTask(projectId, input, actor) {
  actorName(actor);
  if (!input || Object.keys(input).some(key => ![...definitionKeys, 'id'].includes(key))) throw error('Unknown task field.');
  return mutate(projectId, document => {
    const taskId = input.id === undefined ? nextTaskId(document) : id(input.id, 'Task ID');
    if (document.tasks.some(item => item.id === taskId)) throw error(`Task ${taskId} already exists.`, 409);
    const task = { ...definition(input, { id: taskId }, readProject(projectId)), id: taskId, status: 'todo', owner: null, blocker: '', handoff: '', receipt: null };
    document.tasks.push(task);
    validDependencies(document, task);
    return task;
  });
}

export function claimTask(projectId, taskId, actor) {
  actor = actorName(actor);
  return mutate(projectId, document => {
    const task = taskById(document, taskId);
    if (task.owner === actor && task.status === 'doing') return task;
    if (task.status !== 'todo' || task.owner) throw error('Task is already claimed or unavailable.', 409);
    if (!dependenciesAccepted(document, task)) throw error('Task dependencies are not accepted.', 409);
    task.owner = actor;
    task.status = 'doing';
    return task;
  });
}

function replaceDefinition(document, task, input, projectId) {
  if (!definitionKeys.some(key => Object.hasOwn(input, key))) return;
  const before = signature(task);
  Object.assign(task, definition(input, task, readProject(projectId)));
  validDependencies(document, task);
  if (signature(task) === before) return;
  task.receipt = null;
  if (task.status === 'accepted') task.status = 'todo';
  invalidateDependents(document, task.id);
}

function applyStatus(document, task, input, actor) {
  if (input.status === undefined) return;
  if (!['todo', 'doing', 'blocked'].includes(input.status)) throw error('Status must be todo, doing or blocked.');
  if (input.status === 'doing' && (task.owner !== actor || !dependenciesAccepted(document, task))) throw error('Claim the task and finish dependencies before work.', 409);
  task.status = input.status;
  if (task.status !== 'doing') task.receipt = null;
}

function applyHandoff(task, input) {
  if (input.blocker !== undefined) task.blocker = words(input.blocker, 'Blocker', 1000, task.status === 'blocked' ? 1 : 0);
  if (input.handoff !== undefined) task.handoff = words(input.handoff, 'Handoff', 2000, 0);
  if (task.status === 'blocked' && !task.blocker) throw error('Blocked task needs a blocker.');
  if (input.releaseOwner === true) { task.owner = null; if (task.status === 'doing') { task.status = 'todo'; task.receipt = null; } }
  else if (input.releaseOwner !== undefined && input.releaseOwner !== false) throw error('releaseOwner must be a boolean.');
}

export function updateTask(projectId, taskId, input, actor) {
  actor = actorName(actor);
  if (!input || !Object.keys(input).length || Object.keys(input).some(key => !mutableKeys.has(key))) throw error('Unknown or empty task update.');
  return mutate(projectId, document => {
    const task = taskById(document, taskId);
    ownedBy(task, actor);
    if (task.status === 'accepted' && Object.keys(input).some(key => !definitionKeys.includes(key))) throw error('Accepted tasks only allow definition edits.', 409);
    replaceDefinition(document, task, input, projectId);
    applyStatus(document, task, input, actor);
    applyHandoff(task, input);
    return task;
  });
}

async function runCheck(check, cwd) {
  try {
    const { stdout, stderr } = await exec(check.command[0], check.command.slice(1), { cwd, timeout: 30_000, maxBuffer: maxOutput, encoding: 'utf8', shell: false });
    return { id: check.id, command: check.command, exitCode: 0, stdout, stderr };
  } catch (cause) {
    return { id: check.id, command: check.command, exitCode: Number.isInteger(cause.code) ? cause.code : null, stdout: String(cause.stdout ?? '').slice(0, maxOutput), stderr: String(cause.stderr ?? cause.message).slice(0, maxOutput), timedOut: cause.killed === true };
  }
}

export async function verifyTask(projectId, taskId, actor) {
  actor = actorName(actor);
  const project = readProject(projectId);
  const task = taskById(read(fileFor(projectId), projectId), taskId);
  if (task.owner !== actor || task.status !== 'doing') throw error('Claim the task before verifying.', 409);
  if (!task.checks?.length) throw error('Task needs checks.');
  const before = currentRevision(projectId);
  const taskHash = signature(task);
  const results = [];
  for (const check of task.checks) results.push(await runCheck(check, checkout(project)));
  const after = currentRevision(projectId);
  const sameSource = JSON.stringify(before) === JSON.stringify(after) && readProject(projectId).source?.checkout === project.source?.checkout;
  const receipt = { passed: sameSource && results.every(result => result.exitCode === 0), checks: results, revision: before.revision, fingerprint: before.fingerprint, dirty: before.dirty, taskHash, verifiedAt: new Date().toISOString(), sourceChanged: !sameSource };
  return mutate(projectId, document => {
    const current = taskById(document, taskId);
    if (current.owner !== actor || current.status !== 'doing' || signature(current) !== taskHash) throw error('Task changed during verification; rerun checks.', 409);
    current.receipt = receipt;
    return receipt;
  });
}

export function acceptTask(projectId, taskId, actor) {
  actor = actorName(actor);
  return mutate(projectId, document => {
    const task = taskById(document, taskId);
    if (task.owner !== actor || task.status !== 'doing') throw error('Claim the task before accepting.', 409);
    if (!dependenciesAccepted(document, task)) throw error('Task dependencies are not accepted.', 409);
    if (!task.receipt?.passed || task.receipt.taskHash !== signature(task)) throw error('Task needs a current passing check receipt.', 409);
    const revision = currentRevision(projectId);
    if (task.receipt.revision !== revision.revision || task.receipt.fingerprint !== revision.fingerprint || task.receipt.dirty !== revision.dirty) throw error('Checkout changed since verification; rerun checks.', 409);
    const view = projectView(readProject(projectId));
    const unaccepted = task.pageIds.filter(pageId => !view.pages.find(page => page.id === pageId)?.progress?.accepted);
    if (unaccepted.length) throw error(`Pages are not accepted: ${unaccepted.join(', ')}.`, 409);
    task.status = 'accepted';
    task.owner = null;
    task.blocker = '';
    return task;
  });
}

export function context(projectId) {
  const project = readProject(projectId);
  const { tasks, next, summary } = workflow(projectId);
  const docs = projectDocs(project);
  const compact = task => task && ({ id: task.id, title: task.title, outcome: task.outcome, status: task.status, owner: task.owner, priority: task.priority, dependencies: task.dependencies, pageIds: task.pageIds, checks: task.checks, look: task.look, blocker: task.blocker, handoff: task.handoff, receipt: task.receipt && { passed: task.receipt.passed, verifiedAt: task.receipt.verifiedAt } });
  return { project: { id: project.id, name: project.name, checkout: project.source?.checkout ?? null }, docs: Object.fromEntries(['vision', 'design', 'plan'].map(key => [key, docs[key]?.file ?? null])), summary, next: compact(next), claimed: tasks.filter(task => task.status === 'doing').map(compact), blocked: tasks.filter(task => task.status === 'blocked').map(compact), latestHandoff: [...tasks].reverse().find(task => task.handoff)?.handoff ?? '' };
}
