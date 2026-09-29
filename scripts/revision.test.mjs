import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { checkoutRevision } from '../lib/revision.mjs';

const root = mkdtempSync(join(tmpdir(), 'dogfood-revision-'));
after(() => rmSync(root, { recursive: true, force: true }));

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { stdio: 'pipe' });
}

function commit(directory, message) {
  git(directory, 'add', '-A');
  git(directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', message);
}

test('fingerprint uses tracked diffs, nonignored untracked bytes, and submodule state', () => {
  const module = join(root, 'module');
  const parent = join(root, 'parent');
  mkdirSync(module);
  mkdirSync(parent);
  git(module, 'init', '-q');
  writeFileSync(join(module, 'part.txt'), 'one\n');
  commit(module, 'module');
  git(parent, 'init', '-q');
  writeFileSync(join(parent, 'app.txt'), 'one\n');
  commit(parent, 'app');
  git(parent, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', module, 'dep');
  commit(parent, 'add submodule');

  const clean = checkoutRevision(parent);
  assert.ok(clean.revision && clean.fingerprint);
  assert.equal(clean.dirty, false);
  writeFileSync(join(parent, 'app.txt'), 'two\n');
  const tracked = checkoutRevision(parent);
  assert.notEqual(tracked.fingerprint, clean.fingerprint);
  assert.equal(tracked.dirty, true);
  writeFileSync(join(parent, 'new.txt'), 'untracked\n');
  const untracked = checkoutRevision(parent);
  assert.notEqual(untracked.fingerprint, tracked.fingerprint);
  writeFileSync(join(parent, '.git', 'info', 'exclude'), 'ignored/\n');
  mkdirSync(join(parent, 'ignored'));
  writeFileSync(join(parent, 'ignored', 'bundle.js'), 'generated');
  assert.equal(checkoutRevision(parent).fingerprint, untracked.fingerprint);
  writeFileSync(join(parent, 'dep', 'part.txt'), 'module edit\n');
  assert.notEqual(checkoutRevision(parent).fingerprint, untracked.fingerprint);
});
