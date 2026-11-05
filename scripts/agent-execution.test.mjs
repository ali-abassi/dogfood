import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-execution-'));
process.env.DOGFOOD_DATA = data;
process.env.DOGFOOD_BROWSER_SESSION = 'operator-preview';
process.env.DOGFOOD_BROWSER_PROFILE = 'Default';
const { initProject, projectFromCheckout } = await import('../lib/project-init.mjs');
const { createProject, registerPage, createFinding } = await import('../lib/store.mjs');
const { addTask, context, claimTask, verifyTask, acceptTask, updateTask } = await import('../lib/tasks.mjs');
const { saveProjectBrief } = await import('../lib/project-readiness.mjs');
const { agentOutcome } = await import('../lib/agent-results.mjs');
const { nativeContext } = await import('../lib/agent-context.mjs');
const { saveTurnContext, turnContextInstructions } = await import('../lib/agent-context-manifest.mjs');
const { inspectAgentChanges, applyReviewedChanges } = await import('../lib/agent-changes.mjs');
const { integrateAgentCard, saveAgentCardSource, releaseAgentCardIntegration, createAgentCard } = await import('../lib/agent-board.mjs');
after(() => rmSync(data, { recursive: true, force: true }));
let count = 0;
function git(directory, ...args) { return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function fixture() {
  const id = `project-${++count}`, source = join(data, id), checkout = join(data, `${id}-worktree`);
  mkdirSync(source); git(source, 'init', '-q');
  writeFileSync(join(source, 'app.txt'), 'before\n'); writeFileSync(join(source, '.gitignore'), 'cache.txt\n');
  git(source, 'add', '.'); git(source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Fixture');
  const baseRevision = git(source, 'rev-parse', 'HEAD').trim();
  git(source, 'worktree', 'add', '-b', `${id}-branch`, checkout);
  initProject({ id, name: 'Human readable project', checkout: source });
  return { id, source, card: { id: 'card-1', title: 'Change title', request: 'Follow the linked task.', checkout, baseRevision, status: 'review' } };
}
function boardFixture(value) {
  const directory = join(data, 'agent-board'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${value.id}.json`), JSON.stringify({ version: 1, projectId: value.id, cards: [{ ...value.card, backend: 'codex', comments: value.card.comments || [], pending: [] }] }));
}

test('native Git worktrees map to the existing project; explicit request mapping disambiguates repository aliases', () => {
  const value = fixture();
  assert.equal(projectFromCheckout(value.card.checkout), value.id);
  createProject({ id: `${value.id}-alias`, name: 'Other view', checkout: value.source });
  assert.equal(projectFromCheckout(value.card.checkout), null);
  boardFixture(value);
  assert.equal(projectFromCheckout(value.card.checkout), value.id);
  createProject({ id: `${value.id}-exact`, name: 'Exact worktree registration', checkout: value.card.checkout });
  assert.equal(projectFromCheckout(value.card.checkout), `${value.id}-exact`);
});

test('resume context includes waiting requests, while native context carries actual linked acceptance requirements', () => {
  const value = fixture();
  registerPage(value.id, { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'save', name: 'Save note', expected: 'Saved text survives reload.' }] });
  addTask(value.id, { id: 'title', title: 'Show the new title', outcome: 'The title reads Hello.', scope: ['app.txt'], checks: [{ id: 'read', command: ['node', '-e', 'require("fs").readFileSync("app.txt")'] }], look: 'Readable at1280 and390.', pageIds: ['home'] }, 'fixture');
  updateTask(value.id, 'title', { handoff: 'Preserve the existing navigation while changing the title.' }, 'fixture');
  Object.assign(value.card, { pageId: 'home', featureId: 'save', taskId: 'title' }); boardFixture(value);
  const resume = context(value.id);
  assert.equal(resume.requests.summary.review, 1); assert.equal(resume.nextAction.kind, 'review_request'); assert.equal(resume.next.id, 'title');
  const packet = nativeContext(value.id, value.card);
  assert.equal(packet.projectId, value.id); assert.match(packet.inspect, new RegExp(`--project ${value.id}`));
  assert.equal(packet.feature.expected, 'Saved text survives reload.'); assert.deepEqual(packet.task.scope, ['app.txt']);
  assert.deepEqual(packet.task.pageIds, ['home']); assert.match(packet.task.handoff, /Preserve the existing navigation/); assert.ok(packet.task.handoffAt);
  assert.equal(packet.task.outcome, 'The title reads Hello.'); assert.equal(packet.task.checks[0].command[0], 'node');
  assert.equal(packet.browser.session, 'operator-preview'); assert.equal(packet.browser.profile, 'Default');
});

test('structured result and legacy fallback retain evidence provenance and omit preparation chatter from summaries', () => {
  const result = agentOutcome('I will inspect the files.\n\nNow I will run checks.\n\nThe note now survives reload.\n\nDetails follow.');
  assert.equal(result.summary, 'The note now survives reload.'); assert.equal(result.provenance, 'agent-reported');
  const input = agentOutcome('**NEEDS_INPUT:** Which account should be used?');
  assert.equal(input.status, 'needs_input'); assert.equal(input.decision, 'Which account should be used?');
  const structured = agentOutcome('```dogfood-result\n'+JSON.stringify({ status: 'ready_for_review', summary: 'Saved notes persist.', checks: [{ command: 'npm test', result: 'Passed' }], previewUrl: 'javascript:alert(1)', unverified: ['Live provider'] })+'\n```');
  assert.equal(structured.structured, true); assert.equal(structured.previewUrl, null); assert.equal(structured.checks[0].provenance, 'agent-reported');
  assert.equal(agentOutcome('```dogfood-result\n{"status":"needs_input","summary":"Choose a role","decision":"Which role?"}\n```').status, 'needs_input');
});

test('review exposes real new-file content and patches, rejects stale snapshots and applies only exact reviewed changes', () => {
  const value = fixture();
  writeFileSync(join(value.card.checkout, 'app.txt'), 'after\n'); writeFileSync(join(value.card.checkout, 'new.txt'), 'new file without final newline');
  const review = inspectAgentChanges(value.id, value.card);
  assert.equal(review.integration.available, true); assert.match(review.files.find(file => file.path === 'app.txt').patch, /\+after/);
  assert.equal(review.files.find(file => file.path === 'new.txt').content, 'new file without final newline');
  writeFileSync(join(value.card.checkout, 'new.txt'), 'changed after review\n');
  assert.throws(() => applyReviewedChanges(value.id, value.card, review.fingerprint), /reviewed snapshot/);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'before\n');
  const fresh = inspectAgentChanges(value.id, value.card);
  const receipt = applyReviewedChanges(value.id, value.card, fresh.fingerprint);
  assert.equal(receipt.staged, true); assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'after\n');
  assert.equal(readFileSync(join(value.source, 'new.txt'), 'utf8'), 'changed after review\n');
  assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), value.card.baseRevision);
  assert.match(git(value.source, 'diff', '--cached', '--stat'), /new.txt/);
});

test('sensitive files, binaries and symlinks are withheld; dirty source and ignored destination collisions are never overwritten', () => {
  const value = fixture(), worktree = value.card.checkout;
  writeFileSync(join(worktree, 'app.txt'), 'after\n');
  writeFileSync(join(worktree, '.env'), 'fixture-only\n');
  writeFileSync(join(worktree, 'binary.bin'), Buffer.from([0, 1, 2]));
  symlinkSync(join(value.source, 'app.txt'), join(worktree, 'outside.txt'));
  let review = inspectAgentChanges(value.id, value.card);
  assert.equal(review.integration.available, false);
  for (const name of ['.env', 'binary.bin', 'outside.txt']) assert.equal(review.files.find(file => file.path === name).status, 'withheld');
  for (const name of ['.env', 'binary.bin', 'outside.txt']) rmSync(join(worktree, name));
  writeFileSync(join(value.source, 'app.txt'), 'other person work\n');
  review = inspectAgentChanges(value.id, value.card); assert.match(review.integration.reason, /local changes/);
  assert.throws(() => applyReviewedChanges(value.id, value.card, review.fingerprint), /local changes/);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'other person work\n');
  git(value.source, 'restore', 'app.txt');
  writeFileSync(join(worktree, '.gitignore'), ''); writeFileSync(join(worktree, 'cache.txt'), 'agent file\n'); writeFileSync(join(value.source, 'cache.txt'), 'owned ignored file\n');
  review = inspectAgentChanges(value.id, value.card);
  assert.throws(() => applyReviewedChanges(value.id, value.card, review.fingerprint), /destination already exists/);
  assert.equal(readFileSync(join(value.source, 'cache.txt'), 'utf8'), 'owned ignored file\n');
});

test('explicit card integration records its own receipt without accepting a planned task or closing the request', () => {
  const value = fixture();
  addTask(value.id, { id: 'change', title: 'Change app text', outcome: 'The text changes.', checks: [{ id: 'read', command: ['node', '-e', 'require("fs").readFileSync("app.txt")'] }] }, 'fixture');
  Object.assign(value.card, { taskId: 'change', seenTurn: 1 }); boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'reviewed change\n');
  const review = inspectAgentChanges(value.id, value.card);
  assert.throws(() => integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint, command: 'anything' }), /Unknown/);
  const integrated = integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint });
  assert.equal(integrated.status, 'review'); assert.equal(integrated.integration.turn, 1); assert.equal(integrated.integration.staged, true);
  assert.equal(context(value.id).next.status, 'todo'); assert.equal(context(value.id).next.receipt, null);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'reviewed change\n');
});

test('planned pages and features can link work before URL exists, while task acceptance still requires actual page QA', async () => {
  const value = fixture();
  saveProjectBrief(value.id, { pages: [{ id: 'planned', name: 'Planned page', route: '/', features: [{ id: 'save', name: 'Save', expected: 'Survives reload.' }] }] }, 'fixture');
  const task = addTask(value.id, { id: 'planned-work', title: 'Build the planned page', outcome: 'Page is present.', pageIds: ['planned'], look: 'Page visible at390.', checks: [{ id: 'read', command: ['node', '-e', 'require("fs").readFileSync("app.txt")'] }] }, 'fixture');
  const request = createAgentCard(value.id, { title: 'Build planned page', request: 'Follow planned scope.', backend: 'codex', pageId: 'planned', featureId: 'save', taskId: task.id });
  assert.equal(request.pageId, 'planned'); assert.equal(nativeContext(value.id, request).feature.expected, 'Survives reload.');
  assert.equal(nativeContext(value.id, request).feature.status, 'untested');
  claimTask(value.id, task.id, 'fixture'); assert.equal((await verifyTask(value.id, task.id, 'fixture')).passed, true);
  assert.throws(() => acceptTask(value.id, task.id, 'fixture'), /Register and check the planned pages/);
});

test('project next action exposes current QA findings when there is no task or request awaiting action', () => {
  const value = fixture();
  registerPage(value.id, { id: 'home', name: 'Home', route: '/', group: 'Public', features: [] });
  createFinding(value.id, 'home', { title: 'The primary action is obscured', detail: 'At390px the primary action is covered by the sticky footer.', severity: 'P2', attachCapture: false }, 'fixture');
  const result = context(value.id);
  assert.equal(result.next, null); assert.equal(result.nextAction.kind, 'review_page');
  assert.equal(result.nextAction.id, 'home'); assert.match(result.nextAction.title, /primary action/);
  assert.match(result.nextAction.url, /view=report&page=home/); assert.equal(result.qaSummary.openFindings, 1);
  assert.equal(result.qaSummary.total, 1); assert.equal(result.qaSummary.accepted, 0);
});

function integratedFixture() {
  const value = fixture(); boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'reviewed source\n');
  writeFileSync(join(value.card.checkout, 'new.txt'), 'new reviewed file\n');
  const review = inspectAgentChanges(value.id, value.card);
  value.card = integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint });
  return value;
}

test('explicit source save commits only reviewed staging, bypasses hooks and advances the same request safely for a second turn', () => {
  const value = integratedFixture(), originalBase = value.card.baseRevision;
  const hook = join(value.source, '.git', 'hooks', 'pre-commit'), sentinel = join(value.source, 'hook-was-run');
  writeFileSync(hook, `#!/bin/sh\ntouch '${sentinel}'\nexit 1\n`, { mode: 0o755 });
  let saved = saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id });
  assert.equal(saved.integration.sourceSaved, true); assert.equal(saved.integration.continuationReady, true);
  assert.equal(saved.integration.oldBaseRevision, originalBase); assert.notEqual(saved.baseRevision, originalBase);
  assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), saved.baseRevision);
  assert.equal(git(value.card.checkout, 'rev-parse', 'HEAD').trim(), saved.baseRevision);
  assert.equal(git(value.source, 'status', '--porcelain'), ''); assert.equal(git(value.card.checkout, 'status', '--porcelain'), '');
  assert.equal(readFileSync(join(value.card.checkout, 'new.txt'), 'utf8'), 'new reviewed file\n');
  assert.throws(() => readFileSync(sentinel), /ENOENT/); assert.equal(saved.status, 'review');
  const firstBase = saved.baseRevision;
  writeFileSync(join(saved.checkout, 'app.txt'), 'second reviewed turn\n');
  let review = inspectAgentChanges(value.id, saved);
  assert.equal(review.integration.available, true);
  saved = integrateAgentCard(value.id, saved.id, { fingerprint: review.fingerprint });
  saved = saveAgentCardSource(value.id, saved.id, { integrationId: saved.integration.id });
  assert.equal(saved.integration.oldBaseRevision, firstBase); assert.equal(saved.integration.continuationReady, true);
  assert.equal(git(value.source, 'status', '--porcelain'), ''); assert.equal(git(saved.checkout, 'status', '--porcelain'), '');
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'second reviewed turn\n');
  assert.equal(git(value.source, 'rev-list', '--count', 'HEAD').trim(), '3');
});

