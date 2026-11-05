// Controlled contract fixture, never evidence that an actual iOS product was built or reviewed.
// All projects, source, executable bytes, measurements and PNGs are disposable synthetic data.
// Root owns real-product browser QA; run this only when that browser session is available.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { checker, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-platform-portfolio-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../../lib/store.mjs');
const { checkoutRevision } = await import('../../lib/revision.mjs');
const note = 'Controlled synthetic acceptance fixture only; no real app, device or provider was verified.';
const actor = 'Synthetic fixture operator';
const bundleId = 'com.example.DogfoodFixture';
const runnerCalls = join(data, 'unexpected-runner-calls.log');
const artifactFile = join(data, 'synthetic-app-executable');
writeFileSync(artifactFile, `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(${JSON.stringify(runnerCalls)}, 'Unexpected fixture dispatch\\n');process.exit(9);\n`, { mode: 0o700 });
process.env.DOGFOOD_PAL_BIN = artifactFile;
const artifactSha256 = createHash('sha256').update(readFileSync(artifactFile)).digest('hex');
const file = join(data, 'controlled-fixture.png');

function chunk(type, bytes) {
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), bytes])));
  return Buffer.concat([length, Buffer.from(type), bytes, crc]);
}
function fixturePng() {
  const header = Buffer.alloc(13); header.writeUInt32BE(80, 0); header.writeUInt32BE(160, 4); header.set([8, 2], 8);
  const rows = Array.from({ length: 160 }, (_, y) => Buffer.from([0, ...Array.from({ length: 240 }, (_, x) => (x + y) % 37 * 6)]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(file, fixturePng());

function checkout(id) {
  const directory = join(data, `${id}-source`); mkdirSync(directory);
  writeFileSync(join(directory, 'Screen.swift'), 'struct SyntheticScreen {}\n');
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { stdio: 'ignore' });
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Synthetic source fixture');
  return directory;
}
function seed(id, name, source = {}) {
  const directory = checkout(id);
  store.createProject({ id, name, checkout: directory, description: note, ...source });
  store.registerPage(id, { id: 'home', name: 'Fixture screen', route: '/home', group: 'Fixture', features: [{ id: 'open', name: 'Synthetic opening check', expected: note }] });
  return directory;
}
const nativeSource = seed('native-fixture', 'Native fixture');
const unknownSource = seed('unknown-fixture', 'Unknown build fixture');
seed('desktop-fixture', 'Desktop fixture', { platform: 'web', captureDevices: ['desktop'], url: 'http://127.0.0.1:9999' });
seed('history-fixture', 'Historical fixture');
store.createProject({ id: 'dogfood', name: 'Dogfood workspace fixture', description: note, checkout: checkout('dogfood') });
const historyFile = join(data, 'projects/history-fixture.json');
const historyBefore = readFileSync(historyFile, 'utf8');

function nativeInput(directory, matched = true) {
  const sourceFingerprint = checkoutRevision(directory).fingerprint;
  const build = matched ? { sourceProof: 'matched', sourceFingerprint, artifactFile, artifactSha256, note } : { sourceProof: 'unknown', note };
  return { file, sourceUrl: `ios://${bundleId}/home`, actor, sourceFingerprint,
    app: { bundleId, version: '1.0-fixture', build: '7' },
    device: { simulatorUDID: '12345678-1234-1234-1234-123456789012', name: 'Synthetic iPhone fixture', os: 'iOS fixture OS' }, build,
    checks: { launch: { status: 'pass', note, milliseconds: 120 }, accessibility: { status: 'pass', note }, logs: { status: 'pass', note } } };
}
function verdictInput(current) {
  const audit = Object.fromEntries(Object.entries(current.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))]));
  return { checks: { design: { status: 'pass', note }, purpose: { status: 'pass', note }, ease: { status: 'pass', note } }, features: [{ id: 'open', status: 'pass', note }], audit };
}
function facts() {
  return { loadMs: 100, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false,
    seo: { title: 'Synthetic fixture', description: note, canonical: null, robots: null, lang: 'en', h1Count: 1 },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {} };
}
const session = process.env.DOGFOOD_BROWSER_SESSION || `dogfood-platform-portfolio-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function page(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
function click(selector) { browser('snapshot', '-i'); browser('click', selector); }
async function until(predicate, message) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(done => setTimeout(done, 125));
  }
  assert.fail(message);
}
let server;
async function request(path, method = 'GET', body) {
  const response = await fetch(`${server.url}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: server.url }, body: JSON.stringify(body) });
  const result = await response.json();
  assert.equal(response.ok, true, `${method} ${path}: ${JSON.stringify(result)}`);
  return result;
}
async function current(id) { return (await request(`/api/projects/${id}`)).pages[0]; }
async function verdicts(id) {
  return request(`/api/projects/${id}/pages/home/verdicts`, 'PATCH', verdictInput(await current(id)));
}
async function configureIos(id) {
  return request(`/api/projects/${id}/configure`, 'POST', { source: { platform: 'ios', captureDevices: ['mobile'], bundleId, url: null } });
}
async function open(id, view = 'report') {
  browser('open', `${server.url}/?project=${id}&view=${view}&page=home`);
  await until(() => page('!!document.querySelector("#project-select")'), 'The project did not load.');
}
function noOverflow() { assert.equal(page('document.documentElement.scrollWidth <= innerWidth + 1'), true); }
function sizes() {
  for (const width of [1280, 390]) { browser('set', 'viewport', String(width), '900'); noOverflow(); }
}
const { check, passed } = checker();
try {
  server = await startServer(data);
  await check('HTTP iOS configuration and native evidence produce a mobile-only accepted fixture', async () => {
    await configureIos('native-fixture');
    await request('/api/projects/native-fixture/pages/home/native-check', 'POST', nativeInput(nativeSource));
    await verdicts('native-fixture');
    const value = await current('native-fixture');
    assert.equal(value.platform, 'ios'); assert.deepEqual(value.requiredDevices, ['mobile']);
    assert.equal(value.deviceLabels.mobile, 'iPhone / Simulator'); assert.equal(value.captures.desktop.state, 'blocked');
    assert.equal(value.scan, null); assert.deepEqual(value.measuredAnswers, []); assert.equal(value.progress.accepted, true);
    assert.equal(value.nativeCheck.build.artifactSha256, artifactSha256);
  });
  await check('the native report renders one phone image and explicit app, device and build provenance', async () => {
    browser('set', 'viewport', '1280', '900'); await open('native-fixture');
    await until(() => page('!!document.querySelector(".native-evidence")'), 'The native report did not render.');
    assert.equal(page('document.querySelectorAll(".report-screens-single .report-screen-mobile img").length'), 1);
    assert.equal(page('document.querySelectorAll(".report-screen-desktop, [data-action=scan]").length'), 0);
    const text = page('document.querySelector(".native-evidence").textContent');
    for (const value of [bundleId, 'Synthetic iPhone fixture', 'iOS fixture OS', '1.0-fixture', '7', note, '12345678-1234-1234-1234-123456789012']) assert.ok(text.includes(value), `Missing provenance: ${value}`);
    sizes();
  });
  await check('native screenshot view defaults to mobile and permits pinned feedback at both UI widths', async () => {
    await open('native-fixture', 'screens');
    await until(() => page('document.querySelector("[data-annotation-action=new]")?.disabled === false'), 'Native pin feedback is unavailable.');
    assert.equal(page('document.querySelector("[data-annotation-canvas]").dataset.device'), 'mobile');
    assert.deepEqual(page('Array.from(document.querySelectorAll("[data-screens-device]")).map(node => node.dataset.screensDevice)'), ['mobile']);
    assert.equal(page('document.querySelector("[data-screens-device=mobile]").getAttribute("aria-pressed")'), 'true');
    sizes(); click('[data-annotation-action="new"]');
    await until(() => page('!!document.querySelector("#annotation-form")'), 'Pin feedback form did not open.');
    assert.match(page('document.querySelector("#annotation-form").textContent'), /iPhone \/ Simulator/);
    noOverflow(); click('[data-annotation-action="cancel"]');
  });
  await check('unknown installed build source remains unaccepted despite synthetic passing verdicts', async () => {
    await configureIos('unknown-fixture');
    await request('/api/projects/unknown-fixture/pages/home/native-check', 'POST', nativeInput(unknownSource, false));
    await verdicts('unknown-fixture');
    const value = await current('unknown-fixture');
    assert.equal(value.progress.accepted, false); assert.equal(value.progress.requirements.find(row => row.id === 'scan').met, false);
    await open('unknown-fixture');
    await until(() => page('document.querySelector(".native-evidence")?.textContent.includes("Installed build not matched to source")'), 'Unknown build boundary is missing.');
    assert.notEqual(page('document.querySelector("[data-gate-status]").dataset.gateStatus'), 'Accepted'); sizes();
  });
  await check('explicit desktop web evidence neither invents a phone capture nor asserts phone measurements', async () => {
    store.recordScan('desktop-fixture', 'home', { sourceUrl: 'http://127.0.0.1:9999/home', actor, tier: 'automated', desktop: { file, viewport: '1440 × 900', facts: facts() } });
    await verdicts('desktop-fixture');
    const value = await current('desktop-fixture');
    assert.deepEqual(value.requiredDevices, ['desktop']); assert.deepEqual(Object.keys(value.scan.viewports), ['desktop']);
    assert.equal(value.captures.mobile.state, 'blocked'); assert.equal(value.progress.accepted, true);
    const speed = value.progress.answers.find(answer => answer.id === 'speed');
    assert.match(speed.summary, /computer/i); assert.doesNotMatch(speed.summary, /phone/i);
    await open('desktop-fixture');
    await until(() => page('!!document.querySelector(".report-screens-single .report-screen-desktop")'), 'Desktop-only report did not render.');
    assert.equal(page('document.querySelectorAll(".report-screen-mobile, .native-evidence").length'), 0); sizes();
  });
  await check('changing committed checkout source invalidates native checks and acceptance', async () => {
    const before = await current('native-fixture');
    writeFileSync(join(nativeSource, 'Screen.swift'), 'struct SyntheticScreen { let changed = true }\n');
    const after = await current('native-fixture');
    assert.notEqual(checkoutRevision(nativeSource).fingerprint, before.nativeCheck.sourceFingerprint);
    assert.equal(after.progress.accepted, false); assert.equal(after.progress.requirements.find(row => row.id === 'scan').met, false);
    assert.ok(after.progress.staleCount > 0, 'The source change must mark previous verdicts stale.');
    await open('native-fixture');
    await until(() => page('document.querySelector("[data-gate-status]")?.dataset.gateStatus !== "Accepted"'), 'The stale native check still appears accepted.');
  });
  await check('portfolio HTTP writes preserve historical evidence and protect concurrent updates', async () => {
    const saved = await request('/api/portfolio', 'PUT', { projects: ['native-fixture', 'desktop-fixture'] });
    assert.deepEqual(saved.projects, ['native-fixture', 'desktop-fixture']);
    assert.ok(saved.history.some(item => item.id === 'history-fixture')); assert.equal(readFileSync(historyFile, 'utf8'), historyBefore);
    const stale = await fetch(`${server.url}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: server.url }, body: JSON.stringify({ projects: ['history-fixture'], expectedRevision: 'stale-fixture-revision' }) });
    assert.equal(stale.status, 409);
    const updated = await request('/api/portfolio', 'PUT', { projects: saved.projects, expectedRevision: saved.revision });
    assert.deepEqual(updated.projects, saved.projects); assert.equal(readFileSync(historyFile, 'utf8'), historyBefore);
  });
  await check('portfolio cards, grouped picker and Open project targets work without deleting history', async () => {
    browser('set', 'viewport', '1280', '900'); await open('native-fixture', 'portfolio');
    await until(() => page('document.querySelectorAll(".portfolio-card").length === 2'), 'Current-project cards did not load.');
    assert.deepEqual(page('Array.from(document.querySelectorAll("[data-portfolio-project]")).map(node => node.dataset.portfolioProject)'), ['native-fixture', 'desktop-fixture']);
    assert.deepEqual(page('Array.from(document.querySelectorAll("#project-select optgroup")).map(node => node.label)'), ['Current projects', 'Workspace']);
    assert.equal(page('!!document.querySelector("#project-select option[value=history-fixture]")'), false);
    sizes(); browser('set', 'viewport', '1280', '900'); click('[data-portfolio-project="desktop-fixture"]');
    await until(() => page('document.querySelector("#project-select")?.value === "desktop-fixture" && new URL(location.href).searchParams.get("view") === "overview"'), 'Open project did not select the requested current project.');
    await open('history-fixture');
    await until(() => page('document.querySelector("#project-select")?.value === ""'), 'Saved historical URL must not pretend a current project is selected.');
    assert.match(page('document.querySelector(".project-picker").textContent'), /Opened project:/);
    browser('open', server.url);
    await until(() => page('document.querySelector("#project-select")?.value === "native-fixture"'), 'A remembered historical project must not reopen on normal entry.');
    assert.equal((await request('/api/projects/history-fixture')).pages.length, 1);
    assert.equal(readFileSync(historyFile, 'utf8'), historyBefore); assert.equal(existsSync(runnerCalls), false);
  });
  console.log(`\n${passed()} controlled platform/portfolio fixture checks passed; this is not real native product QA.`);
} finally {
  server?.stop();
  if (!process.env.DOGFOOD_BROWSER_SESSION) { try { browser('close'); } catch { /* owned session already closed */ } }
  rmSync(data, { recursive: true, force: true });
}
