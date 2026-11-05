import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-cancel-'));
process.env.DOGFOOD_DATA = data;
process.env.DOGFOOD_PAL_BIN = join(data, 'pal');
writeFileSync(process.env.DOGFOOD_PAL_BIN, `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(join(data, 'provider-called'))}, 'called'); process.exit(1);\n`, { mode: 0o700 });
const board = await import('../lib/agent-board.mjs');
const store = await import('../lib/store.mjs');
const tasks = await import('../lib/tasks.mjs');
const { agentBoardTools } = await import('../lib/agent-board-tools.mjs');
store.createProject({ id: 'cancel', name: 'Cancellation proof', url: 'http://127.0.0.1:4322' });
const create = extra => board.createAgentCard('cancel', { title: 'Saved review', request: 'Review this fixture without edits.', backend: 'codex', intent: 'qa', ...extra });
const current = id => board.agentBoard('cancel').cards.find(card => card.id === id);
const file = join(data, 'agent-board/cancel.json');
function fixture(id, changes) {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(value.cards.find(card => card.id === id), changes);
  writeFileSync(file, JSON.stringify(value));
}
after(() => rmSync(data, { recursive: true, force: true }));

test('saved cancellation closes once, keeps notes and images and never calls a provider', async () => {
  const saved = create(); assert.equal(saved.cancellable, true);
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  board.commentAgentCard('cancel', saved.id, { text: 'Retain this screenshot.', send: false, attachments: [{name:'proof.png',data:pixel}] });
  const closed = board.cancelAgentCard('cancel', saved.id);
  assert.equal(closed.status, 'done'); assert.equal(closed.queued, false); assert.equal(closed.cancellable, false);
  assert.equal(closed.closure.kind, 'cancelled'); assert.equal(closed.error, '');
  assert.equal(closed.comments[0].attachments[0].name, 'proof.png'); assert.equal(existsSync(closed.comments[0].attachments[0].path), true);
  assert.deepEqual(board.cancelAgentCard('cancel', saved.id), closed);
  await board.dispatchAgentBoard('cancel');
  assert.equal(existsSync(join(data, 'provider-called')), false);
});

test('cancellation explicitly discards queued feedback, preserves attribution and prevents delayed dispatch', async () => {
  const saved = create();
  board.commentAgentCard('cancel', saved.id, {text:'Queued first instruction.',send:true});
  board.commentAgentCard('cancel', saved.id, {text:'Queued second instruction.',send:true});
  const closed = board.cancelAgentCard('cancel', saved.id);
  assert.equal(closed.pendingCount, 0); assert.equal(closed.queued, false);
  assert.ok(closed.comments.slice(0,2).every(comment => comment.discardedAt && !comment.deliveredAt));
  assert.match(closed.comments.at(-2).text, /Discarded 2 queued feedback/);
  await board.dispatchAgentBoard('cancel');
  assert.equal(existsSync(join(data, 'provider-called')), false);
  const reopened = board.reopenAgentCard('cancel', saved.id);
  assert.equal(reopened.status, 'todo'); assert.equal(reopened.queued, false); assert.equal(reopened.closure, undefined);
  assert.ok(reopened.comments[0].discardedAt); assert.equal(reopened.pendingCount, 0);
});

test('running, reserved, stopping and previously started requests reject cancellation without mutation', () => {
  for (const changes of [{status:'running'}, {operation:{token:'reserved'}}, {stopRequested:true}, {started:true,status:'attention'}]) {
    const saved = create(); fixture(saved.id, changes);
    const before = readFileSync(file, 'utf8');
    assert.equal(current(saved.id).cancellable, false);
    assert.throws(() => board.cancelAgentCard('cancel', saved.id), /unstarted, idle request/);
    assert.equal(readFileSync(file, 'utf8'), before);
    fixture(saved.id, {status:'done',operation:null,stopRequested:false});
  }
});

test('closing retains the previous error as history and clears its active banner', () => {
  const saved = create();
  board.stopAgentCard('cancel', saved.id);
  const error = current(saved.id).error;
  assert.match(error, /Stopped by you/);
  const closed = board.completeAgentCard('cancel', saved.id);
  assert.equal(closed.error, ''); assert.equal(closed.closure.kind, 'closed');
  assert.equal(closed.closure.previousError, error);
  assert.equal(closed.comments.at(-1).closure.previousError, error);
});

test('cancellation keeps task claims and never accepts linked work', () => {
  tasks.addTask('cancel', {id:'claimed',title:'Retained task',outcome:'Keep the claim visible.',checks:[{id:'node',command:['node','--version']}]}, 'tester');
  const saved = create({taskId:'claimed'});
  tasks.claimTask('cancel', 'claimed', `request:${saved.id}`);
  const before = tasks.workflow('cancel').tasks.find(task => task.id === 'claimed');
  board.cancelAgentCard('cancel', saved.id);
  assert.deepEqual(tasks.workflow('cancel').tasks.find(task => task.id === 'claimed'), before);
  assert.notEqual(before.status, 'accepted');
});

test('legacy closed requests show historical errors without rewriting their stored receipt', () => {
  const saved = create();
  fixture(saved.id, {status:'done',error:'Stopped by you.'});
  const before = readFileSync(file, 'utf8');
  const closed = current(saved.id);
  assert.equal(closed.error, ''); assert.equal(closed.closure.previousError, 'Stopped by you.');
  assert.equal(closed.closure.kind, 'closed');
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('native agents cannot cancel operator requests and public route, MCP and CLI expose cancellation', async () => {
  const saved = create();
  process.env.DOGFOOD_NATIVE_REQUEST = '1';
  try { assert.throws(() => board.cancelAgentCard('cancel', saved.id), /operator action/); }
  finally { delete process.env.DOGFOOD_NATIVE_REQUEST; }
  assert.equal(current(saved.id).status, 'todo');
  const route = board.agentBoardRoutes().find(([method,path]) => method==='POST' && path.endsWith('/cancel'));
  assert.equal(route[2](['cancel', saved.id]).status, 'done');
  const second = create();
  const tool = agentBoardTools.find(tool=>tool.name==='dogfood_agent_action');
  assert.ok(tool.inputSchema.properties.action.enum.includes('cancel'));
  assert.equal((await tool.run({project:'cancel',card:second.id,action:'cancel'})).status,'done');
  const third = create();
  const result = JSON.parse(execFileSync(process.execPath, ['bin/dogfood.mjs','board','cancel',third.id,'--project','cancel','--json'], {encoding:'utf8'}));
  assert.equal(result.status, 'done'); assert.equal(result.closure.kind, 'cancelled');
  assert.equal(existsSync(join(data, 'provider-called')), false);
});
