import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import { checkedViewportFacts, duplicateCaptureGroups, signedOutMarker } from '../lib/scans.mjs';
import { defaultSignedOutMarkers } from '../lib/schema.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-scan-trust-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const scanner = await import('../lib/scanner.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

function facts(seo) {
  return {
    loadMs: 420, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false,
    seo: { title: null, h1: null, description: null, canonical: null, robots: null, lang: null, h1Count: 0, ...seo },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 },
    headers: {},
  };
}

test('viewport facts keep the page heading, defaulting to null for older scans', () => {
  assert.equal(checkedViewportFacts(facts({ h1: 'Dashboard' })).seo.h1, 'Dashboard');
  assert.equal(checkedViewportFacts(facts({ h1: undefined })).seo.h1, null);
  assert.equal(checkedViewportFacts(facts({ h1: 'x'.repeat(600) })).seo.h1.length, 500);
});

test('a signed-out marker matches the title or heading whatever its case', () => {
  assert.equal(signedOutMarker({ title: 'Sign in · Acme', h1: 'Welcome' }, defaultSignedOutMarkers), 'Sign in');
  assert.equal(signedOutMarker({ title: 'Dashboard', h1: 'LOG IN' }, defaultSignedOutMarkers), 'Log in');
  assert.equal(signedOutMarker({ title: 'Dashboard', h1: 'Your desk' }, defaultSignedOutMarkers), '');
  assert.equal(signedOutMarker(null, defaultSignedOutMarkers), '');
  assert.equal(signedOutMarker({ title: 'Sign in', h1: null }, ['Something else']), '');
});

test('only desktop captures shared across different routes form duplicate groups', () => {
  const entries = [
    { id: 'home', route: '/', sha256: 'aaa' },
    { id: 'about', route: '/about', sha256: 'aaa' },
    { id: 'about-copy', route: '/about', sha256: 'bbb' },
    { id: 'about-again', route: '/about', sha256: 'bbb' },
    { id: 'alone', route: '/alone', sha256: 'ccc' },
    { id: 'failed', route: '/failed', sha256: null },
  ];
  const groups = duplicateCaptureGroups(entries);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map(entry => entry.id).sort(), ['about', 'home']);
});

test('new projects get the default signed-out markers; custom lists replace them', () => {
  store.createProject({ id: 'shop', name: 'Shop', url: 'https://example.com' });
  assert.deepEqual(store.readProject('shop').signedOutMarkers, ['Sign in', 'Log in', 'Try the workspace']);
  store.createProject({ id: 'custom', name: 'Custom', url: 'https://example.com', signedOutMarkers: ['Members only'] });
  assert.deepEqual(store.readProject('custom').signedOutMarkers, ['Members only']);
  assert.throws(() => store.createProject({ id: 'bad', name: 'Bad', url: 'https://example.com', signedOutMarkers: [] }), /1–20/);
});

test('a page registers as signed-in, keeps it on re-register, and rejects nonsense', () => {
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', signedIn: true });
  assert.equal(store.readProject('shop').pages[0].signedIn, true);
  store.registerPage('shop', { id: 'home', name: 'Home page', group: 'Public', route: '/' });
  assert.equal(store.readProject('shop').pages[0].signedIn, true);
  assert.throws(() => store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', signedIn: 'yes' }), /true or false/);
});

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, crc]);
}

// A small RGB PNG with dark stripes, standing in for a page screenshot.
function screenshot(name, dark) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(40, 0);
  header.writeUInt32BE(20, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: 20 }, (_, y) => Buffer.from([0, ...Array.from({ length: 40 }, (_, x) => (x < dark && y < 10 && x % 3 === 0 ? [20, 20, 20] : [255, 255, 255])).flat()]));
  const file = join(data, name);
  writeFileSync(file, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]));
  return file;
}

function recordedScan(pageId, desktopFile, seo) {
  return {
    sourceUrl: 'https://example.com/', actor: 'Signed-out visitor', tier: 'automated',
    desktop: { file: desktopFile, viewport: '1440 × 900', facts: facts(seo) },
    mobile: { file: screenshot(`${pageId}-mobile.png`, 40), viewport: '390 × 844', facts: facts({}) },
  };
}

test('a signed-in page showing a signed-out screen fails its captures with a plain reason', () => {
  store.registerPage('shop', { id: 'desk', name: 'Desk', group: 'App', route: '/desk', signedIn: true });
  store.recordScan('shop', 'desk', recordedScan('desk', screenshot('desk-desktop.png', 40), { title: 'Sign in · Shop', h1: 'Welcome back' }));
  const project = store.readProject('shop');
  assert.throws(() => scanner.rejectSignedOutScan(project, { ...project.pages[1], name: 'Desk' }, 'https://example.com/'), { message: /signed-out screen/, code: 'WRONG_STATE' });
  const desk = store.readProject('shop').pages[1];
  assert.equal(desk.captures.desktop.state, 'blocked');
  assert.match(desk.captures.desktop.reason, /signed-out screen.*Sign in.*signed in, then check the page again/);
  assert.equal(store.pageProgress(store.readProject('shop'), desk).status, 'blocked');
});

test('a signed-in page showing its own screen keeps its captures', () => {
  store.recordScan('shop', 'home', recordedScan('home', screenshot('home-desktop.png', 40), { title: 'Home · Shop', h1: 'Home' }));
  const project = store.readProject('shop');
  scanner.rejectSignedOutScan(project, project.pages[0], 'https://example.com/');
  assert.equal(store.readProject('shop').pages[0].captures.desktop.state, 'rendered');
});

test('identical desktop captures across different routes fail with the other route named', () => {
  store.registerPage('shop', { id: 'about', name: 'About', group: 'Public', route: '/about' });
  const shared = screenshot('shared-desktop.png', 40);
  store.recordScan('shop', 'home', recordedScan('home', shared, { title: 'Home', h1: 'Home' }));
  store.recordScan('shop', 'about', recordedScan('about', shared, { title: 'About', h1: 'About' }));
  const outcome = scanner.rejectDuplicateCaptures('shop', [{ id: 'home' }, { id: 'about' }], { scanned: 2, failed: [] });
  assert.deepEqual(outcome.failed.map(failure => failure.page).sort(), ['about', 'home']);
  assert.ok(outcome.failed.every(failure => failure.code === 'WRONG_STATE'), 'single-page scans pass the plain reason through');
  assert.equal(outcome.scanned, 0);
  const pages = store.readProject('shop').pages;
  assert.match(pages[0].captures.desktop.reason, /identical to the one for \/about/);
  assert.match(pages[2].captures.desktop.reason, /identical to the one for \//);
  assert.equal(pages[0].captures.mobile.state, 'rendered', 'only the proven-wrong desktop capture fails');
});

test('a failed latest browser rescan leaves old evidence inspectable but not current', async () => {
  const project = store.readProject('shop');
  const home = store.pageById(project, 'home');
  const previous = home.scan.scannedAt;
  const browser = { command: async () => { throw new Error('Browser navigation timed out.'); } };
  const result = await scanner.scanPages(browser, project, [home]);
  assert.equal(result.failed.length, 1);
  const current = store.pageById(store.readProject('shop'), 'home');
  assert.equal(current.scan.scannedAt, previous);
  assert.equal(current.scanAttempt.status, 'failed');
  assert.equal(store.pageProgress(store.readProject('shop'), current).requirements.find(item => item.id === 'scan').met, false);
});
