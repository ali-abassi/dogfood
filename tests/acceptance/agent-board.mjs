// Browser regression for request -> native session -> review, using a controlled fake provider.
// A caller may reuse its headed browser with DOGFOOD_BROWSER_SESSION; CI owns its own session.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-board-ui-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const checkout = join(data, 'checkout');
mkdirSync(checkout);
writeFileSync(join(checkout, 'index.html'), '<h1>Fixture</h1>');
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'add', '.');
git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Fixture');
const manifestPath = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.source.checkout = checkout;
writeFileSync(manifestPath, JSON.stringify(manifest));
const fake = join(data, 'pal');
writeFileSync(fake, `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const a=process.argv.slice(2),cmd=a[0],opt=k=>a[a.indexOf(k)+1];
const name=cmd==='start'?opt('-n'):a[1],file=path.join(process.env.BOARD_UI_FIXTURE,name+'.json');
if(cmd==='start'){
 const cwd=path.join(process.env.BOARD_UI_FIXTURE,name);
 cp.execFileSync('git',['-C',opt('-C'),'worktree','add',cwd,opt('--worktree')],{stdio:'ignore'});
 fs.writeFileSync(file,JSON.stringify({name,cwd,status:'running',turns:[{n:1,status:'running'}]}));
 console.log(JSON.stringify({session:name,turn:1,status:'running'}));
}else{
 const m=JSON.parse(fs.readFileSync(file));
 if(cmd==='status')console.log(JSON.stringify(m));
 else if(cmd==='read')console.log(JSON.stringify({session:name,status:m.status,turn:m.turns.at(-1),reply:m.reply}));
 else if(cmd==='say'){const n=m.turns.length+1;m.status='running';m.turns.push({n,status:'running'});fs.writeFileSync(file,JSON.stringify(m));console.log(JSON.stringify({session:name,turn:n,status:'running'}));}
 else if(cmd==='stop'){m.status='stopped';fs.writeFileSync(file,JSON.stringify(m));}
 else process.exit(1);
}
`, { mode: 0o700 });
process.env.DOGFOOD_PAL_BIN = fake;
process.env.BOARD_UI_FIXTURE = data;
const session = process.env.DOGFOOD_BROWSER_SESSION || `dogfood-board-ui-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function page(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
const click = selector => { browser('click', selector); };
const { check, passed } = checker();
let server;
let created;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await predicate()) return; await sleep(150); }
  assert.fail('Expected browser or provider state was not reached.');
}
async function boardCard() {
  const response = await fetch(`${server.url}/api/projects/tidepool/board`);
  return (await response.json()).cards[0];
}
function finishProvider(content = '<h1>Reviewed fixture</h1>') {
  writeFileSync(join(created.checkout, 'index.html'), content);
  const file = join(data, `${created.session}.json`);
  const meta = JSON.parse(readFileSync(file, 'utf8'));
  meta.status = 'done'; meta.turns.at(-1).status = 'done';
  meta.reply = '## Result\nA fixture result ready for review.\n\n<img src=x onerror="window.boardInjected=true">';
  writeFileSync(file, JSON.stringify(meta));
}
function assertNoOverflow() { assert.equal(page('document.documentElement.scrollWidth <= innerWidth + 1'), true); }

try {
  server = await startServer(data);
  browser('open', `${server.url}/?project=tidepool&view=board`);
  browser('set', 'viewport', '1280', '850');
  await until(() => page('document.querySelectorAll(".board-lane").length===5'));
  await check('the empty board shows five honest lanes and an obvious request action', () => {
    assert.equal(page('document.querySelectorAll(".board-lane").length'), 5);
    assertNoOverflow();
  });
  await check('a simple request starts the selected agent with linked page context', async () => {
    click('[data-board-action="new"]');
    browser('fill', '#board-title', 'Improve the booking page');
    browser('fill', '#board-request', 'Clarify the booking heading and verify the result.');
    browser('select', '#board-page', 'book');
    click('#board-request-form button[value="start"]');
    await until(async () => { created = await boardCard(); return created?.status === 'running' && created.checkout; });
    await until(() => page('!!document.querySelector("[data-board-action=stop]")'));
    assert.equal(created.backend, 'codex'); assert.equal(created.pageId, 'book');
  });
  await check('a result updates the selected card while retaining the same focused reply and its draft', async () => {
    browser('fill', '#board-reply', 'Keep my reply while the result arrives.');
    page('(window.boardReplyNode=document.querySelector("#board-reply"),true)');
    finishProvider();
    await until(() => page('!!document.querySelector("[data-board-action=complete]")'));
    assert.equal(page('window.boardReplyNode===document.querySelector("#board-reply")'), true);
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep my reply while the result arrives.');
    assert.match(page('document.querySelector("#board-detail-content").textContent'), /fixture result ready/);
    assert.equal(page('window.boardInjected===true'), false);
    assert.equal(page('document.querySelector(".board-thread img")===null'), true);
  });
  await check('inspect, preview, apply and save reach the actual source through the browser', async () => {
    click('[data-board-action="inspect"]');
    await until(() => page('!!document.querySelector("[data-board-action=integrate]")'));
    assert.match(page('document.querySelector(".review-file").textContent'), /Reviewed fixture/);
    assert.equal(page('document.querySelector(".review-preview iframe").getAttribute("sandbox")'), '');
    click('[data-board-action="integrate"]');
    await until(() => page('!!document.querySelector("[data-board-action=save-source]")'));
    assert.equal(readFileSync(join(checkout, 'index.html'), 'utf8'), '<h1>Reviewed fixture</h1>');
    click('[data-board-action="save-source"]');
    await until(() => page('!document.querySelector("[data-board-action=save-source]") && /Changes saved/.test(document.querySelector(".integration-receipt")?.textContent || "")'));
    assert.equal(execFileSync('git', ['-C', checkout, 'status', '--porcelain'], {encoding:'utf8'}).trim(), '');
    assert.equal(execFileSync('git', ['-C', checkout, 'show', 'HEAD:index.html'], {encoding:'utf8'}), '<h1>Reviewed fixture</h1>');
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep my reply while the result arrives.');
  });
  await check('the same conversation can inspect, apply and save a later changed turn', async () => {
    browser('fill', '#board-reply', 'Refine the fixture heading in a second turn.');
    click('#board-comment-form button[type="submit"]');
    await until(async () => (await boardCard()).status === 'running');
    created = await boardCard();
    await until(() => JSON.parse(readFileSync(join(data, `${created.session}.json`), 'utf8')).turns.length === 2);
    finishProvider('<h1>Second reviewed fixture</h1>');
    await until(() => page('!!document.querySelector("[data-board-action=complete]")'));
    click('[data-board-action="inspect"]');
    await until(() => page('!!document.querySelector("[data-board-action=integrate]")'));
    click('[data-board-action="integrate"]');
    await until(() => page('!!document.querySelector("[data-board-action=save-source]")'));
    click('[data-board-action="save-source"]');
    await until(() => page('!document.querySelector("[data-board-action=save-source]") && /Changes saved/.test(document.querySelector(".integration-receipt")?.textContent || "")'));
    assert.equal(execFileSync('git', ['-C', checkout, 'show', 'HEAD:index.html'], {encoding:'utf8'}), '<h1>Second reviewed fixture</h1>');
    assert.equal(execFileSync('git', ['-C', checkout, 'status', '--porcelain'], {encoding:'utf8'}).trim(), '');
    browser('fill', '#board-reply', 'Keep my reply while the result arrives.');
  });
  await check('a note stays a note and only explicit review completion moves the card to Done', async () => {
    browser('check', '#board-comment-form input[name="note"]');
    click('#board-comment-form button[type="submit"]');
    await until(() => page('document.querySelector("#board-reply")?.value===""'));
    assert.equal((await boardCard()).status, 'review');
    click('[data-board-action="complete"]');
    await until(async () => (await boardCard()).status === 'done');
    assert.equal((await boardCard()).comments.filter(item => item.by === 'agent').length, 2);
  });
  await check('the selected conversation survives reload and narrow screens do not overflow', async () => {
    browser('reload');
    await until(() => page('!!document.querySelector("[data-board-action=reopen]")'));
    browser('set', 'viewport', '390', '844');
    assertNoOverflow();
    assert.match(page('document.querySelector(".board-detail").textContent'), /Keep my reply/);
    browser('set', 'viewport', '1280', '850');
  });
  await check('navigation protects replies hidden behind another selected request', async () => {
    browser('fill', '#board-reply', 'An unsent reply on the first request.');
    click('[data-board-action="new"]');
    browser('fill', '#board-title', 'A second request');
    browser('fill', '#board-request', 'Save this for later without starting an agent.');
    click('#board-request-form button[value="save"]');
    await until(() => page('document.querySelector("#board-request-heading")?.textContent==="A second request"'));
    click('[data-project-view="overview"]');
    assert.equal(page('!!document.querySelector("#board-unsaved-prompt")'), true);
    click('[data-action="keep-board-editing"]');
    assert.equal(page('document.querySelector("#board-request-heading").textContent'), 'A second request');
    click('[data-project-view="overview"]');
    click('[data-action="review-board-draft"]');
    assert.equal(page('document.querySelector("#board-reply").value'), 'An unsent reply on the first request.');
    click('[data-project-view="overview"]');
    click('[data-action="discard-board-drafts"]');
    await until(() => page('!!document.querySelector(".overview-content")'));
  });
  console.log(`\n${passed()} agent-board browser checks passed`);
} finally {
  server?.stop();
  if (!process.env.DOGFOOD_BROWSER_SESSION) browser('close');
  rmSync(data, { recursive: true, force: true });
}
