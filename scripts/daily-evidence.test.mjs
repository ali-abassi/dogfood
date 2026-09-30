import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { decodePng } from '../lib/capture.mjs';
import { crc32, deflateSync } from 'node:zlib';
import { encodePng, imageDifference } from '../lib/diff.mjs';
import { auditDependencies, auditEvidence, auditRowFresh, carryAuditEvidence, measuredAnswers, validAuditDependencies } from '../lib/audit-evidence.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-daily-evidence-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

function facts() {
  return {
    loadMs: 420, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false,
    seo: { title: 'Your workspace', description: 'Manage your workspace here.', robots: 'noindex', canonical: 'https://example.com/', lang: 'en', h1: 'Workspace', h1Count: 1 },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {}, links: [],
  };
}

function freshPage() {
  return {
    id: 'home', captures: { desktop: { sha256: 'desktop' }, mobile: { sha256: 'mobile' } },
    scan: { scannedAt: '2026-09-29T00:00:00.000Z', sourceUrl: 'http://localhost:4322/', environment: 'local', fingerprint: 'revision', viewports: { desktop: facts(), mobile: facts() } },
    audit: Object.fromEntries(['security', 'scraping', 'seo', 'accessibility'].map(key => [key, store.defaultAuditRows(key)])),
  };
}

function review(page, key, id) {
  const row = page.audit[key].find(row => row.id === id);
  Object.assign(row, { status: 'pass', note: 'Reviewed against the scanned page and code.', by: 'original-reviewer', at: page.scan.scannedAt, fingerprint: page.scan.fingerprint });
  row.evidence = auditEvidence(page, key, row);
  return row;
}

test('unchanged bounded facts survive a rescan and keep original attribution', () => {
  const page = freshPage();
  const title = review(page, 'seo', 'title');
  const names = review(page, 'accessibility', 'names');
  const previous = structuredClone(page.scan);
  page.scan.scannedAt = '2026-09-29T01:00:00.000Z';
  page.scan.fingerprint = 'new-revision';
  carryAuditEvidence(page, previous, 'new-revision');
  assert.equal(auditRowFresh(page, title, 'new-revision'), true);
  assert.equal(auditRowFresh(page, names, 'new-revision'), true);
  assert.equal(title.at, previous.scannedAt);
  assert.equal(title.by, 'original-reviewer');
  assert.equal(title.carriedFrom.scannedAt, previous.scannedAt);
});

test('changing one fact invalidates only its dependent answer', () => {
  const page = freshPage();
  const title = review(page, 'seo', 'title');
  const names = review(page, 'accessibility', 'names');
  const keyboard = review(page, 'accessibility', 'keyboard');
  page.scan.viewports.mobile.seo.title = 'Changed';
  assert.equal(auditRowFresh(page, title), false);
  assert.equal(auditRowFresh(page, names), true);
  assert.equal(auditRowFresh(page, keyboard), true);
  page.captures.desktop.sha256 = 'changed-image';
  assert.equal(auditRowFresh(page, keyboard), false);
});

test('scan context, custom question, and legacy evidence fail closed', () => {
  const page = freshPage();
  const title = review(page, 'seo', 'title');
  page.scan.environment = 'live';
  assert.equal(auditRowFresh(page, title), false);
  page.scan.environment = 'local';
  page.requiredRole = 'admin';
  assert.equal(auditRowFresh(page, title), false);
  delete page.requiredRole;
  const custom = { id: 'custom', question: 'Is the product delightful?', status: 'pass', by: 'person', at: page.scan.scannedAt };
  assert.equal(auditEvidence(page, 'seo', custom), null);
  custom.dependsOn = ['seo.title'];
  custom.evidence = auditEvidence(page, 'seo', custom);
  assert.equal(auditRowFresh(page, custom), true);
  delete title.evidence;
  page.scan.scannedAt = '2026-09-29T02:00:00.000Z';
  assert.equal(auditRowFresh(page, title), false);
  title.question = 'Is the page delightful?';
  assert.equal(auditEvidence(page, 'seo', title), null);
});

function customReview(page, dependsOn = ['fingerprint', 'captures.desktop', 'captures.mobile', 'headers', 'requests', 'seo.robots']) {
  page.audit.security.push({ id: 'custom', question: 'Does this private workspace expose only the intended records?', dependsOn });
  return review(page, 'security', 'custom');
}

