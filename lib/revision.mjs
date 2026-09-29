import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}

// HEAD covers unchanged tracked files. Read only changed paths and nonignored untracked files.
function fileState(file) {
  try {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink()) return { type: 'link', mode: '', bytes: readlinkSync(file) };
    if (stat.isFile()) return { type: 'file', mode: String(stat.mode & 0o111), bytes: readFileSync(file) };
    throw new Error('Git listed a directory as a regular file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { type: 'deleted', mode: '', bytes: '' };
  }
}

function paths(directory, args) {
  return git(directory, args).toString().split('\0').filter(Boolean).sort();
}

function hashPath(digest, directory, name) {
  const state = fileState(resolve(directory, name));
  const bytes = Buffer.isBuffer(state.bytes) ? state.bytes : Buffer.from(state.bytes);
  digest.update('\0file\0').update(name).update('\0').update(state.type).update('\0').update(state.mode)
    .update('\0').update(String(bytes.length)).update('\0').update(bytes);
}

function hashChanged(digest, directory, changed, modules) {
  for (const name of changed) if (!modules.has(name)) hashPath(digest, directory, name);
}

function fingerprint(directory, revision) {
  const changed = paths(directory, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=none', 'HEAD']);
  const untracked = paths(directory, ['ls-files', '-z', '--others', '--exclude-standard']);
  const modules = new Set(submodulePaths(directory));
  const digest = createHash('sha256').update(revision);
  hashChanged(digest, directory, changed, modules);
  for (const name of untracked) hashPath(digest, directory, name);
  const nested = submoduleState(directory, digest, modules);
  return { fingerprint: digest.digest('hex'), dirty: Boolean(changed.length || untracked.length || nested) };
}

function submodulePaths(directory) {
  return [...new Set(git(directory, ['ls-files', '--stage', '-z']).toString().split('\0').filter(entry => entry.startsWith('160000 '))
    .map(entry => entry.slice(entry.indexOf('\t') + 1)))].sort();
}

function submoduleState(directory, digest, modules) {
  let dirty = false;
  for (const name of modules) {
    const child = checkoutRevision(resolve(directory, name));
    if (!child.fingerprint) throw new Error('Submodule checkout is unavailable.');
    digest.update('\0submodule\0').update(name).update('\0').update(child.fingerprint);
    dirty ||= child.dirty;
  }
  return dirty;
}

export function checkoutRevision(checkout) {
  try {
    const requested = realpathSync(resolve(checkout));
    const directory = realpathSync(git(requested, ['rev-parse', '--show-toplevel']).toString().trim());
    const revision = git(directory, ['rev-parse', 'HEAD']).toString().trim();
    return { revision, ...fingerprint(directory, revision) };
  } catch { return { revision: null, fingerprint: null, dirty: null }; }
}
