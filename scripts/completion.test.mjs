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
  const pixel = (x, y) => ((x < filled && y < filled / 2 && x % 3 === 0) || (sidebar && x < 6) ? [20, 20, 20] : [255, 255, 255]);
  const rows = Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

function screenshot(name, filled, sidebar) {
  const file = join(data, name);
  writeFileSync(file, png(40, 20, filled, sidebar));
  return file;
}

const capture = { sourceUrl: 'https://example.com/', viewport: '1440 × 900', actor: 'Signed-out visitor', tier: 'real', fullPage: true };
const note = 'Checked in the live page at 1440 × 900.';

test('a page moves from registered to complete only when every requirement has evidence', () => {
  store.createProject({ id: 'shop', name: 'Shop', description: 'A test shop.', url: 'https://example.com', environment: 'Fixture', checkout: data });
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }], untestedNote: 'Checkout flow is not covered.' });
  const progress = () => store.pageProgress(store.readProject('shop'), store.readProject('shop').pages[0]);
  assert.equal(progress().status, 'blocked');
  assert.deepEqual(progress().requirements.map(item => item.id), ['capture', 'features', 'checks', 'audit', 'connections', 'ai-review', 'issues']);

  assert.throws(() => store.recordCapture('shop', 'home', { ...capture, file: screenshot('broken.png', 20) }), /fills only the top-left/);
  store.recordCapture('shop', 'home', { ...capture, file: screenshot('sparse.png', 20, true) });
  store.recordCapture('shop', 'home', { ...capture, file: screenshot('good.png', 40) });
  let page = store.readProject('shop').pages[0];
  assert.match(page.capture.sha256, /^[a-f0-9]{64}$/);
  assert.equal(page.capture.pixelWidth, 40);
  store.recordCapture('shop', 'home', { ...capture, file: screenshot('again.png', 40) });
  assert.equal(readdirSync(join(data, 'captures/shop/history')).length, 2);

  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { clarity: { status: 'pass', note: 'ok' } } }, 'agent:test'), /evidence note/);
  assert.throws(() => store.recordVerdicts('shop', 'home', { features: [{ id: 'missing', status: 'pass', note }] }, 'agent:test'), /does not exist/);
  store.recordVerdicts('shop', 'home', {
    checks: Object.fromEntries(['functionality', 'optimization', 'design', 'excess', 'clarity'].map(key => [key, { status: 'pass', note }])),
    features: [{ id: 'hero', status: 'pass', note }],
    audit: Object.fromEntries(Object.entries(page.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))])),
  }, 'agent:test');
  page = store.readProject('shop').pages[0];
  assert.equal(page.checks.clarity.by, 'agent:test');
  assert.deepEqual(progress().requirements.filter(item => !item.met).map(item => item.id), ['connections', 'ai-review']);
  assert.equal(progress().status, 'in_review');

  store.setConnections('shop', 'home', [{ id: 'page', name: 'Page request', method: 'GET', endpoint: '/', sends: 'Nothing', receives: 'HTML', source: 'Observed in the network panel', provenance: 'observed' }]);
  store.createFinding('shop', 'home', { severity: 'P1', title: 'Hero overlaps', detail: 'At 390 px the hero text overlaps the button.', attachCapture: true }, 'agent:test');
  const reviews = join(data, 'visual-reviews/shop/home');
  mkdirSync(reviews, { recursive: true });
  writeFileSync(join(reviews, '2026-09-25T00-00-00.000Z-a.json'), JSON.stringify({ capture: { sha256: store.readProject('shop').pages[0].capture.sha256 } }));
  assert.deepEqual(progress().requirements.filter(item => !item.met).map(item => item.id), ['issues']);
  assert.equal(progress().status, 'needs_work');

  store.updateFinding('shop', 'home', 'QA-001', { status: 'resolved', note: 'Retested at 390 px; the hero no longer overlaps.' }, 'agent:test');
  assert.equal(progress().complete, true);
  assert.equal(progress().status, 'pass');
  assert.ok(existsSync(join(data, 'captures/shop/home.png')));
});

test('re-registering a page keeps verdicts and evidence for features that remain', () => {
  store.registerPage('shop', { id: 'home', name: 'Home page', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }, { id: 'footer', name: 'Footer' }], untestedNote: 'Checkout flow is not covered.' });
  const page = store.readProject('shop').pages[0];
  assert.equal(page.name, 'Home page');
  assert.equal(page.features[0].status, 'pass');
  assert.equal(page.features[1].status, 'untested');
  assert.equal(page.findings.length, 1);
  assert.equal(store.pageProgress(store.readProject('shop'), page).complete, false);
});
