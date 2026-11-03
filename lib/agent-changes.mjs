import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { readProject, validationError } from './store.mjs';

const maximumFile = 100_000, maximumPatch = 500_000;
const fail = message => Object.assign(validationError(message), { status: 409 });
const privatePath = /(?:^|\/)(?:\.git(?:\/|$)|\.(?:aws|ssh|gnupg)(?:\/|$)|\.(?:npmrc|netrc|pypirc)$|\.env(?:\.|$)|(?:credentials?|secrets?|tokens?)(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$))|\.(?:pem|key|p12|pfx)$/i;
const privateText = /-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{15,})\b/;

function git(directory, args, options = {}) {
  return execFileSync('git', ['--no-pager', '--literal-pathspecs', '-c', 'color.ui=false', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 2_000_000, stdio: ['pipe', 'pipe', 'pipe'], ...options });
}
function paths(output) { return output.split('\0').filter(Boolean); }
function invalidName(name) { return !name || name.startsWith('/') || name.split('/').some(part => ['..', '.', ''].includes(part)); }
function changes(card) {
  const tracked = paths(git(card.checkout, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', card.baseRevision, '--']));
  const untracked = paths(git(card.checkout, ['ls-files', '-z', '--others', '--exclude-standard']));
  return { tracked, untracked, names: [...new Set([...tracked, ...untracked])] };
}
function safeName(name) {
  if (invalidName(name)) throw fail('Unsafe change path requires manual review.');
  if (/[\x00-\x1f\x7f\\]/.test(name) || privatePath.test(name)) throw fail('Sensitive or unsupported path is withheld from in-app changes.');
}
function safeParents(directory, name) {
  const parts = name.split('/');
  let current = directory;
  for (const part of parts) {
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw fail('Symbolic links require manual review.');
  }
}
function treeEntry(card, name) {
  const entry = git(card.checkout, ['ls-tree', '-z', card.baseRevision, '--', name]).split('\0').filter(Boolean)[0];
  return entry?.split(' ')[0] || '';
}
function safeMode(card, name) {
  const mode = treeEntry(card, name);
  if (mode && !['100644', '100755'].includes(mode)) throw fail('Symlinks and submodules require manual review.');
  const stat = lstatSync(join(card.checkout, name), { throwIfNoEntry: false });
  if (stat && !stat.isFile()) throw fail('Only regular text files can be reviewed and applied.');
  return stat;
}
function checkedText(bytes) {
  if (bytes.length > maximumFile) throw fail('File exceeds the 100 KB in-app review limit.');
  const text = bytes.toString('utf8');
  if (text.includes('\0') || !Buffer.from(text).equals(bytes)) throw fail('Binary files require manual review.');
  if (privateText.test(text)) throw fail('Possible secret content is withheld; inspect locally.');
  return text;
}
function fileText(card, name, exists) {
  if (!exists) return null;
  return checkedText(readBytes(card.checkout, name));
}
// Open with O_NOFOLLOW after checking every parent. The byte content is never put in logs.
function readBytes(directory, name) {
  const handle = openSync(join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (fstatSync(handle).size > maximumFile) throw fail('File exceeds the 100 KB in-app review limit.');
    const bytes = Buffer.alloc(maximumFile + 1), count = readSync(handle, bytes, 0, bytes.length, 0);
    return bytes.subarray(0, count);
  } finally { closeSync(handle); }
}
function oldText(card, name, mode) {
  if (!mode) return null;
  return checkedText(git(card.checkout, ['show', `${card.baseRevision}:${name}`], { encoding: 'buffer' }));
}
function newPatch(card, name) {
  try { return git(card.checkout, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', '/dev/null', name]); }
  catch (error) { if (error.status === 1 && typeof error.stdout === 'string') return error.stdout; throw error; }
}
function status(before, after) { return before === null ? 'added' : after === null ? 'deleted' : 'modified'; }
function inspectedFile(card, name, untracked) {
  safeName(name); safeParents(card.checkout, name);
  const mode = treeEntry(card, name), stat = safeMode(card, name);
  const before = oldText(card, name, mode), content = fileText(card, name, stat);
  const patch = untracked ? newPatch(card, name) : git(card.checkout, ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', card.baseRevision, '--', name]);
  if (privateText.test(patch)) throw fail('Possible secret content is withheld; inspect locally.');
  return { path: name, status: status(before, content), patch, content, beforeContent: before };
}
function fileReview(card, name, untracked) {
  try { return inspectedFile(card, name, untracked); }
  catch (error) { return { path: name, status: 'withheld', patch: '', omittedReason: error.message }; }
}
function sourceCheckout(projectId) {
  const project = readProject(projectId);
  if (!project.source.checkout) throw fail('Attach a source checkout before applying changes.');
  return realpathSync(resolve(root, project.source.checkout));
}
function repository(directory) {
  if (realpathSync(git(directory, ['rev-parse', '--show-toplevel']).trim()) !== realpathSync(directory)) throw fail('Checkout must be an exact repository root.');
  return realpathSync(git(directory, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
}
function sourceReady(source, card) {
  if (repository(source) !== repository(card.checkout)) throw fail('The worktree does not belong to this source repository.');
  if (git(source, ['rev-parse', 'HEAD']).trim() !== card.baseRevision) throw fail('Source revision changed. Start a new request from the current source before applying.');
  if (git(source, ['status', '--porcelain', '--untracked-files=all']).trim()) throw fail('Source has local changes. Preserve or integrate them before applying this request.');
}
function changeFingerprint(card, files) {
  return createHash('sha256').update(card.baseRevision).update(JSON.stringify(files)).digest('hex');
}
function missingChanges(card) {
  return { changedFiles: [], untrackedFiles: [], diffSummary: '', files: [], fingerprint: null, integration: { available: false, reason: 'Start an agent and inspect a finished result first.' }, checkout: card.checkout || '', baseRevision: card.baseRevision || '' };
}
function checkRevision(card) { if (!/^[a-f0-9]{40,64}$/.test(card.baseRevision)) throw fail('Invalid source revision.'); }
function verifiedWorktree(projectId, card) {
  const source = sourceCheckout(projectId);
  if (repository(source) !== repository(card.checkout)) throw fail('The worktree does not belong to this source repository.');
  const paths = git(source, ['worktree', 'list', '--porcelain', '-z']).split('\0').filter(line => line.startsWith('worktree ')).map(line => realpathSync(line.slice(9)));
  if (!paths.includes(realpathSync(card.checkout)) || realpathSync(card.checkout) === source) throw fail('Only the request isolated Git worktree can be inspected here.');
}
function integrationReason(projectId, card, files) {
  if (card.status !== 'review') return 'Only a finished request in Review can be applied.';
  if (!files.length) return 'There are no changes to apply.';
  if (files.some(file => file.omittedReason)) return 'Some files require local review and cannot be applied here.';
  try { sourceReady(sourceCheckout(projectId), card); return ''; } catch (error) { return error.message; }
}

export function inspectAgentChanges(projectId, card) {
  const missing = absentChanges(projectId, card);
  if (missing) return missing;
  checkRevision(card); verifiedWorktree(projectId, card);
  const changed = changes(card), untracked = new Set(changed.untracked);
  const files = changed.names.slice(0, 40).map(name => fileReview(card, name, untracked.has(name)));
  if (changed.names.length > 40) files.push({ path: '(remaining files)', status: 'withheld', patch: '', omittedReason: 'More than 40 files require local review.' });
  const size = files.reduce((sum, file) => sum + file.patch.length + (file.content?.length || 0) + (file.beforeContent?.length || 0), 0);
  if (size > maximumPatch) return oversizedChanges(card, changed);
  const reason = integrationReason(projectId, card, files);
  return { changedFiles: changed.names, untrackedFiles: changed.untracked, diffSummary: files.map(file => `${file.path}: ${file.status}`).join('\n'), files, fingerprint: changeFingerprint(card, files), integration: { available: !reason, reason, stagesChanges: true, sourceRevision: card.baseRevision }, checkout: card.checkout, baseRevision: card.baseRevision };
}
function absentChanges(projectId, card) {
  if (card.sourceKind === 'audit-workspace' || !readProject(projectId).source.checkout) return auditOnlyChanges(card);
  if (!card.checkout || !card.baseRevision) return missingChanges(card);
  return null;
}
function auditOnlyChanges(card) {
  return { ...missingChanges(card), sourceKind: 'audit-workspace', diffSummary: 'No source checkout; audit results only.', integration: { available: false, reason: 'No source checkout; audit results only.' } };
}
function oversizedChanges(card, changed) {
  return { ...missingChanges(card), changedFiles: changed.names, untrackedFiles: changed.untracked, files: [], diffSummary: 'Change set exceeds the 500 KB in-app review limit.', integration: { available: false, reason: 'Change set requires manual review.' } };
}
function checkSourcePaths(source, files) {
  for (const file of files) {
    safeName(file.path); safeParents(source, file.path);
    if (file.status === 'added' && lstatSync(join(source, file.path), { throwIfNoEntry: false })) throw fail('A new-file destination already exists in the source checkout.');
  }
}
function applyPatch(source, patch) {
  git(source, ['apply', '--check', '--index', '--whitespace=nowarn', '-'], { input: patch });
  git(source, ['apply', '--index', '--whitespace=nowarn', '-'], { input: patch });
}

export function applyReviewedChanges(projectId, card, fingerprint) {
  const source = sourceCheckout(projectId);
  return withIntegrationLock(projectId, () => applyLocked(projectId, card, source, fingerprint));
}
export function withIntegrationLock(projectId, action) {
  readProject(projectId);
  const lock = join(dataDir, 'agent-board', `${projectId}.integration.lock`);
  mkdirSync(dirname(lock), { recursive: true });
  const handle = integrationLock(lock);
  try { return action(); }
  finally { closeSync(handle); rmSync(lock, { force: true }); }
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function recoverIntegrationLock(lock) {
  try {
    const owner = JSON.parse(readFileSync(lock, 'utf8'));
    if (Number.isInteger(owner.pid) && !processAlive(owner.pid)) rmSync(lock, { force: true });
  } catch {
    expireMalformedLock(lock);
  }
}
function expireMalformedLock(lock) {
  const stat = lstatSync(lock, { throwIfNoEntry: false });
  if (stat && Date.now() - stat.mtimeMs > 30_000) rmSync(lock, { force: true });
}
function integrationLock(lock) {
  recoverIntegrationLock(lock);
  try {
    const handle = openSync(lock, 'wx');
    writeFileSync(handle, JSON.stringify({ pid: process.pid }));
    return handle;
  } catch { throw fail('An integration is already in progress. Try again after it finishes.'); }
}
function applyLocked(projectId, card, source, fingerprint) {
  const review = inspectAgentChanges(projectId, card);
  if (!review.integration.available) throw fail(review.integration.reason);
  if (!fingerprint || review.fingerprint !== fingerprint) throw fail('Changes differ from the reviewed snapshot. Inspect them again before applying.');
  checkSourcePaths(source, review.files); sourceReady(source, card);
  applyPatch(source, review.files.map(file => file.patch).join(''));
  const patchHash = createHash('sha256').update(review.files.map(file => file.patch).join('')).digest('hex');
  return { id: randomUUID(), at: new Date().toISOString(), baseRevision: card.baseRevision, sourceCheckout: source, fingerprint, changedFiles: review.changedFiles, indexTree: git(source, ['write-tree']).trim(), patchHash, staged: true, note: 'Reviewed changes applied and staged. Save the reviewed source, then run checks and page QA before accepting the task; no deployment was made.' };
}
