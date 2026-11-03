import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { readProject, validationError } from './store.mjs';
import { inspectAgentChanges, withIntegrationLock } from './agent-changes.mjs';
import { assertSourceOperator } from './source-operator.mjs';

const fail = message => Object.assign(validationError(message), { status: 409 });
function git(path, args, options = {}) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', '-c', 'core.fsmonitor=false', '-C', path, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 2_000_000, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, ...options });
}
function sourceCheckout(projectId) {
  const source = readProject(projectId).source.checkout;
  if (!source) throw fail('There is no application source checkout to save.');
  return realpathSync(resolve(root, source));
}
function receiptFor(card, integrationId) {
  const receipt = card.integration;
  if (!receipt || receipt.id !== integrationId) throw fail('Refresh the request and save its latest reviewed integration.');
  if (!receipt.indexTree || !receipt.patchHash) throw fail('This integration has no exact staged-source receipt; inspect and save it locally.');
  return receipt;
}
function temporaryIndex(source, action) {
  const base = join(dataDir, 'agent-board', 'source-indices'); mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(join(base, 'save-')), index = join(directory, 'index');
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_OPTIONAL_LOCKS: '0' };
  try { return action(args => git(source, args, { env }), index, env); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}
function expectedTree(source, baseRevision, patch) {
  return temporaryIndex(source, (run, index, env) => {
    run(['read-tree', baseRevision]);
    git(source, ['apply', '--cached', '--whitespace=nowarn', '-'], { env, input: patch });
    return run(['write-tree']).trim();
  });
}
function noWorkingChanges(source) {
  try { git(source, ['diff', '--quiet', '--no-ext-diff', '--ignore-submodules=none', '--']); }
  catch { throw fail('Source has unstaged changes. Preserve them before saving this reviewed integration.'); }
  if (git(source, ['ls-files', '--others', '--exclude-standard', '-z']).length) throw fail('Source has untracked files. Preserve them before saving this reviewed integration.');
}
function sourceMatches(source, receipt, revision = receipt.baseRevision) {
  if (git(source, ['write-tree']).trim() !== receipt.indexTree) throw fail('Source staging changed since the reviewed integration. Extra staged work will not be committed.');
  sourceUnchanged(source, receipt, revision);
}
function sourceUnchanged(source, receipt, revision = receipt.baseRevision) {
  if (git(source, ['rev-parse', 'HEAD']).trim() !== revision) throw fail('Source HEAD changed since this integration. Preserve the new work and start a fresh request.');
  noWorkingChanges(source);
}
function exactExternalCommit(source, receipt) {
  const revision = git(source, ['rev-parse', 'HEAD']).trim();
  if (revision === receipt.baseRevision) return '';
  const parents = git(source, ['rev-list', '--parents', '-n', '1', revision]).trim().split(' ');
  if (parents.length !== 2 || parents[1] !== receipt.baseRevision) throw fail('Source HEAD is not a direct single-parent commit of the reviewed base. Preserve it and inspect locally.');
  if (git(source, ['rev-parse', `${revision}^{tree}`]).trim() !== receipt.indexTree) throw fail('The external source commit does not contain exactly the reviewed tree. Preserve it and inspect locally.');
  return revision;
}
function unchangedReview(projectId, card, receipt) {
  const review = inspectAgentChanges(projectId, card);
  if (review.fingerprint !== receipt.fingerprint) throw fail('The agent worktree changed after integration. Review it before saving source.');
  const patch = review.files.map(file => file.patch).join('');
  if (createHash('sha256').update(patch).digest('hex') !== receipt.patchHash) throw fail('Reviewed source patch no longer matches the integration.');
  return patch;
}
function worktreeState(card, receipt) {
  const head = git(card.checkout, ['rev-parse', 'HEAD']).trim();
  if (head !== receipt.baseRevision) throw fail('The isolated branch advanced after review; preserve it and start a fresh request.');
  const tree = git(card.checkout, ['write-tree']).trim(), baseTree = git(card.checkout, ['rev-parse', `${receipt.baseRevision}^{tree}`]).trim();
  if (![baseTree, receipt.indexTree].includes(tree)) throw fail('The agent worktree contains other staged work. Preserve it before saving this integration.');
  return { head, ...indexState(card.checkout) };
}
function indexState(directory) {
  const index = git(directory, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).trim();
  return { index, indexHash: createHash('sha256').update(readFileSync(index)).digest('hex') };
}
function withWorktreeIndex(state, action) {
  const lock = `${state.index}.lock`;
  let handle;
  try { handle = openSync(lock, 'wx', 0o600); } catch { throw fail('A source or isolated worktree index is busy. Wait for its current operation.'); }
  const owned = { lock, handle, index: state.index, active: true };
  try { return action(owned); }
  finally { releaseIndexLock(owned); }
}
function releaseIndexLock(owned) {
  if (!owned.active) return;
  if (owned.handle !== null) closeSync(owned.handle);
  rmSync(owned.lock, { force: true });
}
function indexUnchanged(state) {
  if (createHash('sha256').update(readFileSync(state.index)).digest('hex') !== state.indexHash) throw fail('The worktree staging changed while source was being saved. Preserve it and retry.');
}
function configIdentity(source, key, fallback) {
  try {
    const value = git(source, ['config', '--local', '--get', key]).trim();
    return value && value.length <= 160 && !/[<>\r\n]/.test(value) ? value : fallback;
  } catch { return fallback; }
}
function localCommit(source, receipt, card) {
  const name = configIdentity(source, 'user.name', 'Dogfood'), email = configIdentity(source, 'user.email', 'local@dogfood.invalid');
  const env = { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
  return git(source, ['commit-tree', receipt.indexTree, '-p', receipt.baseRevision, '-m', `Save reviewed Dogfood request ${card.id}`], { env }).trim();
}
function preparedIndex(source, tree) {
  return temporaryIndex(source, (run, index) => { run(['read-tree', tree]); return readFileSync(index); });
}
function replaceWorktreeIndex(lock, bytes) {
  writeFileSync(lock.handle, bytes); fsyncSync(lock.handle); closeSync(lock.handle); lock.handle = null;
  renameSync(lock.lock, lock.index); lock.active = false;
}
function continueWorktree(projectId, card, receipt, revision, state, lock, index) {
  try {
    unchangedReview(projectId, card, receipt); indexUnchanged(state);
    git(card.checkout, ['merge-base', '--is-ancestor', state.head, revision]);
    git(card.checkout, ['update-ref', 'HEAD', revision, state.head]);
    replaceWorktreeIndex(lock, index);
    const dirty = git(card.checkout, ['status', '--porcelain', '--untracked-files=all']).trim();
    return { baseRevision: revision, continuationReady: !dirty, continuationReason: dirty ? 'Additional worktree edits were preserved. Inspect them before continuing.' : '' };
  } catch { return { baseRevision: continuedBase(card, revision), continuationReady: false, continuationReason: 'Source was saved; the worktree changed concurrently and was preserved. Start a fresh request from the saved source.' }; }
}
function continuedBase(card, revision) {
  try { return git(card.checkout, ['rev-parse', 'HEAD']).trim() === revision ? revision : card.baseRevision; }
  catch { return card.baseRevision; }
}
function saveLocked(projectId, card, receipt, source) {
  const externalRevision = exactExternalCommit(source, receipt), expectedRevision = externalRevision || receipt.baseRevision;
  sourceMatches(source, receipt, expectedRevision);
  const patch = unchangedReview(projectId, card, receipt);
  if (expectedTree(source, receipt.baseRevision, patch) !== receipt.indexTree) throw fail('Source staging is not exactly the reviewed patch. It will not be committed.');
  const state = worktreeState(card, receipt), sourceState = indexState(source), index = preparedIndex(source, receipt.indexTree);
  return withWorktreeIndex(sourceState, () => withWorktreeIndex(state, lock => {
    indexUnchanged(sourceState); indexUnchanged(state); unchangedReview(projectId, card, receipt); sourceUnchanged(source, receipt, expectedRevision);
    const revision = externalRevision || localCommit(source, receipt, card);
    sourceUnchanged(source, receipt, expectedRevision); indexUnchanged(sourceState);
    git(source, ['update-ref', 'HEAD', revision, expectedRevision]);
    const continuation = continueWorktree(projectId, card, receipt, revision, state, lock, index);
    return savedReceipt(receipt, continuation, revision, externalRevision);
  }));
}
function savedReceipt(receipt, continuation, revision, externalRevision) {
  const note = externalRevision ? 'Exact externally saved local commit reconciled with this request.' : 'Reviewed source saved in a local commit.';
  return { ...receipt, ...continuation, oldBaseRevision: receipt.baseRevision, savedRevision: revision, savedAt: new Date().toISOString(), sourceSaved: true, externalSaved: Boolean(externalRevision), note: `${note} Run source checks and page QA next. Nothing was pushed or deployed.` };
}
function integrationSource(projectId, receipt) {
  const source = sourceCheckout(projectId);
  if (source !== receipt.sourceCheckout) throw fail('The project source checkout changed after integration. Preserve the staged source and inspect locally.');
  return source;
}

export function saveReviewedSource(projectId, card, integrationId) {
  assertSourceOperator();
  const receipt = receiptFor(card, integrationId);
  if (receipt.sourceSaved) return receipt;
  const source = integrationSource(projectId, receipt);
  return withIntegrationLock(projectId, () => saveLocked(projectId, card, receipt, source));
}

function cleanReleaseSource(source) {
  const revision = git(source, ['rev-parse', 'HEAD']).trim();
  noWorkingChanges(source);
  const tree = git(source, ['rev-parse', `${revision}^{tree}`]).trim();
  if (readOnlyIndexTree(source) !== tree) throw fail('Source still contains staged changes. Release is available only after source is clean.');
  return revision;
}
function readOnlyIndexTree(source) {
  return temporaryIndex(source, (run, index) => {
    const sourceIndex = git(source, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).trim();
    writeFileSync(index, readFileSync(sourceIndex));
    return run(['write-tree']).trim();
  });
}
function releaseLocked(receipt, source) {
  const observedRevision = cleanReleaseSource(source);
  const state = indexState(source);
  return withWorktreeIndex(state, () => {
    indexUnchanged(state);
    if (cleanReleaseSource(source) !== observedRevision) throw fail('Source HEAD changed while releasing the receipt. Preserve it and retry.');
    return releasedReceipt(receipt, observedRevision);
  });
}
function releasedReceipt(receipt, observedRevision) {
  const sourceMoved = observedRevision !== receipt.baseRevision;
  const next = sourceMoved ? ' Source has moved; start a fresh request from the updated source before integrating.' : '';
  return { ...receipt, released: true, releasedAt: new Date().toISOString(), observedRevision, sourceMoved, freshRequestRequired: sourceMoved, note: `Integration released after verifying source is clean. No source changes were made; the reviewed request worktree was preserved.${next}` };
}
export function releaseReviewedSource(projectId, card, integrationId) {
  assertSourceOperator();
  const receipt = receiptFor(card, integrationId);
  if (receipt.sourceSaved) throw fail('This integration has already been saved; there is no unsaved integration to release.');
  const source = integrationSource(projectId, receipt);
  return withIntegrationLock(projectId, () => releaseLocked(receipt, source));
}
