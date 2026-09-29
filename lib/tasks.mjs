import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { projectDocs } from './project-docs.mjs';
import { idPattern } from './schema.mjs';
import { projectView, readProject, validationError } from './store.mjs';
import { checkoutRevision } from './revision.mjs';

const version = 1;
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const definitionKeys = ['title', 'outcome', 'scope', 'dependencies', 'pageIds', 'priority', 'checks', 'look'];
const evidenceKeys = definitionKeys.filter(key => !['title', 'priority'].includes(key));
const mutableKeys = new Set([...definitionKeys, 'status', 'blocker', 'handoff', 'releaseOwner', 'recoveryReason']);
const statuses = new Set(['todo', 'doing', 'blocked', 'accepted']);
const maxOutput = 64_000;

function error(message, status = 400) {
  return Object.assign(validationError(message), { status });
}

function id(value, label) {
  if (typeof value !== 'string' || !idPattern.test(value) || value.length > 80) throw error(`${label} must use lowercase letters, numbers or dashes.`);
  return value;
}

function validWords(value, max, min) {
  return typeof value === 'string' && value.trim().length >= min && value.length <= max;
}

function words(value, label, max = 2000, min = 1) {
  if (!validWords(value, max, min)) throw error(`${label} must be ${min}–${max} characters.`);
  return value.trim();
}

function actorName(actor) { return words(actor, 'Actor', 120); }

function shortString(item) { return validWords(item, 500, 1); }
function validList(value, limit) { return Array.isArray(value) && value.length <= limit && value.every(shortString); }
function assertUnique(items, label) { if (new Set(items).size !== items.length) throw error(`${label} has duplicates.`); }

function list(value, label, limit = 60, unique = true) {
  if (!validList(value, limit)) throw error(`${label} must be a list of short strings.`);
  const items = value.map(item => item.trim());
  if (unique) assertUnique(items, label);
  return items;
}

function checks(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw error('A task needs 1–20 checks.');
  const result = value.map(check => {
    if (!check || Object.keys(check).some(key => !['id', 'command', 'timeoutSeconds'].includes(key))) throw error('A check only accepts id, command and timeoutSeconds.');
    const checkId = id(check.id, 'Check ID');
    const command = list(check.command, 'Check command', 30, false);
    if (!command.length || command.some(arg => arg.length > 1000)) throw error('Check command needs an argv list.');
    return { id: checkId, command, ...checkTimeout(check.timeoutSeconds) };
  });
  if (new Set(result.map(check => check.id)).size !== result.length) throw error('Check IDs must be unique.');
  return result;
}

function checkTimeout(value) {
  if (value === undefined) return {};
  if (!Number.isInteger(value) || value < 1 || value > 1800) throw error('Check timeoutSeconds must be 1–1800.');
  return { timeoutSeconds: value };
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

function clearStaleLock(path) {
  if (Date.now() - statSync(path, { throwIfNoEntry: false })?.mtimeMs > 30_000) rmSync(path, { force: true });
}

function tryLock(path, attempt) {
  try { closeSync(openSync(path, 'wx')); return true; }
  catch (cause) {
    if (cause.code !== 'EEXIST') throw cause;
    clearStaleLock(path);
    if (attempt >= 250) throw error('Workflow is busy; try again.', 503);
    return false;
  }
}

function lock(file, action) {
  mkdirSync(join(dataDir, 'workflows'), { recursive: true });
  const path = `${file}.lock`;
  for (let attempt = 0; !tryLock(path, attempt); attempt += 1) pause(20);
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

function pick(input, current, key, fallback) { return input[key] ?? current[key] ?? fallback; }

function priority(value) {
  if (!Number.isInteger(value) || value < 0 || value > 3) throw error('Priority must be 0–3.');
  return value;
}

function definition(input, current, project) {
  const task = { ...current };
  task.title = words(pick(input, current, 'title'), 'Title', 160);
  task.outcome = words(pick(input, current, 'outcome'), 'Outcome');
  task.scope = list(pick(input, current, 'scope', []), 'Scope');
  task.dependencies = list(pick(input, current, 'dependencies', []), 'Dependencies').map(value => id(value, 'Dependency ID'));
  task.pageIds = list(pick(input, current, 'pageIds', []), 'Page IDs').map(value => id(value, 'Page ID'));
  task.priority = priority(pick(input, current, 'priority', 2));
  task.checks = checks(pick(input, current, 'checks'));
  task.look = words(pick(input, current, 'look', ''), 'Visible acceptance', 1000, Number(task.pageIds.length > 0));
  knownPages(project, task.pageIds);
  return task;
}

function signature(task) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(evidenceKeys.map(key => [key, task[key]])))).digest('hex');
}

