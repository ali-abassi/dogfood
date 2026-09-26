import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { pagesGate } from '../lib/completion.mjs';

const page = (name, complete) => ({
  name,
  progress: { complete, status: complete ? 'pass' : 'in_review', requirements: [{ id: 'scan', met: complete, missing: 'Check the page.' }] },
});

function gate(...args) {
  return spawnSync(process.execPath, ['scripts/gate.mjs', ...args], { env: { ...process.env, DOGFOOD_DATA: 'demo' }, encoding: 'utf8' });
}

test('the gate passes only when every page is complete', () => {
  assert.deepEqual(pagesGate([page('Home', true)]), { complete: true, lines: ['✓ Home: complete (pass)'] });
  const mixed = pagesGate([page('Home', true), page('Book', false)]);
  assert.equal(mixed.complete, false);
  assert.deepEqual(mixed.lines.slice(1), ['✗ Book: in_review', '  - scan: Check the page.']);
  assert.equal(pagesGate([]).complete, false);
});

test('the command exits 1 with the missing evidence for an incomplete page', () => {
  const result = gate('tidepool', 'classes');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /✗ .*: in_review\n {2}- ease: /);
});

test('the command exits 2 for a wrong request', () => {
  assert.equal(gate().status, 2);
  const unknown = gate('tidepool', 'nowhere');
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Page nowhere does not exist in tidepool/);
});
