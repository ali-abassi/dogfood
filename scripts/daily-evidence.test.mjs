import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { encodePng } from '../lib/diff.mjs';
import { auditEvidence, auditRowFresh, carryAuditEvidence, measuredAnswers } from '../lib/audit-evidence.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-daily-evidence-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

function facts() {
  return {
    loadMs: 420, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false,
    seo: { title: 'Your workspace', description: 'Manage your workspace here.', robots: 'noindex', canonical: 'https://example.com/', lang: 'en', h1: 'Workspace', h1Count: 1 },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {},
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

test('measured candidates expose bad facts without inventing human judgments', () => {
  const page = freshPage();
  assert.equal(measuredAnswers(page).length, 6);
  assert.ok(measuredAnswers(page).every(row => row.status === 'pass'));
  page.scan.viewports.desktop.seo.title = '';
  page.scan.viewports.mobile.accessibility.unlabeledFields = 2;
  page.scan.viewports.mobile.horizontalOverflow = true;
  const candidates = measuredAnswers(page);
  assert.equal(candidates.length, 6);
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
