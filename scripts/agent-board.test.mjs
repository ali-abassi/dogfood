import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-board-'));
const checkout = join(data, 'checkout'), sessions = join(data, 'sessions'), fake = join(data, 'pal');
mkdirSync(checkout); mkdirSync(sessions);
process.env.DOGFOOD_DATA = data;
process.env.DOGFOOD_PAL_BIN = fake;
process.env.FAKE_PAL_HOME = sessions;
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q'); git('config', 'user.name', 'Board test'); git('config', 'user.email', 'board@example.com');
writeFileSync(join(checkout, 'app.txt'), 'original\n'); git('add', '.'); git('commit', '-qm', 'initial');
writeFileSync(fake, `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process'), path = require('node:path');
const args = process.argv.slice(2), home = process.env.FAKE_PAL_HOME, cmd = args[0];
const option = key => args[args.indexOf(key) + 1];
const name = cmd === 'start' ? option('-n') : args[1], file = path.join(home, name + '.json');
const record = value => { fs.appendFileSync(path.join(home, 'calls.jsonl'), JSON.stringify(value) + '\\n'); };
const save = value => fs.writeFileSync(file, JSON.stringify(value));
if (cmd === 'start') {
  if (fs.existsSync(path.join(home, 'fail-start'))) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150); console.error('Sign in to the selected agent before starting.'); process.exit(1); }
  if (fs.existsSync(file)) { console.error('session already exists'); process.exit(1); }
  const cwd = path.join(home, name); cp.execFileSync('git', ['-C', option('-C'), 'worktree', 'add', cwd, option('--worktree')], {stdio:'ignore'});
  const prompt = fs.readFileSync(option('--file'), 'utf8'); record({cmd, name, prompt, args});
  save({name,cwd,status:'running',turns:[{n:1,status:'running'}]}); console.log(JSON.stringify({session:name,turn:1,status:'running'}));
} else {
  if (!fs.existsSync(file)) { console.error('session does not exist'); process.exit(1); }
  const meta = JSON.parse(fs.readFileSync(file,'utf8'));
  if (cmd === 'say') {
    if (meta.status === 'running') { console.error('already running'); process.exit(1); }
    const prompt = fs.readFileSync(option('--file'), 'utf8'); record({cmd,name,prompt});
    meta.turns.push({n:meta.turns.length+1,status:'running'}); meta.status='running'; save(meta);
    console.log(JSON.stringify({session:name,turn:meta.turns.length,status:'running'}));
  } else if (cmd === 'status') console.log(JSON.stringify(meta));
  else if (cmd === 'read') { if (fs.existsSync(path.join(home, 'fail-read'))) { console.error('Temporary result read failure'); process.exit(1); } console.log(JSON.stringify({session:name,status:meta.status,turn:meta.turns.at(-1),reply:meta.reply || ''})); }
  else if (cmd === 'stop') { if (meta.status === 'running') { meta.status='stopped';meta.turns.at(-1).status='stopped';save(meta); } record({cmd,name});console.log('Stopped'); }
  else process.exit(1);
}
`, { mode: 0o700 });
const store = await import('../lib/store.mjs');
const board = await import('../lib/agent-board.mjs');
store.createProject({ id: 'shop', name: 'Shop', checkout });
store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'save', name: 'Save' }] });
after(() => rmSync(data, { recursive: true, force: true }));
const input = more => ({ title: 'Improve the greeting', request: 'Add a clear greeting, preserve other work.', backend: 'codex', ...more });
const card = id => board.agentBoard('shop').cards.find(item => item.id === id);
const calls = () => { try { return readFileSync(join(sessions, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 20)); await board.dispatchAgentBoard('shop'); if (predicate()) return; }
  assert.fail('Board did not reach the expected state');
}
function finish(id, reply = 'Updated app.txt. Check: git diff --check passed.') {
  const request = card(id), file = join(sessions, `${request.session}.json`), meta = JSON.parse(readFileSync(file, 'utf8'));
  meta.status = 'done'; meta.turns.at(-1).status = 'done'; meta.reply = reply; writeFileSync(file, JSON.stringify(meta));
}

test('cards validate links and backend without launching; the board exposes explicit authentication uncertainty', () => {
  assert.throws(() => board.createAgentCard('shop', input({ backend: 'codex;touch bad' })), /Choose/);
  assert.throws(() => board.createAgentCard('shop', input({ pageId: 'missing' })), /linked page/);
  assert.throws(() => board.createAgentCard('shop', input({ featureId: 'save' })), /linked feature/);
  assert.throws(() => board.createAgentCard('shop', input({ taskId: 'missing' })), /plan task/);
  assert.throws(() => board.createAgentCard('shop', input({ command: 'anything' })), /Unknown/);
  const created = board.createAgentCard('shop', input({ pageId: 'home', featureId: 'save' }));
  assert.equal(created.status, 'todo'); assert.equal(created.queued, false); assert.equal(created.pageId, 'home');
  assert.equal(calls().length, 0);
  assert.match(board.agentBoard('shop').agents[0].reason, /authentication is checked/);
});

