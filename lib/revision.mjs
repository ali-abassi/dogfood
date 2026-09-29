import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}

// Tracked content comes from Git's diff; only nonignored untracked files need a direct read.
// A submodule appears in the diff as a gitlink change, including a dirty marker when applicable.
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
  return { fingerprint: digest.digest('hex'), dirty: Boolean(diff.length || names.length) };
}

export function checkoutRevision(checkout) {
  try {
    const directory = realpathSync(resolve(checkout));
    if (git(directory, ['rev-parse', '--show-toplevel']).toString().trim() !== directory) return { revision: null, fingerprint: null, dirty: null };
    const revision = git(directory, ['rev-parse', 'HEAD']).toString().trim();
    return { revision, ...fingerprint(directory, revision) };
  } catch { return { revision: null, fingerprint: null, dirty: null }; }
}
