import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';

const data = mkdtempSync(join(tmpdir(), 'dogfood-completion-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const scanner = await import('../lib/scanner.mjs');
const { pagesGate } = await import('../lib/completion.mjs');
const { checkoutRevision } = await import('../lib/revision.mjs');
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

test('a page moves from registered to complete only when all six answers are answered', () => {
  store.createProject({ id: 'shop', name: 'Shop', description: 'A test shop.', url: 'https://example.com', environment: 'Fixture', checkout: data });
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/' });
  const progress = () => store.pageProgress(store.readProject('shop'), store.readProject('shop').pages[0]);
  assert.equal(progress().status, 'untested', 'a page that was never captured is not checked yet, not blocked');
  store.recordCapture('shop', 'home', { device: 'desktop', blockedReason: 'The checkout needs a signed-in staff account.' });
  assert.equal(progress().status, 'blocked', 'a real reason the page cannot be captured blocks it');
  assert.deepEqual(progress().requirements.slice(0, 8).map(item => item.id), ['capture', 'scan', 'design', 'purpose', 'ease', 'safety', 'speed', 'works']);
  assert.ok(progress().requirements.some(item => item.id === 'audit:security:inputs'));
  assert.equal(progress().requirements.at(-1).id, 'issues');
  assert.deepEqual(progress().answers.map(item => [item.name, item.status]), [['Looks right', 'untested'], ['Clear purpose', 'untested'], ['Easy to use', 'untested'], ['Safe', 'untested'], ['Fast & findable', 'untested'], ['Works as expected', 'untested']]);
  assert.match(progress().requirements.find(item => item.id === 'works').missing, /Add what people can do here/);
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
  const answer = id => progress().answers.find(item => item.id === id);
  assert.deepEqual([answer('ease').status, answer('ease').summary], ['needs_work', 'Scrolls sideways on a phone.']);
  assert.deepEqual([answer('works').status, answer('works').summary], ['needs_work', 'The page check found 1 error.']);
  assert.deepEqual([answer('speed').status, answer('speed').summary], ['partial', '0 of 2 search questions answered.'], 'a measured load time answers half of Fast & findable');
  assert.ok(!unmet(progress()).includes('capture') && !unmet(progress()).includes('scan'));

  store.recordScan('shop', 'home', scan());
  assert.equal(store.readProject('shop').pages[0].connections.length, 2, 'rescanning does not duplicate connections');
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero', expected: 'Shows the offer and one Shop button.' }] });
  page = store.readProject('shop').pages[0];
  assert.equal(page.features[0].expected, 'Shows the offer and one Shop button.');

  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { design: { status: 'pass', note: 'ok' } } }, 'agent:test'), /evidence note/);
  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { clear: { status: 'pass', note } } }, 'agent:test'), /Unknown quality check/);
  assert.throws(() => store.recordVerdicts('shop', 'home', { features: [{ id: 'missing', status: 'pass', note }] }, 'agent:test'), /does not exist/);
  store.recordVerdicts('shop', 'home', {
    checks: { purpose: { status: 'pass', note } },
    features: [{ id: 'hero', status: 'pass', note }],
    audit: Object.fromEntries(Object.entries(page.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))])),
  }, 'agent:test');
  assert.equal(store.readProject('shop').pages[0].checks.purpose.by, 'agent:test');
  assert.deepEqual(unmet(progress()), ['design', 'ease']);
  assert.equal(progress().status, 'in_review');
  assert.deepEqual([answer('works').summary, answer('speed').summary], ['The one thing you can do here works.', 'Loads in 0.4 s on a computer and 0.4 s on a phone.']);

  store.createFinding('shop', 'home', { severity: 'P1', title: 'Hero overlaps', detail: 'At 390 px the hero text overlaps the button.', attachCapture: true }, 'agent:test');
  const reviews = join(data, 'visual-reviews/shop/home');
  mkdirSync(reviews, { recursive: true });
  const reviewed = store.readProject('shop').pages[0].captures;
  writeFileSync(join(reviews, '2026-09-25T00-00-00.000Z-a.json'), JSON.stringify({ captures: { desktop: { sha256: reviewed.desktop.sha256 }, mobile: { sha256: reviewed.mobile.sha256 } }, analysis: { dimensions: { design: { score: 8.5, reason: 'One consistent style on both screens.' }, purpose: { score: 4, reason: 'Nothing says what the shop sells.' }, ease: { score: 8, reason: 'The Shop button is easy to find.' } } }, analyzedAt: '2026-09-25T00:00:00.000Z' }));
  assert.deepEqual([answer('design').status, answer('design').parts[0].source], ['pass', 'ai'], 'the AI review answers what nobody has judged');
  assert.equal(answer('purpose').parts[0].source, 'verdict', 'a verdict outranks the AI review');
  assert.deepEqual([answer('works').status, answer('works').summary], ['needs_work', '1 open bug: Hero overlaps']);
  assert.deepEqual(unmet(progress()), ['issues']);
  assert.equal(progress().status, 'needs_work');

  store.updateFinding('shop', 'home', 'QA-001', { status: 'resolved', note: 'Retested at 390 px; the hero no longer overlaps.' }, 'agent:test');
  assert.equal(progress().complete, true);
  assert.equal(progress().status, 'pass');

  store.recordCapture('shop', 'home', { ...capture, device: 'mobile', viewport: '390 × 844', file: screenshot('newer.png', 40, true) });
  assert.deepEqual(unmet(progress()), ['scan', 'design', 'ease'], 'a replaced screenshot makes the page check and the AI review stale');
  assert.ok(existsSync(join(data, 'captures/shop/home.png')));
});