function addUnreviewedWork(value, kind) {
  if (kind === 'staged') { writeFileSync(join(value.source, 'extra.txt'), 'other staged work\n'); git(value.source, 'add', 'extra.txt'); }
  if (kind === 'unstaged') writeFileSync(join(value.source, 'app.txt'), 'other unstaged work\n');
  if (kind === 'untracked') writeFileSync(join(value.source, 'extra.txt'), 'other untracked work\n');
  if (kind === 'worktree') writeFileSync(join(value.card.checkout, 'app.txt'), 'new worktree edits\n');
}
test('source save refuses extra staged, unstaged, untracked or changed worktree work without moving source HEAD', () => {
  for (const kind of ['staged', 'unstaged', 'untracked', 'worktree']) {
    const value = integratedFixture(), revision = git(value.source, 'rev-parse', 'HEAD').trim();
    addUnreviewedWork(value, kind);
    assert.throws(() => saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id }), /staging changed|unstaged changes|untracked files|worktree changed/);
    assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), revision);
    if (kind === 'worktree') assert.equal(readFileSync(join(value.card.checkout, 'app.txt'), 'utf8'), 'new worktree edits\n');
  }
});

test('an operator may select a project through DOGFOOD_PROJECT and explicitly save reviewed source', () => {
  const value = fixture(), previous = process.env.DOGFOOD_PROJECT; boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'operator reviewed source\n');
  process.env.DOGFOOD_PROJECT = value.id;
  try {
    const review = inspectAgentChanges(value.id, value.card);
    value.card = integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint });
    const saved = saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id });
    assert.equal(saved.integration.sourceSaved, true); assert.equal(saved.integration.continuationReady, true);
  } finally {
    if (previous === undefined) delete process.env.DOGFOOD_PROJECT; else process.env.DOGFOOD_PROJECT = previous;
  }
});

