import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-tasks-'));
const checkout = join(data, 'checkout');
mkdirSync(checkout);
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const tasks = await import('../lib/tasks.mjs');
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'Test');
writeFileSync(join(checkout, 'backend.js'), 'export const value = 1;\n');
git('add', 'backend.js');
git('commit', '-qm', 'initial');
store.createProject({ id: 'shop', name: 'Shop', url: 'https://example.com', checkout });
store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/' });
after(() => rmSync(data, { recursive: true, force: true }));

const input = (id, more = {}) => ({ id, title: `Deliver ${id}`, outcome: `The ${id} outcome works.`, scope: ['backend'], dependencies: [], pageIds: [], priority: 2, checks: [{ id: 'works', command: [process.execPath, '-e', 'process.exit(0)'] }], ...more });

test('a planned task has deterministic next ordering and validates pages and dependencies', () => {
  assert.throws(() => tasks.addTask('shop', input('bad-page', { pageIds: ['missing'], look: 'Visible' }), 'alice'), /Page missing/);
  assert.throws(() => tasks.addTask('shop', input('bad-dep', { dependencies: ['unknown'] }), 'alice'), /Dependency unknown/);
  tasks.addTask('shop', input('later', { priority: 3 }), 'alice');
  tasks.addTask('shop', input('first', { priority: 0 }), 'alice');
  assert.equal(tasks.workflow('shop').next.id, 'first');
  assert.throws(() => tasks.updateTask('shop', 'first', { dependencies: ['first'] }, 'alice'), /itself/);
  tasks.updateTask('shop', 'later', { dependencies: ['first'] }, 'alice');
  assert.throws(() => tasks.updateTask('shop', 'first', { dependencies: ['later'] }, 'alice'), /cycle/);
  tasks.updateTask('shop', 'later', { dependencies: [] }, 'alice');
});

test('dependencies and ownership govern claims; blocked handoff appears in fresh context', () => {
  tasks.addTask('shop', input('dependent', { dependencies: ['later'] }), 'alice');
  assert.throws(() => tasks.claimTask('shop', 'dependent', 'alice'), /dependencies/);
  tasks.claimTask('shop', 'later', 'alice');
  assert.throws(() => tasks.updateTask('shop', 'later', { handoff: 'Wrong owner' }, 'bob'), /Another owner/);
  tasks.updateTask('shop', 'later', { status: 'blocked', blocker: 'Waiting for fixture', handoff: 'Resume from the backend fixture', releaseOwner: true }, 'alice');
  const packet = tasks.context('shop');
  assert.equal(packet.blocked[0].blocker, 'Waiting for fixture');
  assert.deepEqual(packet.blocked[0].scope, ['backend']);
  assert.equal(packet.blocked[0].handoff, 'Resume from the backend fixture');
  assert.ok(packet.blocked[0].handoffAt);
  assert.equal(packet.latestHandoff, null);
  assert.deepEqual(packet.project.source, { url: 'https://example.com', environment: 'Live site', checkout });
  assert.equal(packet.steps.verify, 'dogfood verify TASK --project shop --agent NAME');
  assert.equal(packet.steps.accept, 'dogfood task accept TASK --project shop --agent NAME');
  assert.equal(packet.next.id, 'first');
  tasks.updateTask('shop', 'dependent', { handoff: 'Dependency needs a separate design pass.' }, 'alice');
  assert.equal(tasks.context('shop').latestHandoff, 'Dependency needs a separate design pass.');
  tasks.updateTask('shop', 'later', { handoff: 'A newer blocked handoff is visible.' }, 'alice');
  const latestPacket = tasks.context('shop');
  assert.equal(latestPacket.latestHandoff, null);
  assert.equal(latestPacket.blocked[0].handoff, 'A newer blocked handoff is visible.');
  assert.ok(Date.parse(latestPacket.blocked[0].handoffAt) > Date.parse(tasks.workflow('shop').tasks.find(task => task.id === 'dependent').handoffAt));
  tasks.updateTask('shop', 'later', { status: 'todo', blocker: '' }, 'alice');
});