function dependenciesAccepted(document, task) {
  return task.dependencies.every(dependency => taskById(document, dependency).status === 'accepted');
}

function invalidateDependents(document, changedId, actor) {
  const dependents = document.tasks.filter(task => task.dependencies.includes(changedId));
  for (const task of dependents) {
    task.receipt = null;
    if (task.status === 'accepted') reopen(task, actor, `Dependency ${changedId} changed.`);
    invalidateDependents(document, task.id, actor);
  }
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
    const task = { ...definition(input, { id: taskId }, readProject(projectId)), id: taskId, status: 'todo', owner: null, blocker: '', handoff: '', handoffAt: null, receipt: null, recoveries: [], reopens: [] };
    document.tasks.push(task);
    validDependencies(document, task);
    return task;
  });
}

function claimable(task) { return task.status === 'todo' && !task.owner; }

export function claimTask(projectId, taskId, actor) {
  actor = actorName(actor);
  return mutate(projectId, document => {
    const task = taskById(document, taskId);
    if (task.owner === actor && task.status === 'doing') return task;
    if (!claimable(task)) throw error('Task is already claimed or unavailable.', 409);
    if (!dependenciesAccepted(document, task)) throw error('Task dependencies are not accepted.', 409);
    task.owner = actor;
    task.status = 'doing';
    return task;
  });
}

function reopen(task, actor, reason) {
  task.reopens ??= [];
  task.reopens.push({ at: new Date().toISOString(), by: actor, reason });
  task.status = 'todo';
  task.owner = null;
}

function replaceDefinition(document, task, input, projectId, actor) {
  if (!definitionKeys.some(key => Object.hasOwn(input, key))) return;
  const before = signature(task);
  Object.assign(task, definition(input, task, readProject(projectId)));
  validDependencies(document, task);
  if (signature(task) === before) return;
  task.receipt = null;
  if (task.status === 'accepted') reopen(task, actor, 'Acceptance definition changed.');
  invalidateDependents(document, task.id, actor);
}

function mayWork(document, task, actor) { return task.owner === actor && dependenciesAccepted(document, task); }
function invalidWorkState(status, document, task, actor) { return status === 'doing' && !mayWork(document, task, actor); }
function settleTodo(task) { if (task.status === 'todo') { task.owner = null; task.blocker = ''; } }

function applyStatus(document, task, input, actor) {
  if (input.status === undefined) return;
  if (!['todo', 'doing', 'blocked'].includes(input.status)) throw error('Status must be todo, doing or blocked.');
  if (invalidWorkState(input.status, document, task, actor)) throw error('Claim the task and finish dependencies before work.', 409);
  task.status = input.status;
  if (task.status !== 'doing') task.receipt = null;
  settleTodo(task);
}

function release(task, value) {
  if (value === undefined || value === false) return;
  if (value !== true) throw error('releaseOwner must be a boolean.');
  task.owner = null;
  if (task.status === 'doing') { task.status = 'todo'; task.receipt = null; }
}

function updateBlocker(task, value) {
  if (value !== undefined) task.blocker = words(value, 'Blocker', 1000, Number(task.status === 'blocked'));
  if (task.status === 'blocked' && !task.blocker) throw error('Blocked task needs a blocker.');
}

function applyHandoff(document, task, input) {
  updateBlocker(task, input.blocker);
  if (input.handoff !== undefined) updateHandoff(document, task, input.handoff);
  release(task, input.releaseOwner);
}

function updateHandoff(document, task, value) {
  const handoff = words(value, 'Handoff', 2000, 0);
  if (handoff === task.handoff) return;
  const newest = Math.max(0, ...document.tasks.map(item => handoffTime(item)));
  task.handoff = handoff;
  task.handoffAt = new Date(Math.max(Date.now(), newest + 1)).toISOString();
}

function recoverTask(task, input, actor) {
  if (input.releaseOwner !== true || Object.keys(input).some(key => !['releaseOwner', 'recoveryReason'].includes(key))) throw error('Another owner can only be released with a recovery reason.', 409);
  const reason = words(input.recoveryReason, 'Recovery reason', 1000, 12);
  task.recoveries ??= [];
  task.recoveries.push({ at: new Date().toISOString(), by: actor, from: task.owner, status: task.status, reason });
  task.owner = null;
  task.receipt = null;
  if (task.status === 'doing') task.status = 'todo';
  return task;
}

function updateOwnedTask(document, task, input, actor, projectId) {
  if (input.recoveryReason !== undefined) throw error('recoveryReason requires a different owner.', 400);
  if (task.status === 'accepted' && Object.keys(input).some(key => !definitionKeys.includes(key))) throw error('Accepted tasks only allow definition edits.', 409);
  replaceDefinition(document, task, input, projectId, actor);
  applyStatus(document, task, input, actor);
  applyHandoff(document, task, input);
  return task;
}