test('explicit custom dependencies carry original answers and attribution across unchanged rescans', () => {
  for (const status of ['pass', 'needs_work']) {
    const page = freshPage();
    const row = customReview(page);
    row.status = status;
    const original = structuredClone(row);
    const previous = structuredClone(page.scan);
    page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
    carryAuditEvidence(page, previous, 'revision');
    assert.equal(auditRowFresh(page, row, 'revision'), true);
    assert.deepEqual(row, { ...original, carriedFrom: { scannedAt: previous.scannedAt, sourceUrl: previous.sourceUrl, fingerprint: previous.fingerprint } });
  }
});

test('explicit custom dependencies fail closed on selected hidden facts, code, captures, questions or context', () => {
  const changes = [
    page => { page.scan.viewports.mobile.headers['x-frame-options'] = 'DENY'; },
    page => { page.scan.viewports.desktop.requests.push({ method: 'GET', url: 'https://example.com/private', status: 403 }); },
    page => { page.scan.viewports.mobile.seo.robots = 'index'; },
    page => { page.scan.fingerprint = 'different-code'; },
    page => { page.captures.desktop.sha256 = 'different-image'; },
    page => { page.captures.mobile.sha256 = 'different-image'; },
    page => { page.scan.sourceUrl = 'https://different.example.com/'; },
    page => { page.scan.environment = 'live'; },
    page => { page.requiredRole = 'admin'; },
    page => { page.scan.verifiedRole = 'admin'; },
    page => { page.scan.roleProof = 'Verified the admin session'; },
    page => { page.roleProof = 'Admin session required'; },
    page => { page.scan.fixture = ['sample']; },
    page => { page.fixture = ['sample']; },
    page => { page.signedIn = true; },
    page => { page.scan.browserProfile = 'Another profile'; },
    page => { page.audit.security.at(-1).question = 'A different review question'; },
  ];
  for (const change of changes) {
    const page = freshPage();
    const row = customReview(page);
    assert.equal(auditRowFresh(page, row), true);
    const previous = structuredClone(page.scan);
    page.scan = structuredClone(previous);
    change(page);
    page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
    carryAuditEvidence(page, previous);
    assert.equal(auditRowFresh(page, row), false, change.toString());
    assert.equal(row.carriedFrom, undefined, change.toString());
  }
});

test('missing or null links and load time need another review instead of automatic carry', () => {
  for (const key of ['links', 'loadMs']) {
    for (const value of [undefined, null]) {
      const page = freshPage();
      page.scan.viewports.mobile[key] = value;
      const row = customReview(page, [key]);
      assert.deepEqual(row.evidence.facts[key].mobile, { unmeasured: true });
      assert.equal(auditRowFresh(page, row), true, 'A fresh explicit review is still recorded.');
      const previous = structuredClone(page.scan);
      page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
      carryAuditEvidence(page, previous, 'revision');
      assert.equal(auditRowFresh(page, row), false, `${key}: ${value}`);
      assert.equal(row.carriedFrom, undefined);
    }
  }
});

test('losing measured links or load time stales an explicit custom answer', () => {
  for (const key of ['links', 'loadMs']) {
    for (const value of [undefined, null]) {
      const page = freshPage();
      const row = customReview(page, [key]);
      page.scan.viewports.desktop[key] = value;
      assert.equal(auditRowFresh(page, row), false, `${key}: ${value}`);
    }
  }
});

test('raw load-time changes stale performance answers without staling unrelated answers', () => {
  const page = freshPage();
  const row = customReview(page, ['loadMs']);
  row.question = 'Does this workspace load within the reviewed performance budget?';
  row.evidence = auditEvidence(page, 'security', row);
  const title = review(page, 'seo', 'title');
  const previous = structuredClone(page.scan);
  page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
  page.scan.viewports.mobile.loadMs = 421;
  carryAuditEvidence(page, previous);
  assert.equal(auditRowFresh(page, row), false);
  assert.equal(row.carriedFrom, undefined);
  assert.equal(auditRowFresh(page, title), true);
  assert.ok(title.carriedFrom);
});

test('custom and unknown questions require explicit bounded dependencies without legacy backfill', () => {
  const page = freshPage();
  page.audit.seo[0].question = 'Does this private workspace expose only the intended records?';
  const row = review(page, 'seo', 'title');
  assert.equal(row.evidence, null);
  assert.equal(auditDependencies('unknown-category', { id: 'unknown', question: 'Unknown review' }), null);
  assert.equal(validAuditDependencies(['loadMs']), true);
  assert.equal(validAuditDependencies([]), false);
  assert.equal(validAuditDependencies(['not-a-measurement']), false);
  assert.equal(validAuditDependencies(Array(21).fill('loadMs')), false);
  assert.equal(auditRowFresh(page, row), true);
  const previous = structuredClone(page.scan);
  page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
  carryAuditEvidence(page, previous, 'revision');
  assert.equal(auditRowFresh(page, row), false);
  assert.equal(row.evidence, null);
  assert.equal(row.carriedFrom, undefined);
});

