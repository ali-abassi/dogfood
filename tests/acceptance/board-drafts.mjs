// Durable draft browser checks: all requests are saved or notes; no provider is launched.
// DOGFOOD_BROWSER_SESSION reuses the caller's existing browser without closing it.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';
const data = mkdtempSync(join(tmpdir(), 'dogfood-draft-ui-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const { browser, evaluate: page } = browserSession('dogfood-drafts');
const { check, passed } = checker();
const click = selector => { browser('scrollintoview', selector); browser('click', selector); };
let server;
let card;
function asyncPage(expression) {
  const value = JSON.parse(browser('eval', `(async () => JSON.stringify(await (${expression})))()`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
async function until(expression) {
  for (let i = 0; i < 60; i += 1) {
    if (page(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.fail(`Browser state not reached: ${expression}`);
}
const saved = () => until('Array.from(document.querySelectorAll("[data-board-draft-status]")).some(n => n.textContent === "Draft saved on this device")');
async function reloadReply() { browser('reload'); await until('document.querySelector("#board-reply") && !document.querySelector("#board-reply").disabled'); }
async function createCard() {
  const response = await fetch(`${server.url}/api/projects/tidepool/board/cards`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.url }, body: JSON.stringify({ title: 'Durable draft fixture', request: 'Review this isolated fixture only.', backend: 'codex', intent: 'qa', start: false }) });
  assert.equal(response.status, 201);
  return response.json();
}
try {
  server = await startServer(data); card = await createCard();
  browser('open', `${server.url}/?project=tidepool&view=board&card=${card.id}`);
  await until('document.querySelector("#board-reply") && !document.querySelector("#board-reply").disabled');
  await check('reply text, note choice and screenshot survive a full reload', async () => {
    browser('fill', '#board-reply', 'Keep this screenshot and review note.');
    browser('check', '#board-note');
    browser('upload', '#board-image-input', join(data, 'captures/tidepool/book.png'));
    await saved(); await reloadReply();
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep this screenshot and review note.');
    assert.equal(page('document.querySelector("#board-note").checked'), true);
    await until('document.querySelector(".board-image-draft img")?.naturalWidth > 0');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
  });
  await check('a failed send preserves the image and retry identity across reload', async () => {
    page(`(() => { const original = window.fetch; window.fetch = (...args) => { if (String(args[0]).endsWith('/comment')) { window.fetch = original; return Promise.resolve(new Response(JSON.stringify({error:'Draft fixture failure'}), {status:503,headers:{'Content-Type':'application/json'}})); } return original(...args); }; return true; })()`);
    click('#board-reply-send');
    await until('/Draft fixture failure/.test(document.querySelector("#board-comment-error")?.textContent || "")');
    const before = asyncPage('(async () => { const {state} = await import("/js/state.mjs"); return state.board.commentAttempts; })()');
    await saved(); await reloadReply();
    const after = asyncPage('(async () => { const {state} = await import("/js/state.mjs"); return state.board.commentAttempts; })()');
    assert.deepEqual(after, before);
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 1);
  });
  await check('successful note submission clears durable text and images', async () => {
    click('#board-reply-send');
    await until('document.querySelector("#board-reply")?.value === "" && document.querySelectorAll(".board-image-draft").length === 0');
    await saved(); await reloadReply();
    assert.equal(page('document.querySelector("#board-reply").value'), '');
    assert.equal(page('document.querySelectorAll(".board-image-draft").length'), 0);
    const response = await fetch(`${server.url}/api/projects/tidepool/board`);
    const stored = (await response.json()).cards.find(item => item.id === card.id);
    assert.equal(stored.comments.at(-1).sent, false);
    assert.equal(stored.comments.at(-1).attachments.length, 1);
    assert.equal(stored.turn, 0);
  });
  await check('new request scope and completion fields survive reload then clear after save', async () => {
    click('[data-board-action="new"]');
    browser('fill', '#board-title', 'Durable request scope');
    browser('fill', '#board-request', 'Preserve every form field across reload.');
    browser('fill', '#board-done-when', 'The same scope is restored.');
    browser('fill', '#board-constraints', 'No real provider calls.');
    browser('select', '#board-page', 'book');
    await saved(); browser('reload');
    await until('document.querySelector("#board-title")?.value === "Durable request scope"');
    assert.equal(page('document.querySelector("#board-done-when").value'), 'The same scope is restored.');
    assert.equal(page('document.querySelector("#board-constraints").value'), 'No real provider calls.');
    assert.equal(page('document.querySelector("#board-page").value'), 'book');
    click('#board-request-form button[value="save"]');
    await until('document.querySelector("#board-request-heading")?.textContent === "Durable request scope"');
    await saved(); await reloadReply();
    assert.equal(page('!!document.querySelector("#board-request-form")'), false);
  });
  await check('a saved request can be cancelled and reopened without launching a provider', async () => {
    click('[data-board-action="cancel-saved"]');
    await until('!!document.querySelector("[data-board-action=reopen]")');
    assert.match(page('document.querySelector(".board-status").textContent'), /Cancelled/);
    const response = await fetch(`${server.url}/api/projects/tidepool/board`);
    const stored = (await response.json()).cards.find(item => item.title === 'Durable request scope');
    assert.equal(stored.status, 'done'); assert.equal(stored.closure.kind, 'cancelled');
    assert.equal(stored.turn, 0); assert.equal(stored.error, '');
    assert.equal(stored.checkout, '');
  });
  await check('discarding a draft clears it across reload', async () => {
    browser('fill', '#board-reply', 'Discard this reply.'); await saved();
    click('[data-project-view="overview"]');
    await until('!!document.querySelector("#board-unsaved-prompt")');
    click('[data-action="discard-board-drafts"]');
    await until('!document.querySelector("#board-unsaved-prompt")');
    browser('open', `${server.url}/?project=tidepool&view=board&card=${card.id}`);
    await until('document.querySelector("#board-reply") && !document.querySelector("#board-reply").disabled');
    assert.equal(page('document.querySelector("#board-reply").value'), '');
  });
  await check('atomic revisions reject stale-tab writes and project keys stay isolated', () => {
    const result = asyncPage(`(async () => { const store = await import('/js/views/board-draft-store.mjs'); const a={key:'fixture:first',revision:'one',value:{text:'first'}}; await store.writeStoredDraft(null,a); let message=''; try {await store.writeStoredDraft(null,{...a,revision:'stale',value:{text:'lost'}});}catch(e){message=e.message;} await store.writeStoredDraft(null,{key:'fixture:second',revision:'two',value:{text:'second'}}); return {message,first:await store.readStoredDraft(a.key),second:await store.readStoredDraft('fixture:second')}; })()`);
    assert.match(result.message, /another tab/);
    assert.equal(result.first.value.text, 'first');
    assert.equal(result.second.value.text, 'second');
  });
  await check('a stale tab shows an honest storage error and retains the fresh typing', async () => {
    const previous = asyncPage(`(async () => { const store=await import('/js/views/board-draft-store.mjs'); const health=await fetch('/api/health').then(r=>r.json()); const key=health.dataStoreIdentity+':tidepool'; const record=await store.readStoredDraft(key); await store.writeStoredDraft(record.revision,{...record,revision:'other-tab'}); return record; })()`);
    browser('fill', '#board-reply', 'Keep my typing when another tab changed the draft.');
    await until('Array.from(document.querySelectorAll("[data-board-draft-status]")).some(n => /Draft not saved.*another tab/.test(n.textContent))');
    assert.equal(page('document.querySelector("#board-reply").value'), 'Keep my typing when another tab changed the draft.');
    // Restore the fixture revision so this check leaves no pending unload prompt.
    asyncPage(`(async () => { const store=await import('/js/views/board-draft-store.mjs'); await store.writeStoredDraft('other-tab',${JSON.stringify(previous)}); return true; })()`);
    browser('fill', '#board-reply', 'Recovered fixture draft.'); await saved();
    browser('fill', '#board-reply', ''); await saved();
  });
  console.log(`\n${passed()} durable draft browser checks passed.`);
} finally {
  browser('close'); server?.stop(); rmSync(data, { recursive: true, force: true });
}
