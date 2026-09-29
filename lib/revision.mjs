import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';

function git(checkout, args) {
  return execFileSync('git', ['-C', checkout, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

// The fingerprint covers HEAD and the bytes of tracked and nonignored untracked files. It never
// exposes a path or file content to callers, and Git's own ignore rules keep build output out.
function fileBytes(file) {
  try {
    return lstatSync(file).isSymbolicLink() ? readlinkSync(file) : readFileSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '<deleted>';
  }
}

function fingerprint(directory, revision) {
  const names = git(directory, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean).sort();
  const digest = createHash('sha256').update(revision);
  for (const name of names) digest.update('\0').update(name).update('\0').update(fileBytes(resolve(directory, name)));
  return digest.digest('hex');
}

export function checkoutRevision(checkout) {
  try {
    const directory = resolve(checkout);
    if (git(directory, ['rev-parse', '--show-toplevel']).toString().trim() !== directory) return { revision: null, fingerprint: null, dirty: null };
    const revision = git(directory, ['rev-parse', 'HEAD']).toString().trim();
    return { revision, fingerprint: fingerprint(directory, revision), dirty: Boolean(git(directory, ['status', '--porcelain', '-z', '--untracked-files=normal']).length) };
  } catch { return { revision: null, fingerprint: null, dirty: null }; }
}