test('canonical defaults remain narrow and explicit overrides select their declared facts', () => {
  const page = freshPage();
  const title = review(page, 'seo', 'title');
  assert.deepEqual(auditDependencies('seo', title), ['seo.title', 'seo.description']);
  const overridden = page.audit.seo.find(row => row.id === 'indexing');
  overridden.dependsOn = ['links'];
  review(page, 'seo', 'indexing');
  assert.deepEqual(overridden.evidence.dependsOn, ['links']);
  page.scan.viewports.desktop.seo.robots = 'index';
  page.scan.viewports.mobile.loadMs = 90000;
  page.scan.viewports.mobile.headers = null;
  assert.equal(auditRowFresh(page, title), true);
  assert.equal(auditRowFresh(page, overridden), true);
  page.scan.viewports.mobile.links = [{ href: '/private' }];
  assert.equal(auditRowFresh(page, overridden), false);
});

test('null headers remain measured absence and missing fingerprints preserve their existing boundary', () => {
  const page = freshPage();
  delete page.scan.fingerprint;
  page.scan.viewports.desktop.headers = null;
  page.scan.viewports.mobile.headers = null;
  const row = customReview(page, ['fingerprint', 'headers']);
  const previous = structuredClone(page.scan);
  page.scan.scannedAt = '2026-09-29T03:00:00.000Z';
  carryAuditEvidence(page, previous);
  assert.equal(auditRowFresh(page, row), true);
  assert.deepEqual(row.carriedFrom, { scannedAt: previous.scannedAt, sourceUrl: previous.sourceUrl, fingerprint: null });
  page.scan.viewports.mobile.headers = {};
  assert.equal(auditRowFresh(page, row), false);
});

test('measured candidates expose bad facts without inventing human judgments', () => {
  const page = freshPage();
  assert.equal(measuredAnswers(page).length, 5);
  assert.ok(measuredAnswers(page).every(row => row.status === 'pass'));
  page.scan.viewports.desktop.seo.title = '';
  page.scan.viewports.mobile.accessibility.unlabeledFields = 2;
  page.scan.viewports.mobile.horizontalOverflow = true;
  const candidates = measuredAnswers(page);
  assert.equal(candidates.length, 5);
  assert.deepEqual(candidates.filter(row => row.status === 'needs_work').map(row => row.id), ['measured-title', 'measured-controls', 'measured-overflow']);
  assert.ok(candidates.every(row => !['keyboard', 'contrast', 'headers', 'indexing'].includes(row.id)));
});

function create(id, features = []) {
  store.createProject({ id, name: 'Daily proof', url: 'http://localhost:4322' });
  store.registerPage(id, { id: 'home', name: 'Home', group: 'App', route: '/app?tab=one#exact', features });
  return store.pageById(store.readProject(id), 'home');
}

function page(id) {
  return store.pageById(store.readProject(id), 'home');
}

function setFacts(id, overrides = {}) {
  const project = store.readProject(id);
  const target = store.pageById(project, 'home');
  Object.assign(target, freshPage());
  target.scan.sourceUrl = 'http://localhost:4322/app?tab=one#exact';
  Object.assign(target.scan, overrides);
  target.scanAttempt = { status: 'passed', at: target.scan.scannedAt };
  store.writeProject(project);
}

test('audit-only writes retain connection evidence and measured acceptance is attributed', () => {
  const id = 'audit-only';
  create(id);
  setFacts(id);
  store.setConnections(id, 'home', [{ id: 'manual', name: 'Existing', method: 'GET', endpoint: '/api', sends: 'No request body', receives: 'Workspace records', source: 'Inspected the route source', provenance: 'manual' }]);
  store.saveAudit(id, 'home', { audit: page(id).audit }, 'editor');
  assert.equal(page(id).connections[0].id, 'manual');
  store.acceptMeasuredAnswers(id, 'home', 'accepting-agent');
  const names = page(id).audit.accessibility.find(row => row.id === 'measured-controls');
  assert.equal(names.status, 'pass');
  assert.equal(names.by, 'accepting-agent');
  assert.equal(names.verifiedBy, 'scan');
  assert.equal(names.measuredAt, page(id).scan.scannedAt);
  assert.equal(page(id).audit.seo[0].status, 'untested');
});