test('a request launches once, returns changes for review, and its queued feedback continues the same session in order', async () => {
  const created = board.createAgentCard('shop', input({ start: true }));
  board.runAgentCard('shop', created.id); board.runAgentCard('shop', created.id);
  await until(() => card(created.id).status === 'running' && card(created.id).checkout);
  assert.equal(calls().filter(call => call.name === created.session && call.cmd === 'start').length, 1);
  const original = card(created.id);
  assert.notEqual(original.checkout, checkout); assert.match(original.branch, /^dogfood\//);
  board.commentAgentCard('shop', created.id, { text: 'Use hello instead.', send: true });
  board.commentAgentCard('shop', created.id, { text: 'Keep the existing colour.', send: true });
  assert.equal(card(created.id).pendingCount, 2);
  assert.throws(() => board.completeAgentCard('shop', created.id), /finished request/);
  writeFileSync(join(original.checkout, 'app.txt'), 'hello\n');
  finish(created.id);
  await until(() => calls().filter(call => call.name === created.session && call.cmd === 'say').length === 1 && card(created.id).pendingCount === 0);
  const sent = calls().find(call => call.name === created.session && call.cmd === 'say');
  assert.ok(sent.prompt.indexOf('Use hello') < sent.prompt.indexOf('Keep the existing'));
  assert.equal(card(created.id).pendingCount, 0);
  finish(created.id, 'Both feedback points applied. Local check passed.');
  await until(() => card(created.id).status === 'review');
  assert.equal(card(created.id).turn, 2); assert.ok(card(created.id).changedFiles.includes('app.txt'));
  assert.match(board.agentCardDiff('shop', created.id).diffSummary, /app.txt/);
  assert.equal(card(created.id).comments.filter(entry => entry.by === 'agent').length, 2);
  const done = board.completeAgentCard('shop', created.id); assert.equal(done.status, 'done');
  board.commentAgentCard('shop', created.id, { text: 'For my own notes.', send: false }); assert.equal(card(created.id).status, 'done');
  board.commentAgentCard('shop', created.id, { text: 'Please add one more greeting.', send: true });
  await until(() => calls().filter(call => call.name === created.session && call.cmd === 'say').length === 2);
  finish(created.id); await until(() => card(created.id).status === 'review');
});

function inOtherProcess(source) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env } });
    let error = ''; child.stderr.on('data', data => { error += data; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(error)));
  });
}

test('a fresh server process reconciles the persistent session and user-input requests stay actionable', async () => {
  const created = board.createAgentCard('shop', input({ backend: 'claude', start: true }));
  await until(() => card(created.id).checkout);
  finish(created.id, 'I will inspect the current greeting.\n\nNEEDS_INPUT: Which greeting should this use?');
  await inOtherProcess(`import { dispatchAgentBoard } from ${JSON.stringify(new URL('../lib/agent-board.mjs', import.meta.url).href)}; await dispatchAgentBoard('shop');`);
  assert.equal(card(created.id).status, 'attention'); assert.match(card(created.id).result, /Which greeting/);
  board.commentAgentCard('shop', created.id, { text: 'Use hello.', send: true });
  await until(() => calls().some(call => call.name === created.session && call.cmd === 'say'));
  board.stopAgentCard('shop', created.id);
  await until(() => !card(created.id).stopRequested && card(created.id).status === 'attention');
  assert.match(card(created.id).error, /Stopped by you/);
});

test('simultaneous cross-process dispatch cannot start the same card twice', async () => {
  const created = board.createAgentCard('shop', input());
  // Persist the user action through the public API, then race independent dispatcher processes.
  board.runAgentCard('shop', created.id);
  const script = `import { dispatchAgentBoard } from ${JSON.stringify(new URL('../lib/agent-board.mjs', import.meta.url).href)}; await dispatchAgentBoard('shop');`;
  await Promise.all([inOtherProcess(script), inOtherProcess(script)]);
  await until(() => card(created.id).checkout);
  assert.equal(calls().filter(call => call.name === created.session && call.cmd === 'start').length, 1);
  finish(created.id); await until(() => card(created.id).status === 'review');
});

function interruptedOperation(id, expectedTurn) {
  const file = join(data, 'agent-board', 'shop.json'), document = JSON.parse(readFileSync(file, 'utf8'));
  const request = document.cards.find(item => item.id === id);
  request.operation = { token: 'interrupted-fixture', kind: 'say', at: new Date(Date.now() - 120_000).toISOString(), commentIds: [...request.pending], expectedTurn };
  request.status = 'running'; request.queued = false; writeFileSync(file, JSON.stringify(document));
}

test('an interrupted send retains feedback and a manual retry delivers it exactly once', async () => {
  const created = board.createAgentCard('shop', input({ start: true }));
  await until(() => card(created.id).checkout);
  finish(created.id); await until(() => card(created.id).status === 'review');
  board.commentAgentCard('shop', created.id, { text: 'Recover this exact feedback.', send: true });
  interruptedOperation(created.id, 2);
  await until(() => card(created.id).status === 'attention');
  assert.equal(card(created.id).pendingCount, 1);
  assert.throws(() => board.completeAgentCard('shop', created.id), /no queued feedback/);
  board.runAgentCard('shop', created.id);
  await until(() => card(created.id).pendingCount === 0 && card(created.id).status === 'running');
  assert.equal(calls().filter(call => call.name === created.session && call.cmd === 'say').length, 1);
  assert.match(calls().find(call => call.name === created.session && call.cmd === 'say').prompt, /Recover this exact feedback/);
  finish(created.id); await until(() => card(created.id).status === 'review');
});