test('native agents cannot apply or save application source through the operator API', () => {
  const value = integratedFixture(), previous = process.env.DOGFOOD_NATIVE_REQUEST;
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try {
    assert.throws(() => saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id }), /explicit operator action/);
    assert.throws(() => integrateAgentCard(value.id, value.card.id, { fingerprint: value.card.integration.fingerprint }), /explicit operator action/);
  } finally {
    if (previous === undefined) delete process.env.DOGFOOD_NATIVE_REQUEST; else process.env.DOGFOOD_NATIVE_REQUEST = previous;
  }
});

test('source save respects existing source and worktree Git index locks without removing them', () => {
  for (const target of ['source', 'worktree']) {
    const value = integratedFixture(), directory = target === 'source' ? value.source : value.card.checkout;
    const index = git(directory, 'rev-parse', '--path-format=absolute', '--git-path', 'index').trim(), lock = `${index}.lock`;
    writeFileSync(lock, 'another Git operation\n');
    assert.throws(() => saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id }), /index\.lock|index is busy/);
    assert.equal(readFileSync(lock, 'utf8'), 'another Git operation\n');
    assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), value.card.baseRevision);
  }
});

test('an exact externally committed review reconciles without a new commit and can continue from that revision', () => {
  const value = integratedFixture();
  git(value.source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Operator saved exact review');
  const externalRevision = git(value.source, 'rev-parse', 'HEAD').trim();
  let saved = saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id });
  assert.equal(saved.integration.externalSaved, true); assert.equal(saved.integration.savedRevision, externalRevision);
  assert.equal(saved.integration.continuationReady, true); assert.equal(saved.baseRevision, externalRevision);
  assert.equal(git(value.source, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(git(saved.checkout, 'status', '--porcelain'), '');
  writeFileSync(join(saved.checkout, 'app.txt'), 'followup after external save\n');
  const review = inspectAgentChanges(value.id, saved);
  saved = integrateAgentCard(value.id, saved.id, { fingerprint: review.fingerprint });
  saved = saveAgentCardSource(value.id, saved.id, { integrationId: saved.integration.id });
  assert.equal(saved.integration.externalSaved, false); assert.equal(saved.integration.oldBaseRevision, externalRevision);
  assert.equal(saved.integration.continuationReady, true);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'followup after external save\n');
});

