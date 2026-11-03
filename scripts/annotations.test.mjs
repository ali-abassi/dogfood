import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { encodePng } from '../lib/diff.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-pins-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const pins = await import('../lib/annotations.mjs');
const board = await import('../lib/agent-board.mjs');
const { annotationFields } = await import('../lib/annotation-spec.mjs');
after(() => rmSync(data, { recursive: true, force: true }));
store.createProject({ id: 'shop', name: 'Shop', url: 'https://shop.example' });
store.registerPage('shop', { id: 'home', name: 'Home', group: 'App', route: '/', features: [] });
function image(name, offset = 0) {
  const bytes = Buffer.from(Array.from({ length: 40 * 24 * 3 }, (_, i) => (i * 7 + offset) % 255));
  const file = join(data, name);writeFileSync(file, encodePng(40, 24, bytes));return file;
}
function capture(name, offset = 0) {
  store.recordCapture('shop', 'home', { device: 'desktop', file: image(name, offset), sourceUrl: 'https://shop.example/', viewport: '1280 × 900', actor: 'Fixture browser', tier: 'mock', fullPage: true });
  return store.readProject('shop').pages[0].captures.desktop;
}
let current = capture('first.png');
const input = (more = {}) => ({ device: 'desktop', x: 0.4, y: 0.65, captureSha256: current.sha256, title: 'Make the booking action clearer', comment: 'At this point the booking action is visually hidden below the description.', ...more });

test('a pin retains its exact immutable screenshot and opens a QA finding', () => {
  const [pin] = pins.addAnnotation('shop', 'home', input(), 'reviewer');
  assert.equal(pin.status, 'open');assert.equal(pin.stale, false);assert.equal(pin.device, 'desktop');assert.equal(pin.x, 0.4);
  assert.equal(pin.capture.sha256, current.sha256);assert.equal(pin.capture.viewport, '1280 × 900');
  assert.match(pin.capture.path, /history\/annotation-/);
  assert.deepEqual(readFileSync(join(data, pin.capture.path.slice(1))), readFileSync(join(data, current.path.slice(1))));
  const finding = store.readProject('shop').pages[0].findings[0];
  assert.equal(finding.annotation.id, pin.id);assert.equal(finding.by, 'reviewer');assert.equal(finding.severity, 'P2');
  const saved = readFileSync(join(data, pin.capture.path.slice(1)));
  current = capture('second.png', 40);
  assert.equal(pins.annotations('shop', 'home')[0].stale, true);
  assert.deepEqual(readFileSync(join(data, pin.capture.path.slice(1))), saved, 'a rescan never rewrites the pinned evidence');
});

test('pins reject stale capture hashes, bad positions and unsupported devices without adding findings', () => {
  const count = store.readProject('shop').pages[0].findings.length;
  assert.throws(() => pins.addAnnotation('shop', 'home', input({ captureSha256: 'a'.repeat(64) })), /screenshot changed/);
  for (const position of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => pins.addAnnotation('shop', 'home', input({ x: position })), /within the screenshot/);
  assert.throws(() => pins.addAnnotation('shop', 'home', input({ device: 'tablet' })), /computer or phone/);
  assert.equal(store.readProject('shop').pages[0].findings.length, count);
});

test('pin request is explicitly linked, save-only by default and reuses the same request', async () => {
  const pin = pins.annotations('shop', 'home')[0];
  const result = await pins.annotationRequest('shop', 'home', pin.id, { backend: 'codex' });
  assert.equal(result.card.status, 'todo');assert.equal(result.card.queued, false);assert.equal(result.card.session.startsWith('df-shop-'), true);
  assert.equal(result.card.pageId, 'home');assert.equal(result.card.annotationId, pin.id);
  assert.match(result.card.request, new RegExp(pin.capture.sha256));assert.match(result.card.request, /historical capture/);
  const again = await pins.annotationRequest('shop', 'home', pin.id, { backend: 'codex' });
  assert.equal(again.card.id, result.card.id);assert.equal(board.agentBoard('shop').cards.length, 1);
  assert.equal(store.readProject('shop').pages[0].findings[0].status, 'open');
});

test('resolving pin feedback requires a concrete retest note and does not finish its request', () => {
  const pin = pins.annotations('shop', 'home')[0];
  assert.throws(() => pins.resolveAnnotation('shop', 'home', pin.id, { note: 'done' }), /Retest note/);
  const [resolved] = pins.resolveAnnotation('shop', 'home', pin.id, { note: 'Retested the booking action at both named widths and confirmed it is visible.' }, 'reviewer');
  assert.equal(resolved.status, 'resolved');assert.equal(resolved.request.status, 'todo');
  const finding = store.readProject('shop').pages[0].findings[0];assert.equal(finding.resolvedBy, 'reviewer');
});

test('immutable evidence refuses symbolic links and paths outside its project', () => {
  const directory = join(data, 'captures', 'shop');
  const outside = join(data, 'outside.png');writeFileSync(outside, readFileSync(join(data, current.path.slice(1))));
  const symlink = join(directory, 'linked.png');symlinkSync(outside, symlink);
  const fakePage = { captures: { desktop: { ...current, path: '/captures/shop/linked.png' } } };
  assert.throws(() => annotationFields({ annotation: input() }, fakePage, 'shop'), /regular file/);
  mkdirSync(join(data, 'captures', 'other'));
  writeFileSync(join(data, 'captures', 'other', 'outside.png'), readFileSync(outside));
  fakePage.captures.desktop.path = '/captures/other/outside.png';
  assert.throws(() => annotationFields({ annotation: input() }, fakePage, 'shop'), /regular file/);
  unlinkSync(symlink);
});

test('immutable snapshot verifies actual bytes, not only saved capture metadata', () => {
  const file = join(data, current.path.slice(1));const original = readFileSync(file);
  writeFileSync(file, Buffer.concat([original, Buffer.from('changed bytes')]));
  assert.throws(() => pins.addAnnotation('shop', 'home', input()), /bytes changed/);
  writeFileSync(file, original);
  assert.equal(createHash('sha256').update(original).digest('hex'), current.sha256);
});


test('a symbolic project capture directory cannot redirect immutable evidence outside the project', () => {
  const directory = join(data, 'captures', 'shop'), saved = join(data, 'captures', 'shop-before-link');
  const outside = join(data, 'outside-project');mkdirSync(outside);
  writeFileSync(join(outside, 'home.png'), readFileSync(join(data, current.path.slice(1))));
  renameSync(directory, saved);symlinkSync(outside, directory, 'dir');
  try {
    const fakePage = { captures: { desktop: current } };
    assert.throws(() => annotationFields({ annotation: input() }, fakePage, 'shop'), /symbolic|project|regular|stay inside/i);
  } finally { unlinkSync(directory);renameSync(saved, directory); }
});
