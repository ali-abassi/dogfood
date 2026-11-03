import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './paths.mjs';
import { validationError } from './store.mjs';

const files = ['vision.md', 'plan.md'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message) { return Object.assign(validationError(message), { status: 409 }); }
function directory(project) {
  if (!project.source.checkout) throw fail('Connect a project checkout before saving its scope baseline.');
  return realpathSync(resolve(root, project.source.checkout));
}
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 400_000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}
function committedDoc(cwd, doc) {
  if (!doc?.text) return false;
  try { return git(cwd, ['show', `HEAD:${doc.file}`]) === doc.text; } catch { return false; }
}
export function scopeBaselineState(project, docs) {
  try {
    const cwd = directory(project), revision = git(cwd, ['rev-parse', 'HEAD']).trim();
    const committed = files.every(file => committedDoc(cwd, docs[file.replace('.md', '')]));
    const clean = git(cwd, ['status', '--porcelain=v1', '--untracked-files=all']).length === 0;
    return { ready: committed, committed, clean, revision, message: committed ? 'The reviewed documents match committed source. Other work is handled separately during integration.' : 'Save the reviewed Vision and Plan in the source baseline before building.' };
  } catch { return { ready: false, committed: false, clean: false, revision: null, message: 'A committed project checkout is required before building.' }; }
}
function requireManaged(path, file, managed) {
  if (!managed[file] || managed[file] !== digest(readFileSync(path, 'utf8'))) throw fail(`Only an unchanged ${file} draft created by Dogfood can be committed here. Commit other documents with your coding tools.`);
}
function pendingDocument(cwd, file, managed) {
  const path = join(cwd, file), stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 200_000) throw fail('Scope baseline only accepts regular, bounded Vision and Plan files.');
  const text = readFileSync(path, 'utf8');
  if (committedDoc(cwd, { file, text })) return null;
  requireManaged(path, file, managed);
  return file;
}
function managedFiles(cwd, managed) { return files.map(file => pendingDocument(cwd, file, managed)).filter(Boolean); }
function statusPaths(cwd) {
  const value = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  return value.split('\0').filter(Boolean).map(entry => ({ status: entry.slice(0, 2), path: entry.slice(3) }));
}
function cleanStaging(cwd) {
  if (git(cwd, ['diff', '--cached', '--name-only', '-z']).trim()) throw fail('There are staged changes. Preserve or commit them separately before saving the scope baseline.');
}
function onlyManagedChanges(cwd, pending) {
  const unrelated = statusPaths(cwd).filter(item => !pending.includes(item.path));
  if (unrelated.length) throw fail('There are other source changes. Preserve or commit them separately before saving the scope baseline.');
}
function configuredIdentity(cwd, key, fallback) {
  try { return git(cwd, ['config', '--get', key]).trim() || fallback; } catch { return fallback; }
}
function commitArguments(cwd, pending) {
  const name = configuredIdentity(cwd, 'user.name', 'Dogfood scope');
  const email = configuredIdentity(cwd, 'user.email', 'scope@dogfood.local');
  return ['-c', `user.name=${name}`, '-c', `user.email=${email}`, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--only', '-m', 'Record reviewed project scope', '--', ...pending];
}
export function commitManagedScope(project, managed) {
  const cwd = directory(project);
  cleanStaging(cwd);
  const pending = managedFiles(cwd, managed);
  if (!pending.length) throw fail('The reviewed documents are already committed.');
  onlyManagedChanges(cwd, pending);
  const before = git(cwd, ['rev-parse', 'HEAD']).trim();
  git(cwd, ['add', '--', ...pending]);
  managedFiles(cwd, managed); onlyManagedChanges(cwd, pending);
  if (git(cwd, ['rev-parse', 'HEAD']).trim() !== before) throw fail('The source revision changed. Review its current state before trying again.');
  git(cwd, commitArguments(cwd, pending));
  return { revision: git(cwd, ['rev-parse', 'HEAD']).trim(), files: pending, previousRevision: before };
}