test('an unrelated external commit cannot reconcile; releasing its stale receipt preserves the clean moved source and requires a fresh request', () => {
  const value = integratedFixture();
  writeFileSync(join(value.source, 'other.txt'), 'unrelated operator work\n'); git(value.source, 'add', 'other.txt');
  git(value.source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Different source change');
  const revision = git(value.source, 'rev-parse', 'HEAD').trim();
  assert.throws(() => saveAgentCardSource(value.id, value.card.id, { integrationId: value.card.integration.id }), /exactly the reviewed tree/);
  assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), revision);
  assert.equal(readFileSync(join(value.source, 'other.txt'), 'utf8'), 'unrelated operator work\n');
  assert.equal(readFileSync(join(value.card.checkout, 'app.txt'), 'utf8'), 'reviewed source\n');
  const released = releaseAgentCardIntegration(value.id, value.card.id, { integrationId: value.card.integration.id });
  assert.equal(released.integration, null); assert.equal(released.freshRequestRequired, true);
  assert.equal(released.integrationHistory.at(-1).observedRevision, revision);
  assert.equal(released.integrationHistory.at(-1).sourceMoved, true);
  assert.equal(released.integrationHistory.at(-1).freshRequestRequired, true);
  assert.match(released.comments.at(-1).text, /start a fresh request/);
  assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), revision);
  assert.equal(readFileSync(join(value.source, 'other.txt'), 'utf8'), 'unrelated operator work\n');
  assert.equal(readFileSync(join(value.card.checkout, 'app.txt'), 'utf8'), 'reviewed source\n');
});