test('todo clears ownership, while another actor needs an explicit recorded recovery', async () => {
  tasks.addTask('shop', input('reset-owner'), 'alice');
  tasks.claimTask('shop', 'reset-owner', 'alice');
  tasks.updateTask('shop', 'reset-owner', { status: 'todo' }, 'alice');
  assert.equal(tasks.workflow('shop').tasks.find(task => task.id === 'reset-owner').owner, null);
  tasks.claimTask('shop', 'reset-owner', 'bob');
  await tasks.verifyTask('shop', 'reset-owner', 'bob');
  assert.throws(() => tasks.updateTask('shop', 'reset-owner', { releaseOwner: true }, 'carol'), /Recovery reason/);
  assert.throws(() => tasks.updateTask('shop', 'reset-owner', { releaseOwner: true, recoveryReason: 'A takeover with a plan edit', outcome: 'Wrong' }, 'carol'), /Another owner/);
  const recovered = tasks.updateTask('shop', 'reset-owner', { releaseOwner: true, recoveryReason: 'Bob stopped working and handed this back.' }, 'carol');
  assert.equal(recovered.owner, null);
  assert.equal(recovered.status, 'todo');
  assert.equal(recovered.receipt, null);
  assert.deepEqual(recovered.recoveries.at(-1), { at: recovered.recoveries.at(-1).at, by: 'carol', from: 'bob', status: 'doing', reason: 'Bob stopped working and handed this back.' });
  tasks.claimTask('shop', 'reset-owner', 'carol');
  tasks.updateTask('shop', 'reset-owner', { status: 'blocked', blocker: 'Waiting for a safe fixture.' }, 'carol');
  const blockedRecovery = tasks.updateTask('shop', 'reset-owner', { releaseOwner: true, recoveryReason: 'Carol stopped while the fixture is pending.' }, 'dana');
  assert.equal(blockedRecovery.status, 'blocked');
  assert.equal(blockedRecovery.owner, null);
  assert.equal(blockedRecovery.recoveries.length, 2);
});

test('two processes cannot claim the same task', async () => {
  tasks.addTask('shop', input('race'), 'alice');
  const script = `import { claimTask } from ${JSON.stringify(new URL('../lib/tasks.mjs', import.meta.url).href)}; try { claimTask('shop', 'race', process.argv[1]); process.stdout.write('claimed'); } catch (error) { process.stdout.write(String(error.status)); }`;
  const run = actor => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, actor], { env: { ...process.env, DOGFOOD_DATA: data } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Child exited ${code}`)));
  });
  assert.deepEqual((await Promise.all([run('alice'), run('bob')])).sort(), ['409', 'claimed']);
  assert.ok(['alice', 'bob'].includes(tasks.workflow('shop').tasks.find(task => task.id === 'race').owner));
});

test('two processes adding unnamed tasks receive unique stable IDs', async () => {
  const script = `import { addTask } from ${JSON.stringify(new URL('../lib/tasks.mjs', import.meta.url).href)}; const task = addTask('shop', { title: 'Generated task', outcome: 'A generated ID is stored.', checks: [{ id: 'check', command: ['true'] }] }, process.argv[1]); process.stdout.write(task.id);`;
  const run = actor => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, actor], { env: { ...process.env, DOGFOOD_DATA: data } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Child exited ${code}`)));
  });
  const ids = await Promise.all([run('alice'), run('bob')]);
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every(id => /^task-\d+$/.test(id)));
});

test('failed checks persist failure and cannot be accepted', async () => {
  tasks.addTask('shop', input('failure', { checks: [{ id: 'fails', command: [process.execPath, '-e', 'process.exit(7)'] }] }), 'alice');
  tasks.claimTask('shop', 'failure', 'alice');
  const receipt = await tasks.verifyTask('shop', 'failure', 'alice');
  assert.equal(receipt.passed, false);
  assert.equal(receipt.checks[0].exitCode, 7);
  assert.throws(() => tasks.acceptTask('shop', 'failure', 'alice'), /passing check receipt/);
});

test('backend source changes invalidate a passing receipt; recheck and no-op edit preserve it', async () => {
  tasks.addTask('shop', input('backend'), 'alice');
  tasks.claimTask('shop', 'backend', 'alice');
  assert.equal((await tasks.verifyTask('shop', 'backend', 'alice')).passed, true);
  assert.equal(tasks.context('shop').claimed.find(task => task.id === 'backend').receipt.current, true);
  assert.ok(tasks.context('shop').project.checkoutFingerprint);
  tasks.updateTask('shop', 'backend', { title: 'Deliver backend' }, 'alice');
  assert.equal(tasks.workflow('shop').tasks.find(task => task.id === 'backend').receipt.passed, true);
  writeFileSync(join(checkout, 'backend.js'), 'export const value = 2;\n');
  assert.equal(tasks.context('shop').claimed.find(task => task.id === 'backend').receipt.current, false);
  assert.throws(() => tasks.acceptTask('shop', 'backend', 'alice'), /Checkout changed/);
  assert.equal((await tasks.verifyTask('shop', 'backend', 'alice')).passed, true);
  assert.equal(tasks.acceptTask('shop', 'backend', 'alice').status, 'accepted');
  tasks.updateTask('shop', 'backend', { outcome: 'The backend outcome changed.' }, 'alice');
  const revised = tasks.workflow('shop').tasks.find(task => task.id === 'backend');
  assert.equal(revised.status, 'todo');
  assert.equal(revised.receipt, null);
});