function updateStoredTask(document, taskId, input, actor, projectId) {
  const task = taskById(document, taskId);
  if (task.owner && task.owner !== actor) return recoverTask(task, input, actor);
  return updateOwnedTask(document, task, input, actor, projectId);
}

export function updateTask(projectId, taskId, input, actor) {
  actor = actorName(actor);
  if (!input || !Object.keys(input).length || Object.keys(input).some(key => !mutableKeys.has(key))) throw error('Unknown or empty task update.');
  return mutate(projectId, document => updateStoredTask(document, taskId, input, actor, projectId));
}

function tail(previous, chunk) {
  const recent = chunk.subarray(Math.max(0, chunk.length - maxOutput));
  const combined = Buffer.concat([previous, recent]);
  return combined.subarray(Math.max(0, combined.length - maxOutput));
}

function killGroup(child) {
  try { process.kill(-child.pid, 'SIGKILL'); }
  catch { child.kill('SIGKILL'); }
}

function checkFailure(spawnError, timedOut, signal, exitCode, timeoutSeconds) {
  if (spawnError) return `Could not start check: ${startErrorCode(spawnError)}.`;
  if (timedOut) return `Timed out after ${timeoutSeconds} seconds.`;
  if (signal) return `Terminated by ${signal}.`;
  if (exitCode !== 0) return `Exited with code ${exitCode}.`;
  return null;
}

function startErrorCode(cause) { return cause.code ?? 'unknown error'; }

