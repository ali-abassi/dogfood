import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-delivery-'));
process.env.DOGFOOD_DATA = data;
process.env.FAKE_DELIVERY_DATA = data;
process.env.DOGFOOD_PAL_BIN = join(data, 'pal');
writeFileSync(process.env.DOGFOOD_PAL_BIN, `#!/usr/bin/env node
const fs=require('node:fs'), cp=require('node:child_process'), path=require('node:path');
const a=process.argv.slice(2), opt=k=>a[a.indexOf(k)+1], cmd=a[0], name=cmd==='start'?opt('-n'):a[1];
const file=path.join(process.env.FAKE_DELIVERY_DATA,name+'.json');
if(cmd==='start') {
 const cwd=path.join(process.env.FAKE_DELIVERY_DATA,name);
 cp.execFileSync('git',['-C',opt('-C'),'worktree','add',cwd,opt('--worktree')],{stdio:'ignore'});
 const meta={name,status:'running',cwd,turns:[{n:1,status:'running'}],prompt:fs.readFileSync(opt('--file'),'utf8')};
 fs.writeFileSync(file,JSON.stringify(meta));
 fs.appendFileSync(path.join(process.env.FAKE_DELIVERY_DATA,'launches'),name+'\\n');
 console.log(JSON.stringify({session:name,turn:1}));
} else {
 const m=JSON.parse(fs.readFileSync(file));
 if(cmd==='status') { if(m.failStatus) {console.error('Status service unavailable');process.exit(1);} console.log(JSON.stringify(m)); }
 else if(cmd==='read') { if(m.failRead) {console.error('Result service unavailable');process.exit(1);} console.log(JSON.stringify({session:name,turn:m.turns.at(-1),reply:m.reply})); }
 else if(cmd==='stop') {m.status='stopped';m.turns.at(-1).status='stopped';fs.writeFileSync(file,JSON.stringify(m));}
 else process.exit(1);
}
`, { mode: 0o700 });
const store = await import('../lib/store.mjs');
const tasks = await import('../lib/tasks.mjs');
const board = await import('../lib/agent-board.mjs');
const { workflowTools } = await import('../lib/workflow-tools.mjs');
const { cardDelivery } = await import('../lib/board-delivery.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

function project(id) {
  const checkout = join(data, id); mkdirSync(checkout);
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(checkout, 'app.txt'), 'original'); git('add', '.'); git('commit', '-qm', 'Initial');
  store.createProject({ id, name: `Fixture ${id}`, checkout });
  return { id, checkout };
}
function task(id, taskId = 'change', extra = {}) {
  return tasks.addTask(id, { id: taskId, title: `Task ${taskId}`, outcome: 'The app text is readable.', checks: [{ id: 'read', command: ['node', '-e', 'require("fs").readFileSync("app.txt")'] }], ...extra }, 'fixture');
}
function request(id, extra = {}) { return board.createAgentCard(id, { title: 'Inspect the app', request: 'Implement the linked outcome and check it.', backend: 'codex', ...extra }); }
function card(id, requestId) { return board.agentBoard(id).cards.find(item => item.id === requestId); }
function meta(request, update = {}) {
  const file = join(data, `${request.session}.json`);
  const value = { ...JSON.parse(readFileSync(file)), ...update }; writeFileSync(file, JSON.stringify(value)); return value;
}
async function until(id, predicate) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    await board.dispatchAgentBoard(id);
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Expected board state was not reached');
}
async function start(id, input = {}) {
  const value = request(id, { ...input, start: true });
  await until(id, () => Boolean(card(id, value.id).checkout));
  return card(id, value.id);
}
async function finish(id, request, update = {}) {
  meta(request, { status: 'done', turns: [{ n: 1, status: 'done' }], reply: 'Finished local work. Ready for independent review.', ...update });
  await until(id, () => card(id, request.id).status === 'review');
  return card(id, request.id);
}

test('unlinked conversations and page QA do not become accepted tasks', () => {
  const p = project('unlinked');
  const value = request(p.id);
  assert.equal(card(p.id, value.id).delivery.state, 'unlinked');
  assert.equal(card(p.id, value.id).delivery.label, 'Task not linked');
  store.registerPage(p.id, { id: 'home', name: 'Home', group: 'App', route: '/' });
  const qa = request(p.id, { intent: 'qa', pageId: 'home' });
  assert.equal(card(p.id, qa.id).delivery.label, 'Page review');
  assert.equal(board.agentBoard(p.id).deliverySummary.accepted, 0);
});

test('linked build launch rejects blocked dependencies, explicit blockers and other owners', () => {
  const p = project('eligibility'); task(p.id, 'before'); task(p.id, 'after', { dependencies: ['before'] });
  const dependent = request(p.id, { taskId: 'after' });
  assert.throws(() => board.runAgentCard(p.id, dependent.id), /Finish dependencies first: Task before/);
  assert.equal(card(p.id, dependent.id).delivery.launch.allowed, false);
  tasks.updateTask(p.id, 'before', { status: 'blocked', blocker: 'A test account is required.' }, 'fixture');
  assert.throws(() => request(p.id, { taskId: 'before', start: true }), /test account is required/);
  tasks.updateTask(p.id, 'before', { status: 'todo' }, 'fixture'); tasks.claimTask(p.id, 'before', 'other-worker');
  const owned = request(p.id, { taskId: 'before' });
  assert.throws(() => board.runAgentCard(p.id, owned.id), /owned by other-worker/);
  assert.equal(board.agentBoard(p.id).readyTasks.length, 0);
});

