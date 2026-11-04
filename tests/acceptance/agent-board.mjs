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
function capture(name) { if (process.env.DOGFOOD_SCREENSHOT_DIR) browser('screenshot', join(process.env.DOGFOOD_SCREENSHOT_DIR, `${name}.png`)); }
const click = selector => { browser('scrollintoview', selector); browser('click', selector); };
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
    assert.match(page('document.querySelector("#board-run-details-host").textContent'), /Agent session & worktree/);
  });
  await check('an unavailable session stops being counted as confirmed working', async () => {
    const file = join(data, `${created.session}.json`);
    const saved = readFileSync(file, 'utf8');
    writeFileSync(file, 'temporarily unreadable fixture session');
    await until(() => page('/Status unavailable/.test(document.querySelector(".board-status")?.textContent || "")'));
    assert.match(page('document.querySelector("#board-summary").textContent'), /0 working.*1 status unavailable/);
    writeFileSync(file, saved);
    await until(() => page('/Working/.test(document.querySelector(".board-status")?.textContent || "")'));
    assert.match(page('document.querySelector("#board-summary").textContent'), /1 working/);
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
  await check('image drafts survive polling, note toggles and phone layout with removable previews', async () => {
    browser('upload', '#board-image-input', join(data, 'captures/tidepool/book.png'));
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    browser('focus', '#board-reply');
    await sleep(4300);
    assert.equal(page('document.activeElement.id'), 'board-reply');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    browser('check', '#board-note'); browser('uncheck', '#board-note');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    browser('set', 'viewport', '390', '844'); assertNoOverflow();
    browser('scrollintoview', '#board-comment-form'); capture('image-draft-phone');
    click('[data-board-action=remove-image]');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 0);
    const encoded = readFileSync(join(data, 'captures/tidepool/book.png')).toString('base64');
    page(`(() => { const bytes = Uint8Array.from(atob(${JSON.stringify(encoded)}), c => c.charCodeAt(0)); const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'book.png', {type:'image/png'})); document.querySelector('#board-reply').dispatchEvent(new ClipboardEvent('paste', {clipboardData:transfer,bubbles:true,cancelable:true})); return true; })()`);
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    browser('set', 'viewport', '1280', '850');
    browser('scrollintoview', '#board-comment-form'); capture('image-draft-desktop');
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
    const current = await boardCard();
    const attached = current.comments.find(item => item.attachments?.length);
    assert.equal(attached.attachments[0].name, 'book.png');
    const context = JSON.parse(readFileSync(current.contextManifest.path, 'utf8'));
    assert.equal(context.pending[0].attachments[0].sha256, attached.attachments[0].sha256);
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 0);
    click('.board-history > summary');
    await until(() => page('[...document.querySelectorAll(".board-attached-image img")].some(img => img.complete && img.naturalWidth > 0)'));
    const imageResponse = await fetch(server.url + attached.attachments[0].url);
    assert.equal(imageResponse.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), readFileSync(join(data, 'captures/tidepool/book.png')));
    execFileSync(process.execPath, [join(repo, 'bin/dogfood.mjs'), 'board', 'comment', created.id, '--project', 'tidepool', '--attach', join(data, 'captures/tidepool/book-mobile.png'), '--note', '--json'], {cwd: created.checkout, env: {...process.env, DOGFOOD_DATA:data, DOGFOOD_PROJECT:'tidepool', DOGFOOD_NATIVE_REQUEST:'1', DOGFOOD_REQUEST_ID:created.id}, stdio:'pipe'});
    await until(() => page('[...document.querySelectorAll(".board-thread:not(.board-history .board-thread) .board-attached-image img")].some(img => img.closest("a").getAttribute("aria-label").includes("book-mobile.png") && img.naturalWidth > 0)'));
    finishProvider('<h1>Second reviewed fixture</h1>');
    await until(() => page('!!document.querySelector("[data-board-action=complete]")'));
    assert.equal(page('document.querySelector(".board-history").open'), true);
    assert.ok(page('[...document.querySelectorAll(".board-thread:not(.board-history .board-thread) .board-attached-image img")].some(img => img.closest("a").getAttribute("aria-label").includes("book-mobile.png"))'));
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
    assert.equal((await boardCard()).comments.filter(item => item.by === 'agent' && item.sent === undefined).length, 2);
  });
  await check('image-only notes persist without starting an agent and image drafts protect navigation', async () => {
    browser('upload', '#board-image-input', join(data, 'captures/tidepool/book-mobile.png'));
    browser('fill', '#board-reply', '');
    click('[data-project-view=overview]');
    assert.equal(page('!!document.querySelector("#board-unsaved-prompt")'), true);
    click('[data-action=review-board-draft]');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    browser('check', '#board-note');
    page(`(() => { const original = window.fetch; window.fetch = (...args) => { if (String(args[0]).endsWith('/comment')) { window.fetch = original; return Promise.resolve(new Response(JSON.stringify({error:'Temporary upload failure'}), {status:503,headers:{'Content-Type':'application/json'}})); } return original(...args); }; return true; })()`);
    click('#board-reply-send');
    await until(() => page('/Temporary upload failure/.test(document.querySelector("#board-comment-error").textContent)'));
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
    click('#board-reply-send');
    await until(() => page('document.querySelectorAll(".board-image-draft").length === 0'));
    const current = await boardCard();
    assert.equal(current.status, 'done'); assert.equal(current.turn, 2);
    assert.equal(current.comments.at(-1).text, ''); assert.equal(current.comments.at(-1).sent, false);
    assert.equal(current.comments.at(-1).attachments[0].name, 'book-mobile.png');
    browser('scrollintoview', '.board-comment-images'); capture('image-comment-desktop');
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
  await check('help explains the complete workflow and gives the agent the exact project context', async () => {
    click('[data-project-view="help"]');
    assert.equal(page('document.querySelector("h1").textContent'), 'How Dogfood works');
    assert.match(page('document.querySelector("#help-agent-prompt").value'), /dogfood context --project tidepool --json/);
    assert.match(page('document.querySelector(".help-definitions").textContent'), /Request done.*Task accepted.*Page accepted.*Deployed/s);
    capture('help-desktop');
    click('[data-help-copy]');
    await until(() => /Copied|Select and copy/.test(page('document.querySelector("#help-copy-status").textContent')));
    browser('reload');
    await until(() => page('!!document.querySelector(".help-view")'));
    browser('set', 'viewport', '390', '844');
    assertNoOverflow(); capture('help-phone');
    browser('set', 'viewport', '1280', '850');
  });
  await check('intent choice survives saving and QA work remains a saved request', async () => {
    click('[data-project-view="board"]');
    click('[data-board-action="new"]');
    browser('select', '#board-intent', 'qa');
    assert.match(page('document.querySelector("#board-intent-hint").textContent'), /does not apply source/);
    capture('request-intent');
    browser('fill', '#board-title', 'Review the booking flow');
    browser('fill', '#board-request', 'Inspect the booking flow and record any gaps without application edits.');
    click('#board-request-form button[value="save"]');
    await until(() => page('document.querySelector("#board-request-heading")?.textContent === "Review the booking flow"'));
    const result = await fetch(`${server.url}/api/projects/tidepool/board`).then(response => response.json());
    const card = result.cards.find(item => item.title === 'Review the booking flow');
    assert.equal(card.intent, 'qa'); assert.equal(card.status, 'todo'); assert.equal(card.queued, false);
    assert.match(page('document.querySelector(".board-context").textContent'), /Review and test/);
  });
  await check('a needs-input result shows the actual decision and retained check evidence', async () => {
    // Use the existing fake provider conversation, never a real model call.
    const response = await fetch(`${server.url}/api/projects/tidepool/board/cards/${created.id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.url }, body: JSON.stringify({text:'Check whether the booking provider is available.',send:true}) });
    assert.equal(response.ok, true);
    await until(() => JSON.parse(readFileSync(join(data, `${created.session}.json`), 'utf8')).turns.length === 3);
    const file = join(data, `${created.session}.json`), meta = JSON.parse(readFileSync(file));
    meta.status = 'done'; meta.turns.at(-1).status = 'done';
    const outcome = {status:'needs_input',summary:'Local checks passed; provider access is missing.',decision:'Which test account should the booking flow use?',checks:[{command:'node check.mjs',result:'Exit 0',evidence:'artifacts/booking-check.json'}],unverified:['Live booking provider']};
    meta.reply = 'NEEDS_INPUT: Which test account should the booking flow use?\n\n```dogfood-result\n' + JSON.stringify(outcome) + '\n```';
    writeFileSync(file, JSON.stringify(meta));
    browser('open', `${server.url}/?project=tidepool&view=board&card=${created.id}`);
    await until(() => page('!!document.querySelector(".board-decision")'));
    assert.match(page('document.querySelector(".board-decision").textContent'), /Which test account/);
    assert.match(page('document.querySelector(".board-outcome").textContent'), /artifacts\/booking-check.json/);
    assert.equal(page('document.querySelector(".board-result-packet").open'), false);
    assert.equal(page('document.querySelector(".board-history").open'), false);
    click('[data-board-action=reply]');
    assert.equal(page('document.activeElement.id'), 'board-reply');
    browser('scrollintoview', '.board-outcome'); capture('decision-desktop');
    browser('set', 'viewport', '390', '844'); assertNoOverflow();
    browser('scrollintoview', '.board-outcome'); capture('decision-phone');
    browser('set', 'viewport', '1280', '850');
  });
  await check('queued follow-up keeps Stop agent and a stopped turn replaces its earlier question', async () => {
    browser('fill', '#board-reply', 'Use the isolated fixture account and continue.');
    click('#board-reply-send');
    await until(() => page('document.querySelector("[data-board-action=stop]")?.textContent === "Stop agent"'));
    browser('fill', '#board-reply', 'Also verify the confirmation survives reload.');
    click('#board-reply-send');
    await until(() => page('/1 follow-up/.test(document.querySelector("#board-reply-hint")?.textContent || "")'));
    assert.equal(page('document.querySelector("[data-board-action=stop]").textContent'), 'Stop agent');
    await until(() => page('/Working/.test(document.querySelector(".board-status").textContent)'));
    assert.equal(page('!!document.querySelector(".board-decision")'), false);
    click('[data-board-action=stop]');
    await until(() => page('!!document.querySelector(".board-error") && !/Stopping/.test(document.querySelector(".board-status").textContent)'));
    assert.equal(page('!!document.querySelector(".board-decision")'), false);
    assert.equal(page('!!document.querySelector("[data-board-action=reply]")'), false);
    const error = page('document.querySelector(".board-error").textContent');
    assert.match(error, /stopped|Stopped/);
    assert.equal(page('document.querySelector(".board-card.selected .board-card-preview").textContent'), error.slice(0,280));
  });
  await check('QA coverage prepares a complete saved request and repeated clicks reuse it', async () => {
    click('[data-board-action="close"]');
    click('[data-board-action=section][data-section=qa]');
    await until(() => page('!!document.querySelector("[data-board-action=queue-review]")'));
    browser('select', '#board-qa-backend', 'claude');
    await sleep(4300);
    assert.equal(page('document.querySelector("#board-qa-backend").value'), 'claude');
    assert.equal(page('document.querySelectorAll("#board-work-queue details").length'), 0);
    assert.ok(page('document.querySelectorAll(".queue-requirements li").length') > 0);
    assert.match(page('location.search'), /boardView=qa/);
    capture('qa-coverage-desktop');
    browser('set', 'viewport', '390', '844');
    const mobilePage = page('document.querySelector("#board-qa-page option:last-child").value');
    browser('select', '#board-qa-page', mobilePage);
    assert.equal(page('document.querySelector("#board-qa-page").value'), mobilePage);
    assertNoOverflow(); capture('qa-coverage-phone');
    browser('set', 'viewport', '1280', '850');
    const pageId = page('document.querySelector("[data-board-action=queue-review]").dataset.pageId');
    click(`[data-board-action="queue-review"][data-page-id="${pageId}"]`);
    await until(() => page('!!document.querySelector("#board-request-heading")'));
    const title = page('document.querySelector("#board-request-heading").textContent');
    const first = await fetch(`${server.url}/api/projects/tidepool/board`).then(response => response.json());
    const request = first.cards.find(card => card.title === title);
    assert.equal(request.backend, 'claude');
    assert.equal(request.intent, 'qa'); assert.equal(request.queued, false); assert.equal(request.status, 'todo');
    assert.match(request.request, /every|required|complete/i);
    assert.equal(page('document.querySelector(".board-full-brief")?.open'), false);
    assert.ok(page('document.querySelector(".board-full-brief").textContent.length') > 800);
    click('[data-board-action="close"]');
    click(`.board-card[data-board-action="select"][data-card-id="${request.id}"]`);
    assert.equal(page('document.querySelector("#board-request-heading").textContent'), title);
    assertNoOverflow(); capture('coverage-review-request');
  });
  await check('search and filters preserve the selected conversation reply draft', async () => {
    browser('fill', '#board-reply', 'Keep this review scoped to the full required inventory.');
    const selected = page('document.querySelector(".board-card.selected").dataset.cardId');
    click('[data-board-action=section][data-section=ready]');
    click('[data-board-action=section][data-section=requests]');
    click(`.board-card[data-card-id="${selected}"]`);
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep this review scoped to the full required inventory.');
    browser('fill', '#board-search', 'no such request exists');
    await sleep(4300);
    assert.equal(page('document.activeElement.id'), 'board-search');
    assert.equal(page('document.querySelectorAll(".board-card").length'), 0);
    assert.equal(page('document.querySelector("#board-filter-empty").hidden'), false);
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep this review scoped to the full required inventory.');
    browser('fill', '#board-search', '');
    browser('select', '#board-filter', 'active');
    assert.ok(page('document.querySelectorAll(".board-card").length') > 0);
    browser('fill', '#board-reply', '');
    click('[data-board-action="close"]');
    browser('scrollintoview', '#board-heading'); capture('work-board-desktop');
    browser('set', 'viewport', '390', '844'); browser('scrollintoview', '#board-heading'); assertNoOverflow(); capture('work-board-phone');
    browser('set', 'viewport', '1280', '850');
  });
  await check('structured completion and boundary fields survive saved request creation', async () => {
    click('[data-board-action="new"]');
    browser('fill', '#board-title', 'Preserve booking confirmation');
    browser('fill', '#board-request', 'Make confirmation survive a reload.');
    browser('fill', '#board-done-when', 'A saved booking appears after reloading the page.');
    browser('fill', '#board-constraints', 'Use only the isolated fixture; no real bookings.');
    click('#board-request-form button[value="save"]');
    await until(() => page('document.querySelector("#board-request-heading")?.textContent === "Preserve booking confirmation"'));
    const text = page('document.querySelector(".board-request-text").textContent');
    assert.match(text, /Done when:[\s\S]*saved booking/);
    assert.match(text, /Boundaries:[\s\S]*no real bookings/);
    assert.match(page('document.querySelector(".board-delivery").textContent'), /Task not linked/);
  });
  await check('a planned build goes through reviewed source, independent checks and verified acceptance', async () => {
    const task = { id: 'verified-delivery', title: 'Verify booking confirmation delivery', outcome: 'The reviewed confirmation is saved to source and its check passes.', checks: [{id: 'confirmation', command: [process.execPath, '-e', "require('node:assert/strict').match(require('node:fs').readFileSync('index.html','utf8'), /Verified booking confirmation/)"]}], scope:['index.html'], pageIds:[], priority:1 };
    const response = await fetch(`${server.url}/api/projects/tidepool/tasks`, {method:'POST',headers:{'Content-Type':'application/json',Origin:server.url},body:JSON.stringify(task)});
    assert.equal(response.ok, true);
    browser('open', `${server.url}/?project=tidepool&view=board`);
    await until(() => page('!!document.querySelector("[data-board-action=planned-request][data-task-id=verified-delivery]")'));
    click('[data-board-action=section][data-section=ready]');
    browser('focus', '[data-board-action=planned-request][data-task-id=verified-delivery]');
    await sleep(4300);
    assert.equal(page('document.activeElement.dataset.taskId'), 'verified-delivery');
    click('[data-board-action="planned-request"][data-task-id="verified-delivery"]');
    assert.match(page('document.querySelector(".board-linked-contract").textContent'), /required command checks/);
    click('#board-request-form button[value="start"]');
    await until(async () => { const value = await fetch(`${server.url}/api/projects/tidepool/board`).then(r=>r.json()); created = value.cards.find(card=>card.taskId==='verified-delivery'); return created?.status==='running' && created.checkout; });
    finishProvider('<h1>Verified booking confirmation</h1>');
    await until(() => page('!!document.querySelector("[data-board-action=complete]")'));
    click('.board-review-tools [data-board-action="inspect"]');
    await until(() => page('!!document.querySelector("[data-board-action=integrate]")'));
    click('[data-board-action="integrate"]');
    await until(() => page('!!document.querySelector("[data-board-action=save-source]")'));
    click('.integration-receipt [data-board-action="save-source"]');
    await until(() => page('!!document.querySelector("[data-board-action=verify-task]")'));
    click('[data-board-action="verify-task"]');
    await until(() => page('!!document.querySelector("[data-board-action=accept-task]")'));
    capture('delivery-ready-to-accept');
    click('[data-board-action="accept-task"]');
    await until(() => page('document.querySelector(".board-delivery h3")?.textContent === "Verified"'));
    assert.match(page('document.querySelector(".board-delivery").textContent'), /current source/i);
    browser('scrollintoview', '.board-delivery'); capture('verified-delivery-desktop');
    browser('set','viewport','390','844'); browser('scrollintoview', '.board-delivery'); assertNoOverflow(); capture('verified-delivery-phone');
    browser('set','viewport','1280','850');
  });
  console.log(`\n${passed()} agent-board browser checks passed`);
} finally {
  server?.stop();
  if (!process.env.DOGFOOD_BROWSER_SESSION) browser('close');
  rmSync(data, { recursive: true, force: true });
}