test('feature expectation edits preserve ID/history and invalidate changed behavior', () => {
  const id = 'feature-edit';
  create(id, [{ id: 'send', name: 'Send', expected: 'Send the message' }]);
  store.recordVerdicts(id, 'home', { features: [{ id: 'send', status: 'pass', note: 'The expected message was sent in the local fixture.' }] }, 'tester');
  const original = page(id).features[0];
  store.updateFeature(id, 'home', 'send', { name: 'Send message' }, 'editor');
  assert.equal(page(id).features[0].status, 'pass');
  store.updateFeature(id, 'home', 'send', { expected: 'Send the message and record a delivery receipt' }, 'editor');
  const feature = page(id).features[0];
  assert.equal(feature.id, 'send');
  assert.equal(feature.status, 'untested');
  assert.equal(feature.history[0].at, original.at);
  assert.equal(feature.history[0].by, 'tester');
  assert.equal(feature.editedBy, 'editor');
});

test('awaiting-live is feature-only, needs an explicit declaration, and persists debt', () => {
  const id = 'live-debt';
  create(id, [{ id: 'notify', name: 'Notify', expected: 'Send a deployed notification', requiresLive: true }, { id: 'normal', name: 'Normal' }]);
  const verdict = { status: 'awaiting_live', note: 'Requires deployed notification delivery evidence.' };
  assert.throws(() => store.recordVerdicts(id, 'home', { checks: { design: verdict } }, 'tester'), /invalid status/);
  assert.throws(() => store.recordVerdicts(id, 'home', { audit: { seo: [{ id: 'title', ...verdict }] } }, 'tester'), /invalid status/);
  assert.throws(() => store.recordVerdicts(id, 'home', { features: [{ id: 'normal', ...verdict }] }, 'tester'), /requiresLive/);
  store.recordVerdicts(id, 'home', { features: [{ id: 'notify', ...verdict }] }, 'tester');
  assert.equal(page(id).features[0].liveDebt.state, 'awaiting_deploy');
  assert.throws(() => store.recordVerdicts(id, 'home', { features: [{ id: 'notify', status: 'pass', note: 'Local behavior looked good in a fixture.' }] }, 'tester'), /Record the deployment/);
  store.updateFeature(id, 'home', 'notify', { expected: 'Send notification and record its receipt' }, 'editor');
  assert.equal(page(id).features[0].liveDebt.state, 'awaiting_deploy');
});

test('deployment preserves local URL, activates pending proof, and requires fresh exact live evidence', () => {
  const id = 'deployment';
  create(id, [{ id: 'notify', name: 'Notify', requiresLive: true }]);
  store.recordVerdicts(id, 'home', { features: [{ id: 'notify', status: 'awaiting_live', note: 'Requires deployed notification delivery evidence.' }] }, 'tester');
  store.recordDeployment(id, { id: 'release-one', url: 'https://live.example.com/', revision: 'abc123' }, 'shipper');
  assert.equal(store.readProject(id).source.url, 'http://localhost:4322');
  let feature = page(id).features[0];
  assert.equal(feature.status, 'untested');
  assert.equal(feature.liveDebt.state, 'pending');
  const passing = { features: [{ id: 'notify', status: 'pass', note: 'Verified the notification delivery receipt in the live deployment.' }] };
  assert.throws(() => store.recordVerdicts(id, 'home', passing, 'tester'), /fresh live scan/);
  const project = store.readProject(id);
  const target = store.pageById(project, 'home');
  target.scan = { ...freshPage().scan, environment: 'live', sourceUrl: feature.liveDebt.expectedUrl, scannedAt: feature.liveDebt.activatedAt };
  target.scanAttempt = { status: 'passed', at: target.scan.scannedAt };
  store.writeProject(project);
  assert.throws(() => store.recordVerdicts(id, 'home', passing, 'tester'), /later/);
  const refreshed = store.readProject(id);
  refreshed.pages[0].scan.scannedAt = new Date(Date.parse(feature.liveDebt.activatedAt) + 1000).toISOString();
  refreshed.pages[0].scan.sourceUrl = 'https://other.example.com/app?tab=one#exact';
  store.writeProject(refreshed);
  assert.throws(() => store.recordVerdicts(id, 'home', passing, 'tester'), /recorded deployment URL/);
  const correct = store.readProject(id);
  correct.pages[0].scan.sourceUrl = feature.liveDebt.expectedUrl;
  store.writeProject(correct);
  store.recordVerdicts(id, 'home', passing, 'tester');
  feature = page(id).features[0];
  assert.equal(feature.liveDebt.state, 'verified');
  assert.equal(feature.liveDebt.scan.environment, 'live');
  assert.equal(feature.liveDebt.scan.sourceUrl, 'https://live.example.com/app?tab=one#exact');
});