test('two requests cannot launch the same task; the claim survives completed conversation review', async () => {
  const p = project('claim'); task(p.id);
  const first = request(p.id, { taskId: 'change' }), second = request(p.id, { taskId: 'change' });
  board.runAgentCard(p.id, first.id); board.runAgentCard(p.id, second.id);
  await until(p.id, () => card(p.id, first.id).checkout && card(p.id, second.id).status === 'attention');
  assert.equal(tasks.workflow(p.id).tasks[0].owner, `request:${first.id}`);
  assert.match(meta(first).prompt, new RegExp(`request:${first.id}`));
  assert.match(card(p.id, second.id).error, /owned by request:/);
  await finish(p.id, first); board.completeAgentCard(p.id, first.id);
  assert.equal(tasks.workflow(p.id).tasks[0].status, 'doing');
  assert.equal(card(p.id, first.id).delivery.state, 'verify');
  assert.equal(card(p.id, first.id).delivery.requirements.find(item => item.id === 'source').status, 'pass');
  await board.verifyAgentCardTask(p.id, first.id);
  assert.equal(card(p.id, first.id).delivery.state, 'ready');
  board.acceptAgentCardTask(p.id, first.id);
  assert.equal(card(p.id, first.id).delivery.state, 'accepted');
  assert.match(card(p.id, first.id).delivery.summary, /no page QA was required/);
  assert.equal(card(p.id, first.id).delivery.requirements.find(item => item.id === 'pages').status, 'not_required');
  assert.throws(() => board.reopenAgentCardTask(p.id, first.id), /already accepted with current evidence/);
  writeFileSync(join(p.checkout, 'app.txt'), 'source changed');
  assert.equal(card(p.id, first.id).delivery.state, 'recheck');
  assert.equal(card(p.id, first.id).delivery.checks.current, false);
  assert.equal(card(p.id, first.id).delivery.nextAction.kind, 'reopen-task');
  const oldReceipt = tasks.workflow(p.id).tasks[0].receipt;
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try { assert.throws(() => board.reopenAgentCardTask(p.id, first.id), /operator action/); }
  finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  board.reopenAgentCardTask(p.id, first.id);
  const reopened = tasks.workflow(p.id).tasks[0];
  assert.equal(reopened.owner, `request:${first.id}`);
  assert.equal(reopened.receipt, null);
  assert.deepEqual(reopened.verificationHistory[0].receipt, oldReceipt);
  await board.verifyAgentCardTask(p.id, first.id);
  board.acceptAgentCardTask(p.id, first.id);
  assert.equal(card(p.id, first.id).delivery.state, 'accepted');
});

test('QA and discovery task links never inherit build acceptance or operator verification actions', () => {
  for (const intent of ['qa', 'discovery']) {
    for (const status of ['todo', 'doing', 'accepted']) {
      const delivery = cardDelivery({ id: 'audit', intent, taskId: 'linked', pageId: 'home', status: 'todo' }, [{ id: 'linked', status, accepted: true }]);
      assert.equal(delivery.task, null);
      assert.equal(delivery.state, 'unlinked');
      assert.equal(delivery.label, intent === 'qa' ? 'Page review' : 'Scope review');
      assert.equal(delivery.requirements.length, 0);
      assert.equal(delivery.launch.allowed, true);
      assert.ok(!['verify-task', 'accept-task', 'reopen-task'].includes(delivery.nextAction.kind));
    }
  }
});

test('generic workflow tools cannot bypass operator verification or recover request ownership under another actor', async () => {
  const p = project('core-guards'); task(p.id);
  const request = await start(p.id, { taskId: 'change' });
  await finish(p.id, request);
  const identity = { project: p.id, task: 'change', agent: `request:${request.id}` };
  const call = (name, more = {}) => workflowTools.find(tool => tool.name === name).run({ ...identity, ...more });
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try {
    await assert.rejects(() => call('dogfood_verify_task'), /operator action/);
    assert.throws(() => call('dogfood_accept_task'), /operator action/);
    assert.throws(() => call('dogfood_claim_task'), /operator action/);
    assert.throws(() => call('dogfood_update_task', { input: { releaseOwner: true } }), /operator action/);
    assert.throws(() => call('dogfood_update_task', { agent: 'alternate-agent', input: { releaseOwner: true, recoveryReason: 'Attempt to move ownership to another agent.' } }), /operator action/);
  } finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  assert.equal(tasks.workflow(p.id).tasks[0].owner, identity.agent);
  assert.equal(tasks.workflow(p.id).tasks[0].receipt, null);
  await board.verifyAgentCardTask(p.id, request.id);
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try { assert.throws(() => call('dogfood_accept_task'), /operator action/); }
  finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  board.acceptAgentCardTask(p.id, request.id);
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try {
    assert.throws(() => call('dogfood_update_task', { agent: 'alternate-agent', input: { outcome: 'Replace the accepted outcome and reopen the task.' } }), /operator action/);
  } finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  // Even an operator recovery retains the request provenance, preventing actor-label substitution.
  writeFileSync(join(p.checkout, 'app.txt'), 'changed');
  board.reopenAgentCardTask(p.id, request.id);
  tasks.updateTask(p.id, 'change', { releaseOwner: true, recoveryReason: 'Operator is handing this request task to a new reviewer.' }, 'operator');
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try { assert.throws(() => call('dogfood_claim_task', { agent: 'alternate-agent' }), /operator action/); }
  finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
});