test('a rescan records how each screenshot changed and flags reviews older than the change', () => {
  store.createProject({ id: 'deli', name: 'Deli', url: 'https://deli.example' });
  store.registerPage('deli', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'menu', name: 'Menu' }] });
  const scanWith = sidebar => store.recordScan('deli', 'home', { ...scan(), desktop: { file: screenshot('deli-desktop.png', 40, sidebar), viewport: '1440 × 900', facts: facts() } });
  const page = () => store.readProject('deli').pages[0];
  const progress = () => store.pageProgress(store.readProject('deli'), page());
  scanWith(false);
  assert.deepEqual(page().scan.changes, { desktop: null, mobile: null }, 'nothing to compare on the first scan');
  store.recordVerdicts('deli', 'home', { features: [{ id: 'menu', status: 'pass', note }] }, 'agent:test');
  scanWith(true);
  const change = page().scan.changes.desktop;
  assert.equal(change.changed, true);
  assert.equal(change.changedShare, 0.1, 'four of the forty columns turned dark');
  assert.match(change.previousPath, /^\/captures\/deli\/history\/home-\d+\.png$/);
  assert.equal(readFileSync(join(data, change.diffPath.slice(1))).subarray(1, 4).toString(), 'PNG');
  assert.equal(page().scan.changes.mobile.changed, false, 'the same mobile screenshot did not change');
  assert.equal(progress().changedSinceReview, true);
  scanWith(true);
  assert.equal(progress().changedSinceReview, true, 'a later scan without changes does not clear the flag');
  store.recordVerdicts('deli', 'home', { checks: { ease: { status: 'pass', note } } }, 'agent:test');
  assert.equal(progress().changedSinceReview, true, 'the earlier feature verdict still needs rechecking');
  store.recordVerdicts('deli', 'home', { features: [{ id: 'menu', status: 'pass', note }] }, 'agent:test');
  assert.equal(progress().changedSinceReview, false, 'rechecking the remaining old verdict clears the flag');
  scanWith(true);
  assert.equal(page().scan.changes.desktop.changed, false);
  assert.equal(page().scan.changes.desktop.changedShare, 0);
});

test('features are added to many pages in one write, or not at all', () => {
  store.createProject({ id: 'florist', name: 'Florist', url: 'https://florist.example' });
  store.registerPage('florist', { id: 'home', name: 'Home', group: 'Public', route: '/' });
  store.registerPage('florist', { id: 'shop', name: 'Shop', group: 'Public', route: '/shop', features: [{ id: 'cart', name: 'Cart' }] });
  assert.throws(() => store.addFeaturesToPages('florist', { home: [{ name: 'Hero' }], missing: [{ name: 'X' }] }, 'person'), /does not exist/);
  assert.equal(store.readProject('florist').pages[0].features.length, 0, 'a bad page aborts the whole batch');
  store.addFeaturesToPages('florist', { home: [{ name: 'Hero', expected: 'Shows this week\'s bouquets.' }], shop: [{ name: 'cart' }, { name: 'Checkout' }] }, 'person');
  const [home, shop] = store.readProject('florist').pages;
  assert.deepEqual(home.features.map(item => [item.name, item.expected, item.addedBy]), [['Hero', 'Shows this week\'s bouquets.', 'person']]);
  assert.deepEqual(shop.features.map(item => item.name), ['Cart', 'Checkout']);
  assert.throws(() => store.addFeaturesToPages('florist', {}, 'person'), /at least one/);
});