test('authentication refusal is actionable, preserves the request, and retries without shell interpretation', async () => {
  writeFileSync(join(sessions, 'fail-start'), 'yes');
  const created = board.createAgentCard('shop', input({ title: 'Literal $(touch never)', start: true }));
  await until(() => card(created.id).status === 'attention');
  assert.match(card(created.id).error, /Sign in/); assert.equal(card(created.id).request, input().request);
  rmSync(join(sessions, 'fail-start'));
  board.runAgentCard('shop', created.id);
  await until(() => Boolean(card(created.id).checkout));
  const launched = calls().find(call => call.name === created.session && call.cmd === 'start');
  assert.match(launched.prompt, /Literal \$\(touch never\)/); assert.ok(!launched.args.includes('touch'));
  board.commentAgentCard('shop', created.id, { text: 'Keep this feedback after stopping.', send: true });
  board.stopAgentCard('shop', created.id);
  await until(() => !card(created.id).stopRequested && card(created.id).status === 'attention');
  assert.equal(card(created.id).pendingCount, 1);
  board.runAgentCard('shop', created.id);
  await until(() => card(created.id).pendingCount === 0 && card(created.id).status === 'running');
  finish(created.id); await until(() => card(created.id).status === 'review');
});

test('stop racing a refused first start clears its reservation and the request can be closed or retried', async () => {
  writeFileSync(join(sessions, 'fail-start'), 'yes');
  const created = board.createAgentCard('shop', input({ start: true }));
  await until(() => card(created.id).starting);
  board.stopAgentCard('shop', created.id);
  await until(() => card(created.id).status === 'attention' && !card(created.id).starting);
  assert.equal(card(created.id).stopRequested, false);
  assert.match(card(created.id).error, /Sign in/);
  assert.equal(board.completeAgentCard('shop', created.id).status, 'done');
  rmSync(join(sessions, 'fail-start'));
  board.reopenAgentCard('shop', created.id); board.runAgentCard('shop', created.id);
  await until(() => Boolean(card(created.id).checkout));
  finish(created.id); await until(() => card(created.id).status === 'review');
});

test('stop preserves an unread result when the agent finished just before the stop', async () => {
  const created = board.createAgentCard('shop', input({ start: true }));
  await until(() => Boolean(card(created.id).checkout));
  finish(created.id, 'The completed change survived the stop race.');
  board.stopAgentCard('shop', created.id);
  await until(() => !card(created.id).stopRequested && card(created.id).status === 'attention');
  assert.equal(card(created.id).turn, 1);
  assert.equal(card(created.id).result, 'The completed change survived the stop race.');
  assert.equal(card(created.id).comments.filter(entry => entry.by === 'agent').length, 1);
  assert.equal(board.completeAgentCard('shop', created.id).status, 'done');
});

test('a transient PAL read failure keeps the turn unread and is retried without placeholder results', async () => {
  const created = board.createAgentCard('shop', input({ start: true }));
  await until(() => Boolean(card(created.id).checkout));
  writeFileSync(join(sessions, 'fail-read'), 'yes');
  finish(created.id, 'The actual agent result after transport recovery.');
  await until(() => card(created.id).error.includes('Could not fetch the finished result'));
  assert.equal(card(created.id).turn, 0); assert.equal(card(created.id).result, '');
  assert.equal(card(created.id).comments.filter(entry => entry.by === 'agent').length, 0);
  rmSync(join(sessions, 'fail-read'));
  await until(() => card(created.id).status === 'review');
  assert.equal(card(created.id).turn, 1);
  assert.equal(card(created.id).result, 'The actual agent result after transport recovery.');
  assert.equal(card(created.id).comments.filter(entry => entry.by === 'agent').length, 1);
});

test('explicit discard preserves queued comment history and permits closing an abandoned request', async () => {
  const created = board.createAgentCard('shop', input({ start: true }));
  await until(() => Boolean(card(created.id).checkout));
  board.commentAgentCard('shop', created.id, { text: 'A request I will abandon, but retain in history.', send: true });
  assert.throws(() => board.discardAgentFeedback('shop', created.id), /Stop the agent/);
  board.stopAgentCard('shop', created.id);
  await until(() => !card(created.id).stopRequested && card(created.id).status === 'attention');
  assert.throws(() => board.completeAgentCard('shop', created.id), /no queued feedback/);
  const discarded = board.discardAgentFeedback('shop', created.id);
  assert.equal(discarded.pendingCount, 0); assert.equal(discarded.queued, false);
  const retained = discarded.comments.find(entry => entry.text.startsWith('A request I will abandon'));
  assert.ok(retained.discardedAt);
  assert.equal(board.completeAgentCard('shop', created.id).status, 'done');
});
