import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

const data = mkdtempSync(join(tmpdir(), 'dogfood-completion-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, crc]);
}

// An RGB PNG with dark stripes on a white page, standing in for page content. `filled`
// limits content to the top-left corner; `sidebar` adds a full-height left column.
function png(width, height, filled, sidebar = false) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const content = (x, y) => x < filled && y < filled / 2 && x % 3 === 0;
  const pixel = (x, y) => (content(x, y) || (sidebar && x < 6) ? [20, 20, 20] : [255, 255, 255]);
  const rows = Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function screenshot(name, filled, sidebar) {
  const file = join(data, name);
  writeFileSync(file, png(40, 20, filled, sidebar));
  return file;
}

const capture = { device: 'desktop', sourceUrl: 'https://example.com/', viewport: '1440 × 900', actor: 'Signed-out visitor', tier: 'real', fullPage: true };
const note = 'Checked in the live page at 1440 × 900.';

function facts(overrides = {}) {
  return {
    loadMs: 420, consoleErrors: [], pageErrors: [], failedRequests: [], horizontalOverflow: false,
    requests: [{ method: 'GET', url: 'https://example.com/api/cart?x=1', status: 200 }, { method: 'POST', url: 'https://pay.example.net/v1/intent', status: 201 }],
    seo: { title: 'Shop', description: 'A shop.', canonical: null, robots: null, lang: 'en', h1Count: 1 },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 },
    headers: { 'x-frame-options': 'DENY' },
    ...overrides,
  };
}

function scan(mobileFacts = facts()) {
  return {
    sourceUrl: 'https://example.com/', actor: 'Signed-out visitor', tier: 'automated',
    desktop: { file: screenshot('scan-desktop.png', 40), viewport: '1440 × 900', facts: facts() },
    mobile: { file: screenshot('scan-mobile.png', 40), viewport: '390 × 844', facts: mobileFacts },
  };
}

const unmet = progress => progress.requirements.filter(item => !item.met).map(item => item.id);

test('a page moves from registered to complete only when every requirement has evidence', () => {
  store.createProject({ id: 'shop', name: 'Shop', description: 'A test shop.', url: 'https://example.com', environment: 'Fixture', checkout: data });
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/' });
  const progress = () => store.pageProgress(store.readProject('shop'), store.readProject('shop').pages[0]);
  assert.equal(progress().status, 'blocked');
  assert.deepEqual(progress().requirements.map(item => item.id), ['capture', 'scan', 'features', 'checks', 'audit', 'connections', 'ai-review', 'issues']);
  assert.match(progress().requirements.find(item => item.id === 'features').missing, /List what this page lets people do/);
  assert.deepEqual(Object.keys(store.readProject('shop').pages[0].audit), ['security', 'scraping', 'seo', 'accessibility']);

  assert.throws(() => store.recordCapture('shop', 'home', { ...capture, file: screenshot('broken.png', 20) }), /fills only the top-left/);
  assert.throws(() => store.recordCapture('shop', 'home', { ...capture, device: 'tablet', file: screenshot('good.png', 40) }), /desktop, mobile/);
  store.recordCapture('shop', 'home', { ...capture, file: screenshot('sparse.png', 20, true) });
  store.recordCapture('shop', 'home', { ...capture, file: screenshot('good.png', 40) });
  assert.equal(readdirSync(join(data, 'captures/shop/history')).length, 1);
  assert.match(progress().requirements.find(item => item.id === 'capture').missing, /mobile/);

  assert.throws(() => store.recordScan('shop', 'home', scan({ ...facts(), horizontalOverflow: 'no' })), /horizontal overflow/);
  assert.equal(store.readProject('shop').pages[0].scan, null, 'a rejected scan stores nothing');
  store.recordScan('shop', 'home', scan(facts({ horizontalOverflow: true, pageErrors: ['TypeError: cart is undefined'] })));
  let page = store.readProject('shop').pages[0];
  assert.equal(page.captures.mobile.path, '/captures/shop/home-mobile.png');
  assert.equal(page.scan.captureSha256.mobile, page.captures.mobile.sha256);
  assert.deepEqual(page.connections.map(row => [row.method, row.endpoint, row.provenance]), [['GET', '/api/cart', 'observed'], ['POST', 'https://pay.example.net/v1/intent', 'observed']]);
  assert.equal(progress().status, 'needs_work', 'scan problems mean the page needs work');
  assert.ok(!unmet(progress()).includes('capture') && !unmet(progress()).includes('scan') && !unmet(progress()).includes('connections'));

  store.recordScan('shop', 'home', scan());
  assert.equal(store.readProject('shop').pages[0].connections.length, 2, 'rescanning does not duplicate connections');
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero', expected: 'Shows the offer and one Shop button.' }] });
  page = store.readProject('shop').pages[0];
  assert.equal(page.features[0].expected, 'Shows the offer and one Shop button.');

  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { clarity: { status: 'pass', note: 'ok' } } }, 'agent:test'), /evidence note/);
  assert.throws(() => store.recordVerdicts('shop', 'home', { features: [{ id: 'missing', status: 'pass', note }] }, 'agent:test'), /does not exist/);
  store.recordVerdicts('shop', 'home', {
    checks: Object.fromEntries(['functionality', 'optimization', 'design', 'excess', 'clarity'].map(key => [key, { status: 'pass', note }])),
    features: [{ id: 'hero', status: 'pass', note }],
    audit: Object.fromEntries(Object.entries(page.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))])),
  }, 'agent:test');
  assert.equal(store.readProject('shop').pages[0].checks.clarity.by, 'agent:test');
  assert.deepEqual(unmet(progress()), ['ai-review']);
  assert.equal(progress().status, 'in_review');

  store.createFinding('shop', 'home', { severity: 'P1', title: 'Hero overlaps', detail: 'At 390 px the hero text overlaps the button.', attachCapture: true }, 'agent:test');
  const reviews = join(data, 'visual-reviews/shop/home');
  mkdirSync(reviews, { recursive: true });
  writeFileSync(join(reviews, '2026-09-25T00-00-00.000Z-a.json'), JSON.stringify({ capture: { sha256: store.readProject('shop').pages[0].captures.desktop.sha256 } }));
  assert.deepEqual(unmet(progress()), ['issues']);
  assert.equal(progress().status, 'needs_work');

  store.updateFinding('shop', 'home', 'QA-001', { status: 'resolved', note: 'Retested at 390 px; the hero no longer overlaps.' }, 'agent:test');
  assert.equal(progress().complete, true);
  assert.equal(progress().status, 'pass');

  store.recordCapture('shop', 'home', { ...capture, device: 'mobile', viewport: '390 × 844', file: screenshot('newer.png', 40, true) });
  assert.deepEqual(unmet(progress()), ['scan'], 'a replaced screenshot makes the scan stale');
  assert.ok(existsSync(join(data, 'captures/shop/home.png')));
});

test('re-registering a page keeps verdicts and evidence for features that remain', () => {
  store.registerPage('shop', { id: 'home', name: 'Home page', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }, { id: 'footer', name: 'Footer' }] });
  const page = store.readProject('shop').pages[0];
  assert.equal(page.name, 'Home page');
  assert.equal(page.features[0].status, 'pass');
  assert.equal(page.features[0].expected, 'Shows the offer and one Shop button.', 'expected behavior survives re-registration');
  assert.equal(page.features[1].status, 'untested');
  assert.equal(page.findings.length, 1);
  assert.equal(store.pageProgress(store.readProject('shop'), page).complete, false);
});
