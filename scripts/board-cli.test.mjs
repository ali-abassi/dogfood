import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { dataStoreIdentity } from '../lib/store-identity.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-board-cli-'));
const checkout = join(data, 'checkout'), sessions = join(data, 'sessions'), binaries = join(data, 'bin');
for (const path of [checkout, sessions, binaries]) mkdirSync(path);
const cli = resolve('bin/dogfood.mjs');
const fake = join(binaries, 'pal');
const env = { ...process.env, DOGFOOD_DATA: data, DOGFOOD_PAL_BIN: fake, FAKE_BOARD_SESSIONS: sessions };
const project = ['--project', 'cli-board'];
const input = { title: 'Improve the local greeting', request: 'Edit the greeting and show the change for review.', backend: 'codex' };
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q');
writeFileSync(join(checkout, 'index.html'), '<h1>Original</h1>');
git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Fixture');
writeFileSync(fake, `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const args=process.argv.slice(2),cmd=args[0],opt=k=>args[args.indexOf(k)+1];
const home=process.env.FAKE_BOARD_SESSIONS,name=cmd==='start'?opt('-n'):args[1],file=path.join(home,name+'.json');
const save=x=>fs.writeFileSync(file,JSON.stringify(x));
fs.appendFileSync(path.join(home,'calls.jsonl'),JSON.stringify({cmd,name})+'\\n');
if(cmd==='start'){
 const cwd=path.join(home,name);cp.execFileSync('git',['-C',opt('-C'),'worktree','add',cwd,opt('--worktree')],{stdio:'ignore'});
 save({name,cwd,status:'running',turns:[{n:1,status:'running'}]});console.log(JSON.stringify({session:name,turn:1,status:'running'}));
}else{
 const m=JSON.parse(fs.readFileSync(file));
 if(cmd==='status')console.log(JSON.stringify(m));
 else if(cmd==='read')console.log(JSON.stringify({session:name,status:m.status,turn:m.turns.at(-1),reply:m.reply||''}));
 else if(cmd==='say'){m.status='running';m.turns.push({n:m.turns.length+1,status:'running'});save(m);console.log(JSON.stringify({session:name,turn:m.turns.length,status:'running'}));}
 else if(cmd==='stop'){if(process.env.FAKE_STOP_FAIL){console.error('Fixture stop failed');process.exit(1);}m.status='stopped';m.turns.at(-1).status='stopped';save(m);console.log('stopped');}
 else process.exit(2);
}
`, { mode: 0o700 });
after(() => rmSync(data, { recursive: true, force: true }));

function call(args, value, extra = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: checkout, env: { ...env, ...extra }, input: value === undefined ? undefined : JSON.stringify(value), encoding: 'utf8', timeout: 20_000 });
}
function ok(args, value) {
  const result = call([...args, '--json'], value);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
function board(args, value) { return ok(['board', ...args, ...project], value); }
function failed(args, value) {
  const result = call(['board', ...args, ...project], value);
  assert.notEqual(result.status, 0);
  return result.stderr;
}
function calls() {
  try { return readFileSync(join(sessions, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); }
  catch { return []; }
}
function finish(card, reply) {
  const file = join(sessions, `${card.session}.json`), state = JSON.parse(readFileSync(file, 'utf8'));
  state.status = 'idle'; state.turns.at(-1).status = 'done'; state.reply = reply;
  writeFileSync(file, JSON.stringify(state));
  const code = `import {dispatchAgentBoard} from ${JSON.stringify(new URL('../lib/agent-board.mjs', import.meta.url).href)}; await dispatchAgentBoard('cli-board');`;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], { env, stdio: 'ignore' });
}

ok(['init', '--checkout', checkout, '--id', 'cli-board']);

test('board requests save by default; invalid commands and executable-looking inputs cannot launch a process', () => {
  const card = board(['create', '--input', '-'], input);
  assert.equal(card.status, 'todo'); assert.equal(card.queued, false);
  assert.equal(board(['show', card.id]).request, input.request);
  assert.equal(board(['list']).cards.length, 1);
  assert.equal(board(['changes', card.id]).checkout, '');
  assert.equal(calls().length, 0);
  assert.match(failed(['create', '--input', '-'], { ...input, backend: 'codex; touch bad' }), /backend|Codex/);
  assert.match(failed(['create', '--input', '-'], { ...input, command: ['touch', 'bad'] }), /Unknown|unknown/);
  assert.match(failed(['start;touch', card.id]), /action|enum/);
  assert.match(failed(['unknown']), /Unknown board action/);
  assert.match(failed(['show']), /card ID/);
  assert.match(failed(['show', 'missing']), /does not exist/);
  assert.match(failed(['list', card.id]), /Unexpected/);
  assert.equal(calls().length, 0);
});