function image() {
  const pixels = Buffer.alloc(40 * 20 * 3);
  for (let i = 0; i < pixels.length; i += 1) pixels[i] = i % 256;
  const file = join(data, 'evidence.png');
  writeFileSync(file, encodePng(40, 20, pixels));
  return file;
}

test('recordScan carries dependency snapshots and records live provenance without changing local config', () => {
  const id = 'recorded-scans';
  create(id);
  const file = image();
  const input = { sourceUrl: 'http://localhost:4322/app?tab=one#exact', actor: 'QA agent', tier: 'automated', environment: 'local',
    desktop: { file, viewport: '1280 x 900', facts: facts() }, mobile: { file, viewport: '390 x 844', facts: facts() } };
  store.recordScan(id, 'home', input);
  store.recordVerdicts(id, 'home', { audit: { seo: [{ id: 'title', status: 'pass', note: 'The title is clear and unique and has a short description.' }] } }, 'reviewer');
  const original = page(id).audit.seo[0];
  store.recordScan(id, 'home', input);
  const carried = page(id).audit.seo[0];
  assert.equal(carried.at, original.at);
  assert.ok(carried.carriedFrom);
  assert.equal(auditRowFresh(page(id), carried), true);
  store.recordScan(id, 'home', { ...input, environment: 'live', liveUrl: 'https://live.example.com', sourceUrl: 'https://live.example.com/app?tab=one#exact', requiredRole: 'admin', verifiedRole: 'admin', fixture: ['sample'], browserProfile: 'Default' });
  assert.equal(page(id).scan.environment, 'live');
  assert.equal(page(id).scan.verifiedRole, 'admin');
  assert.deepEqual(page(id).scan.fixture, ['sample']);
  assert.equal(page(id).scan.fingerprint, undefined);
  assert.equal(store.readProject(id).source.url, 'http://localhost:4322');
  assert.equal(auditRowFresh(page(id), page(id).audit.seo[0]), false);
});


test('existing projects can replace named fixture setup with attribution and recoverable history', () => {
  const id = 'fixture-setup';
  create(id);
  store.setFixtureSetup(id, { sample: { argv: ['node', 'scripts/seed.mjs', '--sample'], cwd: 'fixtures', timeoutMs: 5000 } }, 'fixture-owner');
  assert.deepEqual(store.readProject(id).fixtureSetup.sample.argv, ['node', 'scripts/seed.mjs', '--sample']);
  assert.equal(store.readProject(id).fixtureSetupUpdated.by, 'fixture-owner');
  store.setFixtureSetup(id, {}, 'fixture-editor');
  const project = store.readProject(id);
  assert.deepEqual(project.fixtureSetup, {});
  assert.deepEqual(project.fixtureSetupHistory[1].fixtureSetup.sample.argv, ['node', 'scripts/seed.mjs', '--sample']);
  assert.throws(() => store.setFixtureSetup(id, { escape: { argv: ['node'], cwd: '../outside' } }, 'fixture-editor'), /stay in the checkout/);
  assert.throws(() => store.setFixtureSetup(id, { shell: { argv: 'node scripts/seed.mjs' } }, 'fixture-editor'), /argv/);
  assert.deepEqual(store.readProject(id).fixtureSetup, {});
});


test('deployment and live scan URL checks preserve even bare query and hash delimiters', () => {
  const id = 'exact-delimiters';
  create(id, [{ id: 'notify', name: 'Notify', requiresLive: true }]);
  store.setPageUrl(id, 'home', 'http://localhost:4322/exact?#');
  store.recordVerdicts(id, 'home', { features: [{ id: 'notify', status: 'awaiting_live', note: 'Requires deployed notification delivery evidence.' }] }, 'tester');
  store.recordDeployment(id, { id: 'exact-release', url: 'https://live.example.com/base' }, 'shipper');
  assert.equal(page(id).features[0].liveDebt.expectedUrl, 'https://live.example.com/exact?#');
  const file = image();
  const input = { sourceUrl: 'https://live.example.com/exact?#', liveUrl: 'https://live.example.com/base', environment: 'live', actor: 'QA agent', tier: 'automated',
    desktop: { file, viewport: '1280 x 900', facts: facts() }, mobile: { file, viewport: '390 x 844', facts: facts() } };
  store.recordScan(id, 'home', input);
  assert.equal(page(id).scan.sourceUrl, input.sourceUrl);
  assert.equal(page(id).captures.desktop.sourceUrl, input.sourceUrl);
});