test('named pages require accepted QA even when checks pass', async () => {
  tasks.addTask('shop', input('page', { pageIds: ['home'], look: 'Home is legible at 1280 and 390 pixels.' }), 'alice');
  tasks.claimTask('shop', 'page', 'alice');
  assert.equal((await tasks.verifyTask('shop', 'page', 'alice')).passed, true);
  assert.throws(() => tasks.acceptTask('shop', 'page', 'alice'), /Pages are not accepted/);
});

test('editing an accepted prerequisite reopens its accepted dependents', async () => {
  tasks.addTask('shop', input('foundation'), 'alice');
  tasks.addTask('shop', input('journey', { dependencies: ['foundation'] }), 'alice');
  tasks.claimTask('shop', 'foundation', 'alice');
  await tasks.verifyTask('shop', 'foundation', 'alice');
  tasks.acceptTask('shop', 'foundation', 'alice');
  tasks.claimTask('shop', 'journey', 'alice');
  await tasks.verifyTask('shop', 'journey', 'alice');
  tasks.acceptTask('shop', 'journey', 'alice');
  tasks.updateTask('shop', 'foundation', { title: 'Retitled foundation', priority: 0 }, 'alice');
  const cosmetic = tasks.workflow('shop').tasks.find(task => task.id === 'foundation');
  assert.equal(cosmetic.status, 'accepted');
  assert.equal(cosmetic.receipt.passed, true);
  assert.deepEqual(cosmetic.reopens, []);
  tasks.updateTask('shop', 'foundation', { outcome: 'Foundation now has a stricter outcome.' }, 'alice');
  const byId = Object.fromEntries(tasks.workflow('shop').tasks.map(task => [task.id, task]));
  assert.deepEqual([byId.foundation.status, byId.journey.status], ['todo', 'todo']);
  assert.equal(byId.journey.receipt, null);
  assert.equal(byId.foundation.reopens.at(-1).by, 'alice');
  assert.match(byId.journey.reopens.at(-1).reason, /Dependency foundation/);
  assert.throws(() => tasks.claimTask('shop', 'journey', 'alice'), /dependencies/);
});

test('checks keep a bounded output tail and report timeout failures', async () => {
  assert.throws(() => tasks.addTask('shop', input('bad-timeout', { checks: [{ id: 'bad', command: ['true'], timeoutSeconds: 1801 }] }), 'alice'), /timeoutSeconds/);
  tasks.addTask('shop', input('bounded-check', { checks: [
    { id: 'large', command: [process.execPath, '-e', "process.stdout.write('x'.repeat(100000) + 'END')"], timeoutSeconds: 5 },
    { id: 'hang', command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'], timeoutSeconds: 1 },
  ] }), 'alice');
  tasks.claimTask('shop', 'bounded-check', 'alice');
  const receipt = await tasks.verifyTask('shop', 'bounded-check', 'alice');
  assert.equal(receipt.checks[0].exitCode, 0);
  assert.ok(receipt.checks[0].stdout.length <= 64_000);
  assert.ok(receipt.checks[0].stdout.endsWith('END'));
  assert.equal(receipt.checks[1].timedOut, true);
  assert.match(receipt.checks[1].errorReason, /Timed out after 1 seconds/);
  assert.equal(receipt.passed, false);
});

test('a check that changes checkout source cannot verify itself', async () => {
  const rewrite = `require('node:fs').writeFileSync('backend.js', 'export const value = 3;\\n')`;
  tasks.addTask('shop', input('mutating-check', { checks: [{ id: 'rewrite', command: [process.execPath, '-e', rewrite] }] }), 'alice');
  tasks.claimTask('shop', 'mutating-check', 'alice');
  const receipt = await tasks.verifyTask('shop', 'mutating-check', 'alice');
  assert.equal(receipt.sourceChanged, true);
  assert.equal(receipt.passed, false);
  assert.throws(() => tasks.acceptTask('shop', 'mutating-check', 'alice'), /passing check receipt/);
});