test('release verifies clean original source without modifying it and preserves receipt history and agent edits', () => {
  const value = integratedFixture(), integrationId = value.card.integration.id;
  assert.throws(() => releaseAgentCardIntegration(value.id, value.card.id, { integrationId }), /staged changes/);
  git(value.source, 'restore', '--source=HEAD', '--staged', '--worktree', '--', 'app.txt', 'new.txt');
  const sourceIndex = git(value.source, 'rev-parse', '--path-format=absolute', '--git-path', 'index').trim(), indexBefore = readFileSync(sourceIndex);
  const released = releaseAgentCardIntegration(value.id, value.card.id, { integrationId });
  assert.deepEqual(readFileSync(sourceIndex), indexBefore);
  assert.equal(released.integration, null); assert.equal(released.integrationHistory[0].id, integrationId);
  assert.equal(released.integrationHistory[0].released, true); assert.match(released.comments.at(-1).text, /No source changes were made/);
  assert.equal(git(value.source, 'status', '--porcelain'), '');
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'before\n');
  assert.equal(readFileSync(join(value.card.checkout, 'app.txt'), 'utf8'), 'reviewed source\n');
  assert.equal(readFileSync(join(value.card.checkout, 'new.txt'), 'utf8'), 'new reviewed file\n');
});

