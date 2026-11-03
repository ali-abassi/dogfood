import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-qa-agent-'));
process.env.DOGFOOD_DATA = data;
process.env.DOGFOOD_QA_AGENT = 'never-execute-this-command';
process.env.DOGFOOD_BROWSER_SESSION = 'designated-preview';
process.env.DOGFOOD_BROWSER_PROFILE = 'Default';
const fake = join(data, 'pal');
process.env.DOGFOOD_PAL_BIN = fake;
process.env.FAKE_QA_SESSIONS = join(data, 'sessions');
mkdirSync(process.env.FAKE_QA_SESSIONS);
const checkout = join(data, 'checkout'); mkdirSync(checkout);
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q');writeFileSync(join(checkout, 'index.html'), '<h1>Shop</h1>');git('add', '.');git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Fixture');
writeFileSync(fake, `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');const a=process.argv.slice(2),opt=k=>a[a.indexOf(k)+1],cmd=a[0],name=cmd==='start'?opt('-n'):a[1],file=path.join(process.env.FAKE_QA_SESSIONS,name+'.json');
if(cmd==='start'){const cwd=path.join(process.env.FAKE_QA_SESSIONS,name);cp.execFileSync('git',['-C',opt('-C'),'worktree','add',cwd,opt('--worktree')],{stdio:'ignore'});const m={name,cwd,status:'running',turns:[{n:1,status:'running'}]};fs.writeFileSync(file,JSON.stringify(m));console.log(JSON.stringify({session:name,turn:1,status:'running'}));}
else{const m=JSON.parse(fs.readFileSync(file));if(cmd==='status')console.log(JSON.stringify(m));else if(cmd==='read')console.log(JSON.stringify({session:name,status:m.status,turn:m.turns.at(-1),reply:m.reply||''}));else process.exit(2);}
`, { mode: 0o700 });
const store = await import('../lib/store.mjs');
const agent = await import('../lib/qa-agent.mjs');
const board = await import('../lib/agent-board.mjs');
after(() => rmSync(data, { recursive: true, force: true }));
store.createProject({ id: 'shop', name: 'Shop', url: 'https://shop.example', browserProfile: 'Default', checkout });
store.registerPage('shop', { id: 'cart', name: 'Cart', group: 'Public', route: '/cart', features: [{ id: 'pay', name: 'Pay' }] });

let receipt;
test('QA starts as a durable native request, preserves browser contract and never executes custom shell commands', async () => {
  assert.equal(agent.qaAgentConfigured(), true);
  const runs = await agent.startQaAgent('shop', 'cart');
  receipt = runs.cart;
  assert.equal(receipt.status, 'running');
  const card = board.agentBoard('shop').cards.find(item => item.id === receipt.card);
  assert.equal(card.intent, 'qa'); assert.equal(card.pageId, 'cart');
  assert.match(card.request, /Audit page "Cart" \(cart\) at https:\/\/shop\.example\/cart/);
  assert.match(card.request, /designated-preview/); assert.match(card.request, /Default/);
  assert.match(card.request, /Do not launch another session/);
  assert.match(card.request, /Do not spend provider\/API usage/);
  assert.match(receipt.url, /view=board&card=/);
  assert.equal((await agent.startQaAgent('shop', 'cart')).cart.card, receipt.card);
  assert.equal(board.agentBoard('shop').cards.length, 1, 'an active page request is reused rather than duplicated');
});

test('QA results and needs-input state reconcile on the same card without a cooldown', async () => {
  const file = join(process.env.FAKE_QA_SESSIONS, `${receipt.session}.json`);
  const metadata = JSON.parse(readFileSync(file));
  metadata.status = 'idle';metadata.turns[0].status = 'done';metadata.reply = 'NEEDS_INPUT: The designated browser must be signed in.';writeFileSync(file, JSON.stringify(metadata));
  await board.dispatchAgentBoard('shop');
  const run = agent.qaAgentRuns('shop').cart;
  assert.equal(run.status, 'attention');assert.equal(run.card, receipt.card);assert.match(run.result, /designated browser/);
  const next = await agent.startQaAgent('shop', 'cart');
  assert.notEqual(next.cart.card, receipt.card, 'a completed/attention request is reviewable and another deliberate QA run is allowed');
});

test('missing browser identity is setup-required in the brief rather than a fresh-profile fallback', () => {
  delete process.env.DOGFOOD_BROWSER_SESSION;
  const project = store.projectView(store.readProject('shop'));
  const brief = agent.qaBrief(project, project.pages[0]);
  assert.match(brief, /Browser setup is required/);assert.match(brief, /Do not create a browser/);
  assert.doesNotMatch(brief, /Close only your own session|Spend at most/);
});