test('known absent indexing facts carry, while unmeasured structural evidence stays unknown', () => {
  const target = freshPage();
  target.scan.viewports.desktop.seo.canonical = null;
  target.scan.viewports.mobile.seo.canonical = null;
  const indexing = review(target, 'seo', 'indexing');
  target.scan.scannedAt = '2026-09-29T03:00:00.000Z';
  target.scan.fingerprint = 'changed-code';
  assert.equal(auditRowFresh(target, indexing, 'changed-code'), true);
  const unknown = freshPage();
  delete unknown.scan.viewports.desktop.seo.canonical;
  const row = review(unknown, 'seo', 'indexing');
  unknown.scan.scannedAt = '2026-09-29T04:00:00.000Z';
  assert.equal(auditRowFresh(unknown, row), false);
});


test('measurement candidates exclude omitted facts instead of pretending they passed', () => {
  const target = freshPage();
  delete target.scan.viewports.desktop.accessibility.unlabeledFields;
  delete target.scan.viewports.mobile.failedRequests;
  const ids = measuredAnswers(target).map(row => row.id);
  assert.ok(!ids.includes('measured-controls'));
  assert.ok(!ids.includes('measured-requests'));
});


function encodedScreenshot(name, pixels, level = 9) {
  const width = 40;
  const height = 20;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const file = join(data, name);
  writeFileSync(file, Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(rows, { level })), pngChunk('IEND', Buffer.alloc(0))]));
  return file;
}

function pngChunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, checksum]);
}

function scanInput(file, overrides = {}) {
  return { sourceUrl: 'http://localhost:4322/app?tab=one#exact', actor: 'QA agent', tier: 'automated', environment: 'local',
    desktop: { file, viewport: '1280 x 900', facts: facts() }, mobile: { file, viewport: '390 x 844', facts: facts() }, ...overrides };
}

function saveCustomQuestion(id, question, dependsOn) {
  const audit = page(id).audit;
  audit.seo = [...audit.seo.filter(row => row.id !== 'custom-rewrite'),
    { id: 'custom-rewrite', question, status: 'untested', note: '', ...(dependsOn === undefined ? {} : { dependsOn }) }];
  store.saveAudit(id, 'home', { audit }, 'question-editor');
}

function customAuditRow(id) {
  return page(id).audit.seo.find(row => row.id === 'custom-rewrite');
}

function reviewedCustomQuestion(id) {
  create(id);
  const input = scanInput(image());
  store.recordScan(id, 'home', input);
  saveCustomQuestion(id, 'Does the page declare the intended canonical URL?', ['seo.canonical']);
  store.recordVerdicts(id, 'home', { audit: { seo: [{ id: 'custom-rewrite', status: 'pass', note: 'Reviewed the intended canonical URL in the current scan.' }] } }, 'original-reviewer');
  store.recordScan(id, 'home', input);
  assert.deepEqual(customAuditRow(id).dependsOn, ['seo.canonical']);
  assert.ok(customAuditRow(id).carriedFrom);
  return input;
}

test('rewriting a custom question without dependencies clears prior evidence and requires fresh review after scans', () => {
  const id = 'custom-rewrite-without-deps';
  const input = reviewedCustomQuestion(id);
  const question = 'Does this workspace load within the reviewed performance budget?';
  saveCustomQuestion(id, question);
  const rewritten = customAuditRow(id);
  assert.equal(rewritten.dependsOn, undefined);
  assert.equal(rewritten.evidence, null);
  assert.equal(rewritten.carriedFrom, undefined);
  assert.equal(rewritten.status, 'untested');
  store.recordVerdicts(id, 'home', { audit: { seo: [{ id: rewritten.id, status: 'pass', note: 'Reviewed the workspace load time against the performance budget.' }] } }, 'fresh-reviewer');
  const reviewed = customAuditRow(id);
  assert.equal(reviewed.evidence, null);
  assert.equal(auditRowFresh(page(id), reviewed), true);
  const warnings = store.projectView(store.readProject(id)).pages[0].auditReuseWarnings;
  assert.deepEqual(warnings.map(({ key, id: rowId, question: text }) => ({ key, id: rowId, question: text })), [{ key: 'seo', id: reviewed.id, question }]);
  store.recordScan(id, 'home', input);
  const rescanned = customAuditRow(id);
  assert.equal(auditRowFresh(page(id), rescanned), false);
  assert.equal(rescanned.dependsOn, undefined);
  assert.equal(rescanned.evidence, null);
  assert.equal(rescanned.carriedFrom, undefined);
  assert.equal(rescanned.at, reviewed.at);
  assert.equal(rescanned.by, 'fresh-reviewer');
});

