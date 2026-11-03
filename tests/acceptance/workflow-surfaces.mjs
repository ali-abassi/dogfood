// Browser proof for idea -> discovery -> product map and capture -> pin -> saved request.
// Only disposable fixture data is changed. The fake runner must never be invoked.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-workflow-surfaces-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const checkout = join(data, 'source');
mkdirSync(checkout);
writeFileSync(join(checkout, 'index.html'), '<h1>Workflow source fixture</h1>');
const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { stdio: 'ignore' });
git('init', '-q'); git('add', '.');
git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Fixture');
const manifestFile = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.source.checkout = checkout;
writeFileSync(manifestFile, JSON.stringify(manifest));
const runnerCalls = join(data, 'unexpected-runner-calls.log');
const fakeRunner = join(data, 'pal');
writeFileSync(fakeRunner, `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(runnerCalls)}, 'Unexpected native dispatch\\n');process.exit(9);\n`, { mode: 0o700 });
process.env.DOGFOOD_PAL_BIN = fakeRunner;
const session = process.env.DOGFOOD_BROWSER_SESSION || `dogfood-workflow-surfaces-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function page(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function click(selector) { browser('snapshot', '-i'); browser('click', selector); }
function fill(selector, value) { browser('fill', selector, value); }
function noOverflow() { assert.equal(page('document.documentElement.scrollWidth <= innerWidth + 1'), true); }
async function until(predicate, message, timeout = 12_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(done => setTimeout(done, 125));
  }
  assert.fail(message);
}
async function json(path) {
  const response = await fetch(`${server.url}${path}`);
  assert.equal(response.ok, true, `Read failed: ${path}`);
  return response.json();
}
async function settledDiscovery() {
  await until(() => page('document.querySelector("#discovery-form")?.getAttribute("aria-busy") === "false"'), 'Discovery did not finish saving.');
  browser('snapshot', '-i');
}
async function openScreens() {
  browser('open', `${server.url}/?project=tidepool&view=screens&page=home`);
  await until(() => page('!!document.querySelector("[data-annotation-canvas]") && document.querySelector("[data-annotation-action=new]")?.disabled === false'), 'The current screenshot was not available for feedback.');
  browser('snapshot', '-i');
}
const { check, passed } = checker();
let server;
let projectId;
let pin;
const audience = 'Hikers recording a short observation.\nThey need to find it again after a walk.';

try {
  server = await startServer(data);
  browser('set', 'viewport', '1280', '900');
  browser('open', `${server.url}/?project=tidepool&view=overview`);
  await until(() => page('!!document.querySelector("[data-action=add-project]")'), 'Project entry did not load.');

  await check('a new idea creates a managed project in Discovery with its first build gated', async () => {
    click('[data-action="add-project"]');
    await until(() => page('!!document.querySelector("#new-project-form")'), 'The new idea form did not open.');
    fill('#new-project-name', 'Workflow surface proof');
    fill('#new-project-idea', 'Let hikers save short trail observations and find them later.');
    click('#new-project-form button[type="submit"]');
    await until(() => page('!!document.querySelector("#discovery-form")'), 'The new project did not enter Discovery.');
    const projects = await json('/api/projects');
    projectId = projects.find(item => item.name === 'Workflow surface proof')?.id;
    assert.ok(projectId);
    const readiness = await json(`/api/projects/${projectId}/readiness`);
    assert.equal(readiness.mode, 'new'); assert.equal(readiness.ready, false); assert.equal(readiness.reviewed, false);
    assert.equal(page('document.querySelector("[data-discovery-action=review]").disabled'), true);
    assert.equal(page('document.querySelector("h1").textContent'), 'Discovery');
    noOverflow();
  });

  await check('discovery keeps unsaved answers through round changes and persists them on save', async () => {
    fill('#discovery-audience', audience);
    fill('#discovery-problem', 'Notes are lost between walks and cannot be found when needed.');
    fill('#discovery-success', 'A saved observation can be retrieved after reloading the app.');
    click('[data-discovery-action="round"][data-round="1"]');
    await until(() => page('!!document.querySelector("#discovery-journey")'), 'The journey round did not open.');
    fill('#discovery-journey', 'Open the app, enter an observation, save it and find it after reload.');
    click('[data-discovery-action="round"][data-round="0"]');
    assert.equal(page('document.querySelector("#discovery-audience").value'), audience);
    click('#discovery-form button[type="submit"]');
    await settledDiscovery();
    const readiness = await json(`/api/projects/${projectId}/readiness`);
    assert.equal(readiness.answers.audience, audience);
    assert.match(readiness.answers.journey, /find it after reload/);
    assert.equal(readiness.ready, false, 'Saving some answers cannot certify the whole scope.');
  });

  await check('planned pages and feature success conditions appear in the product map', async () => {
    click('[data-discovery-action="round"][data-round="2"]');
    fill('#discovery-proof', 'Save an observation, reload and find it at desktop and phone widths.');
    click('[data-discovery-action="add-page"]');
    fill('#planned-name-0', 'Trail observations');
    fill('#planned-route-0', '/observations');
    fill('#planned-features-0', 'Save an observation | The saved text is available after reload.');
    click('#discovery-form button[type="submit"]');
    await settledDiscovery();
    const readiness = await json(`/api/projects/${projectId}/readiness`);
    assert.equal(readiness.pages[0].features[0].expected, 'The saved text is available after reload.');
    click('.discovery-view [data-project-view="map"]');
    await until(() => page('document.querySelectorAll(".product-map-page").length === 1'), 'The planned page did not appear in the map.');
    const text = page('document.querySelector(".product-map-page").textContent');
    assert.match(text, /Trail observations/); assert.match(text, /Save an observation/); assert.match(text, /available after reload/);
    assert.match(text, /Planned page/); assert.doesNotMatch(text, /QA accepted/);
    for (const width of [1280, 390]) { browser('set', 'viewport', String(width), '900'); noOverflow(); }
  });

  await check('current-screenshot feedback saves an open finding tied to its immutable capture', async () => {
    browser('set', 'viewport', '1280', '900');
    await openScreens();
    click('[data-annotation-action="new"]');
    fill('#annotation-title', 'Clarify the primary booking action');
    fill('#annotation-comment', 'The primary booking action should be visible beside the lesson description.');
    fill('#annotation-form input[name="x"]', '35'); fill('#annotation-form input[name="y"]', '60');
    click('#annotation-form button[type="submit"]');
    await until(async () => {
      pin = (await json('/api/projects/tidepool/pages/home/annotations')).find(item => item.title === 'Clarify the primary booking action');
      return Boolean(pin) && page('!document.querySelector("#annotation-form")');
    }, 'Pinned feedback did not save.');
    assert.equal(pin.status, 'open'); assert.equal(pin.stale, false); assert.equal(pin.x, 0.35); assert.equal(pin.y, 0.6);
    const home = JSON.parse(readFileSync(manifestFile, 'utf8')).pages.find(item => item.id === 'home');
    assert.equal(pin.capture.sha256, home.captures.desktop.sha256);
    assert.match(pin.capture.path, /history\/annotation-/);
    assert.ok(existsSync(join(data, pin.capture.path.slice(1))));
    assert.ok(home.findings.some(item => item.id === pin.findingId && item.status === 'open'));
    assert.equal(page('document.querySelectorAll("[data-annotation-select]").length'), 1);
  });

  await check('pin requests preserve the chosen backend and save without native dispatch', async () => {
    browser('select', `#pin-agent-${pin.id}`, 'codex');
    click(`[data-annotation-send="${pin.id}"]`);
    await until(() => page('document.querySelector("#board-request-heading")?.textContent === "Clarify the primary booking action"'), 'The saved pin request did not open.');
    const board = await json('/api/projects/tidepool/board');
    const card = board.cards.find(item => item.annotationId === pin.id);
    assert.ok(card); assert.equal(card.backend, 'codex'); assert.equal(card.pageId, 'home');
    assert.equal(card.status, 'todo'); assert.equal(card.queued, false);
    assert.match(card.request, new RegExp(pin.capture.sha256));
    assert.equal(existsSync(runnerCalls), false, 'Saving page feedback must never start a native agent.');
  });

  await check('invalid and stale pin saves retain the typed feedback and permit a valid retry', async () => {
    await openScreens();
    click('[data-annotation-action="new"]');
    const title = 'Retain this feedback after a concurrent capture';
    const comment = 'Keep this typed observation when the current screenshot changes during review.';
    fill('#annotation-title', title); fill('#annotation-comment', comment);
    fill('#annotation-form input[name="x"]', '101');
    assert.equal(page('document.querySelector("#annotation-form").checkValidity()'), false);
    assert.equal(page('document.querySelector("#annotation-comment").value'), comment);
    fill('#annotation-form input[name="x"]', '45');
    // Controlled fixture state models another scan changing the current revision after the form opened.
    const before = JSON.parse(readFileSync(manifestFile, 'utf8'));
    const concurrent = structuredClone(before);
    concurrent.pages.find(item => item.id === 'home').captures.desktop.sha256 = 'f'.repeat(64);
    writeFileSync(manifestFile, JSON.stringify(concurrent));
    try {
      click('#annotation-form button[type="submit"]');
      await until(() => page('/screenshot changed/i.test(document.querySelector(".annotation-section .form-error")?.textContent || "")'), 'The stale screenshot save did not show a retryable error.');
      assert.equal(page('document.querySelector("#annotation-title").value'), title);
      assert.equal(page('document.querySelector("#annotation-comment").value'), comment);
      for (const width of [1280, 390]) { browser('set', 'viewport', String(width), '900'); noOverflow(); }
    } finally { writeFileSync(manifestFile, JSON.stringify(before)); }
    click('#annotation-form button[type="submit"]');
    await until(async () => (await json('/api/projects/tidepool/pages/home/annotations')).some(item => item.title === title), 'The retained feedback could not be saved after restoring the valid fixture revision.');
    assert.equal(existsSync(runnerCalls), false);
  });

  console.log(`\n${passed()} workflow-surface browser checks passed`);
} finally {
  server?.stop();
  if (!process.env.DOGFOOD_BROWSER_SESSION) { try { browser('close'); } catch { /* already closed */ } }
  rmSync(data, { recursive: true, force: true });
}