test('CLI starts once, continues the same session, keeps notes separate and explicitly discards abandoned delivery', () => {
  const card = board(['create', '--input', '-', '--start'], input);
  assert.equal(card.status, 'running'); assert.notEqual(card.checkout, checkout);
  assert.match(failed(['comment', card.id, '--input', '-'], { text: 'Ambiguous feedback' }), /send or --note/);
  assert.match(failed(['comment', card.id, '--input', '-', '--send', '--note'], { text: 'Ambiguous feedback' }), /not both/);
  board(['comment', card.id, '--input', '-', '--note'], { text: 'My own note.' });
  assert.equal(board(['show', card.id]).pendingCount, 0);
  board(['comment', card.id, '--input', '-', '--send'], { text: 'Apply this feedback next.' });
  assert.equal(board(['show', card.id]).pendingCount, 1);
  finish(card, 'First result verified.');
  assert.equal(board(['show', card.id]).turn, 1);
  assert.equal(calls().filter(item => item.name === card.session && item.cmd === 'say').length, 1);
  finish(card, 'Second result verified.');
  assert.equal(board(['show', card.id]).turn, 2);
  const beforeComplete = calls().length;
  assert.equal(board(['done', card.id]).status, 'done');
  assert.equal(board(['reopen', card.id]).status, 'todo');
  assert.equal(calls().length, beforeComplete);
  assert.equal(board(['start', card.id]).status, 'running');
  board(['comment', card.id, '--input', '-'], { text: 'Keep this feedback in history.', send: true });
  const stopFailed = call(['board', 'stop', card.id, ...project, '--json'], undefined, { FAKE_STOP_FAIL: '1' });
  assert.equal(stopFailed.status, 1, stopFailed.stderr);
  assert.equal(JSON.parse(stopFailed.stdout).stopRequested, true);
  assert.equal(board(['stop', card.id]).status, 'attention');
  assert.notEqual(call(['board', 'done', card.id, ...project]).status, 0);
  const discarded = board(['discard-feedback', card.id]);
  assert.equal(discarded.pendingCount, 0);
  assert.ok(discarded.comments.find(item => item.text === 'Keep this feedback in history.').discardedAt);
  assert.equal(board(['done', card.id]).status, 'done');
});

function fakeProgram(name, source) { writeFileSync(join(binaries, name), `#!/usr/bin/env node\n${source}\n`, { mode: 0o700 }); }
function asyncCall(args, extra) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: checkout, env: { ...env, ...extra } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject); child.on('close', status => resolveResult({ stdout, stderr, status }));
  });
}
async function localServer(handler) {
  const server = createServer(handler);
  await new Promise(resolveResult => server.listen(0, '127.0.0.1', resolveResult));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolveResult => server.close(resolveResult)) };
}
function reply(response, value) { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); }
fakeProgram('codex', 'console.error("Logged in using ChatGPT; sensitive-auth-value");');
fakeProgram('claude', 'console.log(JSON.stringify({loggedIn:true,token:"sensitive-auth-value"}));');
fakeProgram('agent-browser', 'console.log("fixture-browser");');
const diagnosticEnv = { PATH: `${binaries}:${process.env.PATH}` };

test('doctor distinguishes installed, locally signed in and a live dispatcher without exposing auth output', async () => {
  const alias = join(data, 'alias');
  symlinkSync(data, alias, 'dir');
  assert.equal(dataStoreIdentity(alias), dataStoreIdentity(data));
  const live = await localServer((request, response) => reply(response, request.url === '/api/health' ? { app: 'dogfood', agentBoardDispatcher: true, dataStoreIdentity: dataStoreIdentity(data) } : { cards: [], agents: [] }));
  const settings = { ...diagnosticEnv, DOGFOOD_DATA: alias, DOGFOOD_SERVER_URL: live.origin };
  try {
    const result = await asyncCall(['doctor', ...project, '--require-agents', '--json'], settings);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.readiness.agentRequests, true);
    assert.equal(value.agents.codex.authentication, 'authenticated');
    assert.equal(value.agents.claude.authentication, 'authenticated');
    assert.equal(value.runtime.dispatcher, true);
    assert.equal(value.runtime.dataStoreMatches, true);
    assert.doesNotMatch(result.stdout + result.stderr, /sensitive-auth-value/);
  } finally { await live.close(); }
});

test('doctor rejects a different data store even when that server has the same project ID', async () => {
  const reads = [];
  const live = await localServer((request, response) => {
    reads.push(request.url);
    reply(response, request.url === '/api/health' ? { app: 'dogfood', agentBoardDispatcher: true, dataStoreIdentity: dataStoreIdentity(checkout) } : { cards: [], agents: [] });
  });
  try {
    const result = await asyncCall(['doctor', ...project, '--require-agents', '--json'], { ...diagnosticEnv, DOGFOOD_SERVER_URL: live.origin });
    assert.equal(result.status, 1);
    const value = JSON.parse(result.stdout);
    assert.equal(value.readiness.agentRequests, false);
    assert.equal(value.runtime.dataStoreMatches, false);
    assert.match(value.runtime.reason, /different data folder/);
    assert.match(value.runtime.nextStep, /DOGFOOD_DATA/);
    assert.deepEqual(reads, ['/api/health']);
  } finally { await live.close(); }
});

test('doctor requires explicit readiness checks to fail planning and never probes an external server URL', async () => {
  const result = await asyncCall(['doctor', ...project, '--require-agents', '--json'], { ...diagnosticEnv, DOGFOOD_SERVER_URL: 'https://example.invalid', DOGFOOD_PAL_BIN: join(data, 'missing') });
  assert.equal(result.status, 1);
  const value = JSON.parse(result.stdout);
  assert.equal(value.ok, true); assert.equal(value.readiness.planning, true);
  assert.equal(value.readiness.agentRequests, false); assert.equal(value.runner.installed, false);
  assert.match(value.runtime.reason, /localhost|loopback/);
  const regular = await asyncCall(['doctor', ...project, '--json'], { ...diagnosticEnv, DOGFOOD_SERVER_URL: 'https://example.invalid' });
  assert.equal(regular.status, 0);
});