test('rewriting a custom question with explicit new dependencies carries only the new evidence', () => {
  const id = 'custom-rewrite-new-deps';
  const input = reviewedCustomQuestion(id);
  saveCustomQuestion(id, 'Does this workspace load within the reviewed performance budget?', ['loadMs']);
  const rewritten = customAuditRow(id);
  assert.deepEqual(rewritten.dependsOn, ['loadMs']);
  assert.deepEqual(rewritten.evidence.dependsOn, ['loadMs']);
  assert.deepEqual(Object.keys(rewritten.evidence.facts), ['loadMs']);
  assert.equal(rewritten.carriedFrom, undefined);
  store.recordVerdicts(id, 'home', { audit: { seo: [{ id: rewritten.id, status: 'pass', note: 'Reviewed the measured load time against the performance budget.' }] } }, 'performance-reviewer');
  const reviewed = customAuditRow(id);
  store.recordScan(id, 'home', input);
  const rescanned = customAuditRow(id);
  assert.equal(auditRowFresh(page(id), rescanned), true);
  assert.deepEqual(rescanned.evidence, reviewed.evidence);
  assert.deepEqual(rescanned.dependsOn, ['loadMs']);
  assert.ok(rescanned.carriedFrom);
  assert.equal(rescanned.at, reviewed.at);
  assert.equal(rescanned.by, 'performance-reviewer');
  assert.deepEqual(store.projectView(store.readProject(id)).pages[0].auditReuseWarnings, []);
});

function allAuditVerdicts(id) {
  const audit = Object.fromEntries(Object.entries(page(id).audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note: 'Reviewed the visible page and supporting code evidence.' }))]));
  store.recordVerdicts(id, 'home', { audit }, 'original-reviewer');
}

test('pixel-identical re-encoding and subthreshold noise preserve all visual audit evidence', () => {
  const id = 'visual-baseline';
  create(id);
  const file = image();
  const pixels = decodePng(readFileSync(file)).pixels;
  const reencoded = encodedScreenshot('reencoded.png', pixels, 0);
  assert.equal(imageDifference(readFileSync(file), readFileSync(reencoded)).changedShare, 0);
  assert.notDeepEqual(readFileSync(file), readFileSync(reencoded));
  store.recordScan(id, 'home', scanInput(file));
  const legacyScan = store.readProject(id);
  delete legacyScan.pages[0].scan.visualBaseline;
  store.writeProject(legacyScan);
  allAuditVerdicts(id);
  const original = page(id);
  store.recordScan(id, 'home', scanInput(reencoded));
  let target = page(id);
  assert.notEqual(target.captures.desktop.sha256, original.captures.desktop.sha256);
  assert.equal(target.scan.visualBaseline.desktop, original.captures.desktop.sha256);
  assert.equal(target.scan.changes.desktop.changed, false);
  assert.ok(Object.values(target.audit).flat().every(row => auditRowFresh(target, row)));
  assert.equal(store.pageProgress(store.readProject(id), target).staleCount, 0);
  const noise = Buffer.from(pixels);
  noise[0] = 255 - noise[0];
  const noisyFile = encodedScreenshot('subthreshold.png', noise);
  store.recordScan(id, 'home', scanInput(noisyFile));
  target = page(id);
  assert.equal(target.scan.changes.desktop.changed, false);
  assert.equal(target.scan.visualBaseline.desktop, original.captures.desktop.sha256);
  assert.ok(Object.values(target.audit).flat().every(row => auditRowFresh(target, row)));
});

test('real per-device visual change stales exactly visual dependencies and clears their carry marker', () => {
  const id = 'visual-change';
  create(id);
  const file = image();
  store.recordScan(id, 'home', scanInput(file));
  allAuditVerdicts(id);
  store.recordScan(id, 'home', scanInput(file));
  const carried = page(id);
  assert.ok(carried.audit.security[0].carriedFrom);
  const pixels = Buffer.from(decodePng(readFileSync(file)).pixels);
  for (let i = 0; i < 300; i += 1) pixels[i] = 255 - pixels[i];
  const changed = encodedScreenshot('real-change.png', pixels);
  store.recordScan(id, 'home', scanInput(file, { desktop: { file: changed, viewport: '1280 x 900', facts: facts() } }));
  const target = page(id);
  assert.equal(target.scan.changes.desktop.changed, true);
  assert.equal(target.scan.visualBaseline.mobile, carried.scan.visualBaseline.mobile);
  const stale = Object.entries(target.audit).flatMap(([key, rows]) => rows.filter(row => !auditRowFresh(target, row)).map(row => `${key}:${row.id}`));
  assert.deepEqual(stale, ['security:inputs', 'security:private-data', 'scraping:bulk', 'scraping:public-copy', 'accessibility:keyboard', 'accessibility:contrast', 'accessibility:reflow']);
  assert.equal(target.audit.security[0].carriedFrom, undefined);
  assert.ok(target.audit.seo[0].carriedFrom);
});