async function runCheck(check, cwd) {
  const timeoutSeconds = check.timeoutSeconds ?? 300;
  const child = spawn(check.command[0], check.command.slice(1), { cwd, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let spawnError = null;
  let timedOut = false;
  child.stdout.on('data', chunk => { stdout = tail(stdout, chunk); });
  child.stderr.on('data', chunk => { stderr = tail(stderr, chunk); });
  child.once('error', cause => { spawnError = cause; });
  const timer = setTimeout(() => { timedOut = true; killGroup(child); }, timeoutSeconds * 1000);
  const { exitCode, signal } = await new Promise(resolve => child.once('close', (code, signal) => resolve({ exitCode: code, signal })));
  clearTimeout(timer);
  return { id: check.id, command: check.command, timeoutSeconds, exitCode, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), timedOut, errorReason: checkFailure(spawnError, timedOut, signal, exitCode, timeoutSeconds) };
}

async function runChecks(task, directory) {
  const results = [];
  for (const check of task.checks) results.push(await runCheck(check, directory));
  return results;
}

function unchangedSource(projectId, project, before) {
  const after = currentRevision(projectId);
  const currentCheckout = readProject(projectId).source?.checkout;
  return JSON.stringify(before) === JSON.stringify(after) && currentCheckout === project.source?.checkout;
}

function verificationReceipt(taskHash, before, results, sameSource) {
  return { passed: sameSource && results.every(result => result.exitCode === 0), checks: results, revision: before.revision, fingerprint: before.fingerprint, dirty: before.dirty, taskHash, verifiedAt: new Date().toISOString(), sourceChanged: !sameSource };
}

function saveReceipt(projectId, taskId, actor, taskHash, receipt) {
  return mutate(projectId, document => {
    const current = taskById(document, taskId);
    if (current.owner !== actor || current.status !== 'doing' || signature(current) !== taskHash) throw error('Task changed during verification; rerun checks.', 409);
    current.receipt = receipt;
    return receipt;
  });
}

export async function verifyTask(projectId, taskId, actor) {
  actor = actorName(actor);
  const project = readProject(projectId);
  const task = taskById(read(fileFor(projectId), projectId), taskId);
  if (task.owner !== actor || task.status !== 'doing') throw error('Claim the task before verifying.', 409);
  if (!task.checks.length) throw error('Task needs checks.');
  const before = currentRevision(projectId);
  const taskHash = signature(task);
  const results = await runChecks(task, checkout(project));
  const receipt = verificationReceipt(taskHash, before, results, unchangedSource(projectId, project, before));
  return saveReceipt(projectId, taskId, actor, taskHash, receipt);
}

function assertClaimed(task, actor) {
  if (task.owner !== actor || task.status !== 'doing') throw error('Claim the task before accepting.', 409);
}

function assertDependencies(document, task) {
  if (!dependenciesAccepted(document, task)) throw error('Task dependencies are not accepted.', 409);
}

function assertReceipt(task) {
  if (!task.receipt?.passed || task.receipt.taskHash !== signature(task)) throw error('Task needs a current passing check receipt.', 409);
}

function assertCheckout(projectId, receipt) {
  const revision = currentRevision(projectId);
  if (receipt.revision !== revision.revision || receipt.fingerprint !== revision.fingerprint || receipt.dirty !== revision.dirty) throw error('Checkout changed since verification; rerun checks.', 409);
}

function assertPages(projectId, task) {
  const pages = projectView(readProject(projectId)).pages;
  const unaccepted = task.pageIds.filter(pageId => !pages.find(page => page.id === pageId)?.progress?.accepted);
  if (unaccepted.length) throw error(`Pages are not accepted: ${unaccepted.join(', ')}.`, 409);
}

export function acceptTask(projectId, taskId, actor) {
  actor = actorName(actor);
  return mutate(projectId, document => {
    const task = taskById(document, taskId);
    assertClaimed(task, actor);
    assertDependencies(document, task);
    assertReceipt(task);
    assertCheckout(projectId, task.receipt);
    assertPages(projectId, task);
    task.status = 'accepted';
    task.owner = null;
    task.blocker = '';
    return task;
  });
}

function safeRevision(project) {
  if (!project.source?.checkout) return null;
  const directory = resolve(root, project.source.checkout);
  if (!existsSync(directory)) return null;
  const revision = checkoutRevision(directory);
  return revision.fingerprint ? revision : null;
}

function revisionMatches(receipt, revision) {
  return receipt.revision === revision.revision && receipt.fingerprint === revision.fingerprint && receipt.dirty === revision.dirty;
}

function receiptCurrent(task, revision) {
  if (!task.receipt || !revision) return false;
  return task.receipt.taskHash === signature(task) && revisionMatches(task.receipt, revision);
}

function lastEntry(list) { return list?.at(-1) ?? null; }
function briefReceipt(task, revision) { return task.receipt ? { passed: task.receipt.passed, verifiedAt: task.receipt.verifiedAt, current: receiptCurrent(task, revision) } : null; }

function compactTask(task, revision) {
  if (!task) return null;
  return { id: task.id, title: task.title, outcome: task.outcome, scope: task.scope, status: task.status, owner: task.owner, priority: task.priority, dependencies: task.dependencies, pageIds: task.pageIds, checks: task.checks, look: task.look, blocker: task.blocker, handoff: task.handoff, handoffAt: task.handoffAt ?? null, receipt: briefReceipt(task, revision), recovery: lastEntry(task.recoveries), reopen: lastEntry(task.reopens) };
}

function sourceField(project, key) { return project.source?.[key] ?? null; }

function sourceDetails(project) {
  return { url: sourceField(project, 'url'), environment: sourceField(project, 'environment'), checkout: sourceField(project, 'checkout') };
}

function docRefs(docs) {
  return Object.fromEntries(['vision', 'design', 'plan'].map(key => [key, docs[key]?.file ?? null]));
}

function resumeSteps(projectId) {
  return {
    inspect: `dogfood context --project ${projectId} --json`,
    claim: `dogfood task claim TASK --project ${projectId} --agent NAME`,
    verify: `dogfood verify TASK --project ${projectId} --agent NAME`,
    accept: `dogfood task accept TASK --project ${projectId} --agent NAME`,
    update: `dogfood task update TASK --project ${projectId} --input changes.json --agent NAME`,
    acceptWhen: 'Checks pass on the current checkout, dependencies are accepted, and every named page is accepted by QA.',
  };
}

function latestHandoff(tasks, shown) {
  const task = [...tasks].reverse().filter(item => item.handoff).toSorted((a, b) => handoffTime(b) - handoffTime(a))[0];
  return task && !shown.has(task.id) ? task.handoff : null;
}

function handoffTime(task) { return Date.parse(task.handoffAt) || 0; }

export function context(projectId) {
  const project = readProject(projectId);
  const { tasks, next, summary } = workflow(projectId);
  const claimed = tasks.filter(task => task.status === 'doing');
  const blocked = tasks.filter(task => task.status === 'blocked');
  const shown = new Set([next, ...claimed, ...blocked].filter(Boolean).map(task => task.id));
  const revision = safeRevision(project);
  const compact = task => compactTask(task, revision);
  return { project: { id: project.id, name: project.name, checkout: sourceField(project, 'checkout'), checkoutFingerprint: revision?.fingerprint ?? null, source: sourceDetails(project) }, docs: docRefs(projectDocs(project)), summary, next: compact(next), claimed: claimed.map(compact), blocked: blocked.map(compact), latestHandoff: latestHandoff(tasks, shown), steps: resumeSteps(projectId) };
}