test('removing a page keeps an audit trail and needs a reason', () => {
  store.createProject({ id: 'bakery', name: 'Bakery', url: 'https://bakery.example' });
  store.registerPage('bakery', { id: 'home', name: 'Home', group: 'Public', route: '/' });
  store.registerPage('bakery', { id: 'home-2', name: 'Home again', group: 'Public', route: '/index.html' });
  assert.throws(() => store.removePage('bakery', 'home-2', 'dup', 'agent:test'), /12–400/);
  store.removePage('bakery', 'home-2', 'Duplicate of home: /index.html serves the same page.', 'agent:test');
  const project = store.readProject('bakery');
  assert.deepEqual(project.pages.map(page => page.id), ['home']);
  assert.equal(project.removedPages[0].id, 'home-2');
  assert.equal(project.removedPages[0].by, 'agent:test');
  assert.throws(() => store.removePage('bakery', 'home-2', 'Already removed, so this must fail.', 'agent:test'), /does not exist/);
});

test('suggested features are added once, with unique IDs and expected behavior', () => {
  store.createProject({ id: 'cafe', name: 'Cafe', url: 'https://cafe.example' });
  store.registerPage('cafe', { id: 'menu', name: 'Menu', group: 'Public', route: '/menu', features: [{ id: 'order', name: 'Order' }] });
  store.addFeatures('cafe', 'menu', [{ name: 'Order' }, { name: 'Filter by diet', expected: 'Shows only matching dishes.' }, { name: 'Filter by diet!' }], 'agent:test');
  const features = store.readProject('cafe').pages[0].features;
  assert.deepEqual(features.map(item => item.id), ['order', 'filter-by-diet', 'filter-by-diet-2']);
  assert.equal(features[1].expected, 'Shows only matching dishes.');
  assert.equal(features[1].status, 'untested');
  assert.equal(features[1].addedBy, 'agent:test');
  assert.throws(() => store.addFeatures('cafe', 'menu', [], 'agent:test'), /1–20/);
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

test('audit and acceptance distinguish unfinished rows, findings, checkout changes, and failed rescans', () => {
  const checkout = join(data, 'revision-checkout');
  mkdirSync(checkout);
  execFileSync('git', ['init', '-q', checkout]);
  writeFileSync(join(checkout, 'backend.js'), 'export const value = 1;\n');
  execFileSync('git', ['-C', checkout, 'add', 'backend.js']);
  execFileSync('git', ['-C', checkout, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);
  store.createProject({ id: 'revision', name: 'Revision', url: 'https://example.com', checkout });
  store.registerPage('revision', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }] });
  store.recordScan('revision', 'home', scan());
  const page = () => store.readProject('revision').pages[0];
  const progress = () => store.pageProgress(store.readProject('revision'), page());
  const view = () => store.projectView(store.readProject('revision'));
  const audit = Object.fromEntries(Object.entries(page().audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))]));
  store.recordVerdicts('revision', 'home', {
    checks: Object.fromEntries(['design', 'purpose', 'ease'].map(key => [key, { status: 'pass', note }])),
    features: [{ id: 'hero', status: 'pass', note }], audit,
  }, 'agent:test');
  assert.equal(progress().complete, true);
  assert.equal(progress().accepted, true);
  assert.equal(pagesGate(view().pages, 'acceptance').complete, true);
  assert.equal(page().scan.fingerprint, checkoutRevision(checkout).fingerprint);

  store.createFinding('revision', 'home', { severity: 'P2', title: 'Small overlap', detail: 'On a narrow phone, the footer text overlaps an icon.', attachCapture: true }, 'agent:test');
  assert.equal(progress().complete, true, 'a P2 finding does not hide completed audit work');
  assert.equal(progress().accepted, false, 'acceptance requires no open P2 finding');
  store.updateFinding('revision', 'home', 'QA-001', { status: 'resolved', note }, 'agent:test');

  store.recordVerdicts('revision', 'home', { audit: { security: [
    { id: 'inputs', status: 'needs_work', note }, { id: 'private-data', status: 'untested', note: '' },
  ] } }, 'agent:test');
  assert.equal(progress().answers.find(answer => answer.id === 'safety').status, 'needs_work');
  assert.equal(progress().complete, false, 'an unfinished security row cannot hide under needs work');
  assert.ok(unmet(progress()).includes('audit:security:private-data'));
  store.recordVerdicts('revision', 'home', { audit: { security: audit.security } }, 'agent:test');
  assert.equal(progress().accepted, true);

  const changedEnvironment = store.readProject('revision');
  changedEnvironment.source.url = 'https://preview.example.com';
  store.writeProject(changedEnvironment);
  assert.equal(progress().complete, true, 'an older audit remains inspectable after changing environments');
  assert.equal(progress().accepted, false, 'the old scan does not accept the new environment');
  assert.equal(progress().acceptanceRequirements.find(item => item.id === 'environment').met, false);
  changedEnvironment.source.url = 'https://example.com';
  store.writeProject(changedEnvironment);
  assert.equal(progress().accepted, true);

  store.registerPage('revision', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }, { id: 'footer', name: 'Footer' }] });
  store.recordVerdicts('revision', 'home', { features: [{ id: 'hero', status: 'needs_work', note }] }, 'agent:test');
  assert.equal(progress().answers.find(answer => answer.id === 'works').status, 'needs_work');
  assert.equal(progress().complete, false, 'an untested feature remains visible under an aggregate needs work answer');
  assert.ok(unmet(progress()).includes('feature:footer'));
  store.recordVerdicts('revision', 'home', { features: [{ id: 'footer', status: 'needs_work', note }] }, 'agent:test');
  assert.equal(progress().complete, true, 'every row is answered despite the known defect');
  assert.equal(pagesGate(view().pages).complete, true);
  assert.equal(pagesGate(view().pages, 'acceptance').complete, false);

  writeFileSync(join(checkout, 'backend.js'), 'export const value = 2;\n');
  assert.equal(progress().complete, false, 'backend-only edits invalidate current scan evidence');
  assert.equal(progress().accepted, false);
  assert.equal(progress().answers.find(answer => answer.id === 'design').status, 'recheck');
  assert.ok(unmet(progress()).includes('scan'));
  store.recordScan('revision', 'home', scan());
  store.recordVerdicts('revision', 'home', { checks: { design: { status: 'pass', note } } }, 'agent:test');
  assert.equal(progress().answers.find(answer => answer.id === 'design').status, 'pass');
  store.recordScanAttempt('revision', 'home', 'failed', 'Browser navigation timed out.');
  assert.equal(progress().complete, false, 'latest failed attempt blocks an older successful scan');
  assert.match(progress().requirements.find(item => item.id === 'scan').missing, /navigation timed out/);

  const beforeUntracked = checkoutRevision(checkout).fingerprint;
  writeFileSync(join(checkout, 'new-backend.js'), 'export const added = true;\n');
  assert.notEqual(checkoutRevision(checkout).fingerprint, beforeUntracked, 'nonignored untracked code changes revision evidence');
  writeFileSync(join(checkout, '.git', 'info', 'exclude'), 'ignored-build/\n');
  mkdirSync(join(checkout, 'ignored-build'));
  writeFileSync(join(checkout, 'ignored-build', 'bundle.js'), 'generated output');
  const afterUntracked = checkoutRevision(checkout).fingerprint;
  writeFileSync(join(checkout, 'ignored-build', 'bundle.js'), 'changed generated output');
  assert.equal(checkoutRevision(checkout).fingerprint, afterUntracked, 'ignored build output does not invalidate evidence');
});