test('release refuses dirty source and preserves the active integration', () => {
  const value = integratedFixture(), integrationId = value.card.integration.id;
  git(value.source, 'restore', '--source=HEAD', '--staged', '--worktree', '--', 'app.txt', 'new.txt');
  writeFileSync(join(value.source, 'app.txt'), 'operator unstaged changes\n');
  assert.throws(() => releaseAgentCardIntegration(value.id, value.card.id, { integrationId }), /unstaged changes/);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'operator unstaged changes\n');
  assert.equal(readFileSync(join(value.card.checkout, 'app.txt'), 'utf8'), 'reviewed source\n');
  assert.equal(JSON.parse(readFileSync(join(data, 'agent-board', `${value.id}.json`))).cards[0].integration.id, integrationId);
});


test('long conversation history cannot lose integration or save receipts after source is changed', () => {
  const value = fixture();
  value.card.comments = Array.from({ length: 200 }, (_, index) => ({ id: `note-${index}`, by: 'person', text: `Retained note ${index}.` }));
  boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'reviewed long conversation change\n');
  const review = inspectAgentChanges(value.id, value.card);
  const integrated = integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint });
  assert.equal(integrated.comments.length, 201);
  assert.ok(integrated.integration.id);
  const saved = saveAgentCardSource(value.id, value.card.id, { integrationId: integrated.integration.id });
  assert.equal(saved.integration.sourceSaved, true);
  assert.equal(saved.comments.length, 202);
  assert.equal(saved.comments[0].text, 'Retained note 0.');
  const stored = JSON.parse(readFileSync(join(data, 'agent-board', `${value.id}.json`), 'utf8')).cards[0];
  assert.equal(stored.integration.savedRevision, git(value.source, 'rev-parse', 'HEAD').trim());
  assert.equal(stored.comments.length, 202);
});

test('source-backed QA requests expose changes for inspection but cannot integrate audit edits', () => {
  const value = fixture(); value.card.intent = 'qa'; boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'unexpected audit edit\n');
  const review = inspectAgentChanges(value.id, value.card);
  assert.equal(review.files[0].content, 'unexpected audit edit\n');
  assert.equal(review.integration.available, false);
  assert.match(review.integration.reason, /QA requests are read-only/);
  assert.throws(() => integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint }), /QA requests are read-only/);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'before\n');
  assert.equal(git(value.source, 'status', '--porcelain').trim(), '');
});


test('a legacy needs-input marker preserves structured checks, gaps, and the explicit decision', () => {
  const packet = { status: 'needs_input', summary: 'An account is needed to verify checkout.', decision: 'Which test account should checkout use?', checks: [{ command: 'npm test', result: 'Passed', evidence: '/tmp/check.log' }], unverified: ['Authenticated checkout'], previewUrl: 'http://localhost:3000' };
  const reply = value => `NEEDS_INPUT: Which account?\n\n\`\`\`dogfood-result\n${JSON.stringify(value)}\n\`\`\``;
  const outcome = agentOutcome(reply(packet));
  assert.equal(outcome.status, 'needs_input');
  assert.equal(outcome.structured, true);
  assert.equal(outcome.decision, packet.decision);
  assert.equal(outcome.summary, packet.summary);
  assert.equal(outcome.checks[0].evidence, '/tmp/check.log');
  assert.deepEqual(outcome.unverified, ['Authenticated checkout']);
  const inconsistent = agentOutcome(reply({ ...packet, status: 'ready_for_review', decision: '' }));
  assert.equal(inconsistent.status, 'needs_input');
  assert.equal(inconsistent.decision, 'Which account?');
  assert.equal(inconsistent.checks[0].command, 'npm test');
});