test('changed facts clear their old carry marker and explicit contexts still invalidate baselines', () => {
  const id = 'changed-carry';
  create(id);
  const file = image();
  store.recordScan(id, 'home', scanInput(file));
  allAuditVerdicts(id);
  store.recordScan(id, 'home', scanInput(file));
  assert.ok(page(id).audit.seo[0].carriedFrom);
  const desktopFacts = facts();
  desktopFacts.seo.title = 'A new title';
  store.recordScan(id, 'home', scanInput(file, { desktop: { file, viewport: '1280 x 900', facts: desktopFacts } }));
  assert.equal(page(id).audit.seo[0].carriedFrom, undefined);
  const target = page(id);
  target.scan.environment = 'mock';
  assert.equal(auditRowFresh(target, target.audit.security[0]), false);
});

test('measurement acceptance is idempotent, preserves attribution, and offers only changed evidence', () => {
  const id = 'measured-idempotent';
  create(id);
  const file = image();
  store.recordScan(id, 'home', scanInput(file));
  assert.equal(store.projectView(store.readProject(id)).pages[0].measuredAnswers.length, 5);
  store.acceptMeasuredAnswers(id, 'home', 'first-reviewer');
  const accepted = page(id).audit.seo.find(row => row.id === 'measured-title');
  assert.equal(measuredAnswers(page(id)).length, 0);
  assert.throws(() => store.acceptMeasuredAnswers(id, 'home', 'second-reviewer'), error => error.status === 400 && error.message === 'No new measured answers for the current scan.');
  assert.equal(page(id).audit.seo.find(row => row.id === 'measured-title').by, 'first-reviewer');
  assert.equal(page(id).audit.seo.find(row => row.id === 'measured-title').at, accepted.at);
  store.recordScan(id, 'home', scanInput(file));
  assert.equal(measuredAnswers(page(id)).length, 0);
  const changedFacts = facts();
  changedFacts.seo.title = '';
  store.recordScan(id, 'home', scanInput(file, { desktop: { file, viewport: '1280 x 900', facts: changedFacts } }));
  assert.deepEqual(measuredAnswers(page(id)).map(row => row.id), ['measured-title']);
  store.acceptMeasuredAnswers(id, 'home', 'changed-reviewer');
  assert.equal(page(id).audit.seo.find(row => row.id === 'measured-title').status, 'needs_work');
  assert.equal(measuredAnswers(page(id)).length, 0);
});


test('a deployment retries a conflicting write without losing it or duplicating the receipt', () => {
  const id = 'deployment-retry';
  create(id);
  let attempts = 0;
  const input = { id: 'raced-deploy', get url() {
    attempts += 1;
    if (attempts === 1) store.createFinding(id, 'home', { severity: 'P3', title: 'Concurrent finding preserved', detail: 'A page finding races the project deployment write.', attachCapture: false }, 'concurrent-writer');
    return 'https://live.example.com';
  } };
  store.recordDeployment(id, input, 'shipper');
  const project = store.readProject(id);
  assert.equal(attempts, 2);
  assert.equal(project.deployments.length, 1);
  assert.equal(project.deployments[0].id, 'raced-deploy');
  assert.equal(project.pages[0].findings.length, 1);
});

test('project retry is bounded and never overwrites writers that keep racing it', () => {
  const id = 'deployment-bounded';
  create(id);
  let attempts = 0;
  const input = { id: 'cannot-land', get url() {
    attempts += 1;
    store.createFinding(id, 'home', { severity: 'P3', title: 'Concurrent finding ' + attempts, detail: 'Each attempt races with another correctly attributed write.', attachCapture: false }, 'concurrent-writer');
    return 'https://live.example.com';
  } };
  assert.throws(() => store.recordDeployment(id, input, 'shipper'), error => error.code === 'STALE_PROJECT');
  const project = store.readProject(id);
  assert.equal(attempts, 5);
  assert.equal(project.deployments, undefined);
  assert.equal(project.pages[0].findings.length, 5);
});