test('a checkout edit during browser collection fails the rescan without replacing old evidence', async () => {
  const project = store.readProject('revision');
  const page = store.pageById(project, 'home');
  const previous = page.scan.scannedAt;
  let changed = false;
  const responses = { network: { requests: [] }, console: { messages: [] }, errors: { errors: [] } };
  const browser = {
    command: async args => {
      if (args[0] === 'open' && !changed) {
        writeFileSync(join(project.source.checkout, 'backend.js'), 'export const value = 3;\n');
        changed = true;
      }
      if (args[0] === 'screenshot') writeFileSync(args[2], png(40, 20, 40));
      return responses[args[0]] ?? {};
    },
    evaluate: async () => ({ url: 'https://example.com/', loadMs: 420, horizontalOverflow: false, links: [],
      seo: { title: 'Home', h1: 'Home', description: null, canonical: null, robots: null, lang: 'en', h1Count: 1 },
      accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 } }),
  };
  const result = await scanner.scanPages(browser, project, [page]);
  assert.equal(result.scanned, 0);
  assert.match(result.failed[0].error, /checkout changed during its page check/);
  const current = store.pageById(store.readProject('revision'), 'home');
  assert.equal(current.scan.scannedAt, previous);
  assert.equal(current.scanAttempt.status, 'failed');
  assert.equal(store.pageProgress(store.readProject('revision'), current).requirements.find(item => item.id === 'scan').met, false);
});