test('legacy applied QA changes cannot be saved through the read-only audit request', () => {
  const value = fixture(); boardFixture(value);
  writeFileSync(join(value.card.checkout, 'app.txt'), 'historical audit change\n');
  const review = inspectAgentChanges(value.id, value.card);
  const integrated = integrateAgentCard(value.id, value.card.id, { fingerprint: review.fingerprint });
  const file = join(data, 'agent-board', `${value.id}.json`), document = JSON.parse(readFileSync(file, 'utf8'));
  document.cards[0].intent = 'qa'; writeFileSync(file, JSON.stringify(document));
  assert.throws(() => saveAgentCardSource(value.id, value.card.id, { integrationId: integrated.integration.id }), /QA requests are read-only/);
  assert.equal(git(value.source, 'rev-parse', 'HEAD').trim(), value.card.baseRevision);
  assert.equal(readFileSync(join(value.source, 'app.txt'), 'utf8'), 'historical audit change\n');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).cards[0].integration.sourceSaved, undefined);
});


test('turn snapshots retain working document provenance and image references without unsent or discarded notes', () => {
  const value = fixture();
  writeFileSync(join(value.source, 'vision.md'), '# Draft vision\nA current uncommitted decision.');
  writeFileSync(join(value.source, 'INTENT.md'), '# Current intent\nKeep the integration read-only.');
  const screenshot = { id: 'image-1', name: 'before.png', mimeType: 'image/png', path: join(data, 'before.png'), url: '/api/images/before' };
  const sent = { id: 'sent-1', by: 'person', text: 'Match this spacing.', sent: true, deliveredAt: '2026-11-04T00:00:00Z', attachments: [screenshot] };
  Object.assign(value.card, { session: 'fixture-session', operation: { token: 'turn-snapshot', expectedTurn: 2 }, comments: [sent, { id: 'private', by: 'person', text: 'PRIVATE experiment', sent: false, attachments: [{ name: 'private.png' }] }, { id: 'discarded', by: 'person', text: 'DISCARDED experiment', sent: true, discardedAt: '2026-11-04T00:00:00Z' }] });
  const saved = saveTurnContext(value.id, value.card, []);
  const bytes = readFileSync(saved.descriptor.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), saved.descriptor.sha256);
  assert.match(saved.snapshot.context.documents.vision.content, /uncommitted decision/);
  assert.match(saved.snapshot.context.documents.vision.source, /including uncommitted drafts/);
  assert.equal(saved.context.documents.vision.content, undefined);
  assert.equal(saved.snapshot.context.documents.intent.file, 'INTENT.md');
  assert.match(saved.snapshot.context.documents.intent.content, /Keep the integration read-only/);
  assert.equal(saved.context.documents.intent.content, undefined);
  assert.equal(saved.snapshot.context.documents.intent.sha256, createHash('sha256').update('# Current intent\nKeep the integration read-only.').digest('hex'));
  assert.deepEqual(saved.snapshot.conversation.map(entry => entry.id), ['sent-1']);
  assert.doesNotMatch(bytes.toString(), /PRIVATE|DISCARDED|private.png/);
  assert.match(turnContextInstructions(saved), /Open each relevant attached image/);
  assert.ok(turnContextInstructions(saved).includes(screenshot.path));
  writeFileSync(join(value.source, 'vision.md'), '# Later changed document');
  writeFileSync(join(value.source, 'INTENT.md'), '# Later changed intent');
  assert.equal(readFileSync(saved.descriptor.path).toString(), bytes.toString());
  assert.throws(() => saveTurnContext(value.id, value.card, []), /EEXIST/);
});
