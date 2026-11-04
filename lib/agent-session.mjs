import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

function git(directory, ...args) { return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim(); }
function repository(directory) {
  const path = realpathSync(directory);
  if (realpathSync(git(path, 'rev-parse', '--show-toplevel')) !== path) throw new Error('PAL checkout is not an exact Git worktree root.');
  return realpathSync(git(path, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
}
export function validateSessionCheckout(card, meta, source) {
  if (meta.name !== card.session) throw new Error('PAL status belongs to a different session. Feedback remains queued.');
  if (!meta.cwd) throw new Error('PAL did not identify its isolated worktree. Feedback remains queued.');
  const path = realpathSync(meta.cwd), original = realpathSync(source);
  if (path === original || repository(path) !== repository(original)) throw new Error('PAL checkout is not an isolated worktree of this project. Feedback remains queued.');
  validateRequestWorktree(card, path, original);
  return path;
}
function validateRequestWorktree(card, path, source) {
  if (card.checkout && realpathSync(card.checkout) !== path) throw new Error('PAL changed this request worktree unexpectedly. Feedback remains queued.');
  if (git(path, 'symbolic-ref', '--short', 'HEAD') !== card.branch) throw new Error('PAL worktree is not on this request branch. Feedback remains queued.');
  const registered = git(source, 'worktree', 'list', '--porcelain', '-z').split('\0').filter(line => line.startsWith('worktree ')).map(line => realpathSync(line.slice(9)));
  if (!registered.includes(path)) throw new Error('PAL worktree is not registered in the source repository. Feedback remains queued.');
}
export function validSessionTurn(meta, expected) { return meta.turns.length === expected && meta.turns.at(-1)?.n === expected; }
