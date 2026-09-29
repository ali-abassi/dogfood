import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-cli-'));
const checkout = mkdtempSync(join(tmpdir(), 'dogfood-cli-repo-'));
const cli = resolve('bin/dogfood.mjs');
const env = { ...process.env, DOGFOOD_DATA: data };
const actor = ['--agent', 'codex'];
const project = ['--project', 'fresh'];
after(() => { rmSync(data, { recursive: true, force: true }); rmSync(checkout, { recursive: true, force: true }); });

writeFileSync(join(checkout, 'check.mjs'), 'import { readFileSync } from "node:fs"; if (readFileSync("saved.txt", "utf8") !== "saved") process.exit(1);\n');
writeFileSync(join(checkout, 'saved.txt'), 'saved');
execFileSync('git', ['init', '-q', checkout]);
execFileSync('git', ['-C', checkout, 'add', '.']);
execFileSync('git', ['-C', checkout, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'baseline']);

function call(args, input) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: checkout, env, encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input) });
}

function ok(args, input) {
  const run = call([...args, '--json'], input);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

const task = { id: 'save', title: 'Persist the saved result', outcome: 'The saved result remains available to the next session.', scope: ['saved.txt'], checks: [{ id: 'saved', command: [process.execPath, 'check.mjs'] }] };

test('CLI help and symlinked executable work before any project exists', () => {
  assert.match(call(['--help']).stdout, /dogfood init/);
  const linked = join(data, 'dogfood');
  symlinkSync(cli, linked);
  const run = spawnSync(process.execPath, [linked, '--help'], { cwd: checkout, env, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /dogfood context/);
});

test('checkout-only init is idempotent and discovers the current project', () => {
  const initialized = ok(['init', '--checkout', checkout, '--id', 'fresh', '--name', 'Fresh']);
  assert.equal(initialized.source.url, null);
  assert.equal(ok(['init', '--checkout', checkout, '--id', 'fresh']).project, 'fresh');
  assert.equal(ok(['context']).project.id, 'fresh');
  assert.equal(ok(['doctor', ...project]).data.writable, true);
  assert.equal(ok(['doctor', ...project]).checkout.revisionAvailable, true);
  const noPages = call(['gate', ...project, '--json']);
  assert.equal(noPages.status, 1);
  assert.match(JSON.parse(noPages.stdout).lines[0], /no pages/);
  mkdirSync(join(checkout, 'src'));
  const nested = spawnSync(process.execPath, [cli, 'context', '--json'], { cwd: join(checkout, 'src'), env, encoding: 'utf8' });
  assert.equal(nested.status, 0, nested.stderr);
  assert.equal(JSON.parse(nested.stdout).project.id, 'fresh');
  const resumed = spawnSync(process.execPath, [cli, 'init', '--checkout', '.', '--json'], { cwd: join(checkout, 'src'), env, encoding: 'utf8' });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.equal(JSON.parse(resumed.stdout).project, 'fresh');
});

test('stdin schema-backed task loop resumes in separate CLI processes', () => {
  assert.ok(ok(['schema', 'dogfood_add_task']).inputSchema.properties.input);
  ok(['task', 'add', '--input', '-', ...actor], task);
  const next = ok(['next']);
  assert.equal(next.next.id, 'save');
  assert.deepEqual(next.next.scope, ['saved.txt']);
  assert.equal(ok(['task', 'claim', 'save', ...actor]).owner, 'codex');
  assert.equal(ok(['verify', 'save', ...actor]).passed, true);
  assert.equal(ok(['task', 'accept', 'save', ...actor]).status, 'accepted');
  assert.equal(ok(['context']).next, null);
  assert.equal(ok(['context']).summary.accepted, 1);
});

test('failed checks have exit 1 and stale source cannot be accepted', () => {
  const input = { ...task, id: 'recheck' };
  ok(['task', 'add', '--input', '-', ...actor], input);
  ok(['task', 'claim', 'recheck', ...actor]);
  writeFileSync(join(checkout, 'saved.txt'), 'broken');
  const failed = call(['verify', 'recheck', ...actor, '--json']);
  assert.equal(failed.status, 1);
  assert.equal(JSON.parse(failed.stdout).passed, false);
  assert.notEqual(call(['task', 'accept', 'recheck', ...actor]).status, 0);
  writeFileSync(join(checkout, 'saved.txt'), 'saved');
  ok(['verify', 'recheck', ...actor]);
  writeFileSync(join(checkout, 'server.txt'), 'backend-only change');
  assert.match(call(['task', 'accept', 'recheck', ...actor]).stderr, /changed since verification/);
});

test('fresh-agent handoff records blockers and release without overwriting owners', () => {
  ok(['task', 'update', 'recheck', ...actor, '--input', '-'], { status: 'blocked', blocker: 'Need backend review', handoff: 'The browser flow works; inspect server.txt before rerunning.', releaseOwner: true });
  const context = ok(['context']);
  assert.equal(context.blocked[0].id, 'recheck');
  assert.match(context.blocked[0].handoff, /server.txt/);
  assert.equal(context.latestHandoff, null);
  assert.equal(context.blocked[0].owner, null);
  assert.equal(JSON.parse(readFileSync(join(data, 'workflows/fresh.json'), 'utf8')).tasks.length, 2);
});


test('remote checkout declarations persist only for the configured URL', () => {
  assert.equal(ok(['attach-url', 'https://preview.example.test', '--serves-checkout']).source.servesCheckout, true);
  assert.equal(ok(['attach-url', 'https://other.example.test']).source.servesCheckout, undefined);
});