test('ordinary agent-owned tasks keep their normal workflow under native context', async () => {
  const p = project('ordinary-task'); task(p.id);
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try {
    tasks.claimTask(p.id, 'change', 'ordinary-agent');
    assert.equal((await tasks.verifyTask(p.id, 'change', 'ordinary-agent')).passed, true);
    tasks.acceptTask(p.id, 'change', 'ordinary-agent');
  } finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  assert.equal(tasks.workflow(p.id).tasks[0].status, 'accepted');
});

test('a failed independent task check stays failed and cannot be accepted', async () => {
  const p = project('failure');
  task(p.id, 'change', { checks: [{ id: 'fail', command: ['node', '-e', 'process.exit(1)'] }] });
  const request = await start(p.id, { taskId: 'change' });
  await finish(p.id, request);
  await board.verifyAgentCardTask(p.id, request.id);
  const result = card(p.id, request.id);
  assert.equal(result.delivery.checks.verified, false);
  assert.equal(result.delivery.requirements.find(item => item.id === 'checks').status, 'failed');
  assert.throws(() => board.acceptAgentCardTask(p.id, request.id), /current passing check receipt/);
});

test('task verification requires reviewed changes saved to source; page QA still gates acceptance', async () => {
  const p = project('integration');
  store.registerPage(p.id, { id: 'home', name: 'Home', group: 'App', route: '/' });
  task(p.id, 'change', { pageIds: ['home'], look: 'Readable at 1280 and 390.' });
  const request = await start(p.id, { taskId: 'change' });
  writeFileSync(join(request.checkout, 'app.txt'), 'changed');
  await finish(p.id, request);
  await assert.rejects(() => board.verifyAgentCardTask(p.id, request.id), /Inspect, apply and save/);
  const diff = board.agentCardDiff(p.id, request.id);
  const applied = board.integrateAgentCard(p.id, request.id, { fingerprint: diff.fingerprint });
  await assert.rejects(() => board.verifyAgentCardTask(p.id, request.id), /Save reviewed changes first/);
  board.saveAgentCardSource(p.id, request.id, { integrationId: applied.integration.id });
  await board.verifyAgentCardTask(p.id, request.id);
  assert.equal(card(p.id, request.id).delivery.label, 'Page QA required');
  assert.equal(card(p.id, request.id).delivery.pages[0].accepted, false);
  assert.throws(() => board.acceptAgentCardTask(p.id, request.id), /Pages are not accepted/);
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try { await assert.rejects(() => board.verifyAgentCardTask(p.id, request.id), /operator action/); }
  finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
});

test('dispatch respects linked task priority without starting unqueued work', async () => {
  const p = project('priority'); task(p.id, 'low', { priority: 3 }); task(p.id, 'high', { priority: 0 }); task(p.id, 'middle', { priority: 1 }); task(p.id, 'later', { priority: 0 });
  const low = request(p.id, { taskId: 'low' }), high = request(p.id, { taskId: 'high' }), middle = request(p.id, { taskId: 'middle' });
  board.runAgentCard(p.id, low.id); board.runAgentCard(p.id, high.id); board.runAgentCard(p.id, middle.id);
  await until(p.id, () => card(p.id, high.id).checkout && card(p.id, middle.id).checkout);
  assert.equal(card(p.id, low.id).queued, true);
  assert.equal(card(p.id, low.id).checkout, '');
  assert.deepEqual(board.agentBoard(p.id).readyTasks.map(task => task.id), ['later']);
});

test('unknown session activity and a finished unread result never present as confirmed working', async () => {
  const p = project('observation'); const request = await start(p.id);
  meta(request, { failStatus: true }); await board.dispatchAgentBoard(p.id);
  assert.equal(card(p.id, request.id).execution.label, 'Status unavailable');
  assert.equal(card(p.id, request.id).status, 'running');
  meta(request, { failStatus: false, failRead: true, status: 'done', turns: [{ n: 1, status: 'done' }], reply: 'Done' });
  await board.dispatchAgentBoard(p.id);
  assert.equal(card(p.id, request.id).execution.label, 'Fetching result');
  meta(request, { failRead: false }); await until(p.id, () => card(p.id, request.id).status === 'review');
  assert.equal(card(p.id, request.id).execution, null);
});
