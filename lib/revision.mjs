import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}

// Tracked content comes from Git's diff; only nonignored untracked files need a direct read.
function fileBytes(file) {
  try {
    return lstatSync(file).isSymbolicLink() ? readlinkSync(file) : readFileSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '<deleted>';
  }
}

function fingerprint(directory, revision) {
  const diff = git(directory, ['diff', '--binary', '--no-ext-diff', '--no-textconv', '--submodule=short', '--ignore-submodules=none', 'HEAD']);
  const names = git(directory, ['ls-files', '-z', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean).sort();
  const digest = createHash('sha256').update(revision);
  digest.update('\0').update(diff);
  for (const name of names) digest.update('\0').update(name).update('\0').update(fileBytes(resolve(directory, name)));
  const nested = submoduleState(directory, digest);
  return { fingerprint: digest.digest('hex'), dirty: Boolean(diff.length || names.length || nested) };
}

function submodulePaths(directory) {
  return git(directory, ['ls-files', '--stage', '-z']).toString().split('\0').filter(entry => entry.startsWith('160000 '))
    .map(entry => entry.slice(entry.indexOf('\t') + 1)).sort();
}

function submoduleState(directory, digest) {
  let dirty = false;
  for (const name of submodulePaths(directory)) {
    const child = checkoutRevision(resolve(directory, name));
    if (!child.fingerprint) throw new Error('Submodule checkout is unavailable.');
    digest.update('\0submodule\0').update(name).update('\0').update(child.fingerprint);
    dirty ||= child.dirty;
  }
  return dirty;
}

export function checkoutRevision(checkout) {
  try {
    const directory = realpathSync(resolve(checkout));
    if (git(directory, ['rev-parse', '--show-toplevel']).toString().trim() !== directory) return { revision: null, fingerprint: null, dirty: null };
    const revision = git(directory, ['rev-parse', 'HEAD']).toString().trim();
    return { revision, ...fingerprint(directory, revision) };
  } catch { return { revision: null, fingerprint: null, dirty: null }; }
}
