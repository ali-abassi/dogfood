import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { auditEvidence, carryAuditEvidence } from '../lib/audit-evidence.mjs';
import { pageAnswers } from '../lib/answers.mjs';
import { pageAcceptance, pageCompletion, pageStatus, pagesGate } from '../lib/completion.mjs';

const at = '2026-09-29T10:00:00Z';
const later = '2026-09-29T11:00:00Z';
const note = 'Verified in the named fixture on both viewports.';
const verdict = { status: 'pass', note, by: 'agent:proof', at, fingerprint: 'v1' };
const dependencies = { security: ['fingerprint', 'captures.desktop', 'captures.mobile'], scraping: ['fingerprint', 'captures.desktop', 'captures.mobile'], seo: ['seo.title'], accessibility: ['horizontalOverflow'] };

function fixture() {
  const facts = { loadMs: 500, pageErrors: [], failedRequests: [], horizontalOverflow: false,
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, seo: { title: 'Shop', description: 'Our shop' } };
  const page = { id: 'home', name: 'Home', captures: Object.fromEntries(['desktop', 'mobile'].map(device => [device,
    { state: 'rendered', fullPage: true, sha256: device, fingerprint: 'v1' }])),
    scan: { scannedAt: at, lastChangedAt: at, sourceUrl: 'http://localhost/#/home', environment: 'local', fingerprint: 'v1',
      captureSha256: { desktop: 'desktop', mobile: 'mobile' }, viewports: { desktop: structuredClone(facts), mobile: structuredClone(facts) } },
    checks: Object.fromEntries(['design', 'purpose', 'ease'].map(key => [key, { ...verdict }])),
    features: [{ id: 'buy', name: 'Buy', ...verdict }], findings: [], qa: { tests: [] },
    audit: Object.fromEntries(['security', 'scraping', 'seo', 'accessibility'].map(key => [key,
      [{ id: `${key}-fact`, question: `Review ${key}`, dependsOn: dependencies[key], ...verdict }]])) };
  for (const [key, rows] of Object.entries(page.audit)) for (const row of rows) row.evidence = auditEvidence(page, key, row, 'v1');
  return page;
}

function progress(page, fingerprint = null) {
  const answers = pageAnswers(page, null);
  const completion = pageCompletion(page, answers, fingerprint);
  const acceptance = pageAcceptance(page, answers, completion);
  return { ...completion, accepted: acceptance.accepted, acceptanceRequirements: acceptance.requirements,
    status: pageStatus(page, answers, completion), answers };
}

function defer(page) {
  Object.assign(page.features[0], { status: 'awaiting_live', requiresLive: true,
    liveDebt: { state: 'awaiting_deploy', reason: 'Checkout needs the deployed payment provider.', by: 'agent:proof', at } });
  return page;
}

test('unchanged declared facts carry through a rescan without timestamp or fingerprint blanket staleness', () => {
  const page = fixture();
  const previousScan = structuredClone(page.scan);
  page.scan.scannedAt = later;
  page.scan.lastChangedAt = later;
  page.scan.fingerprint = 'v2';
  carryAuditEvidence(page, previousScan, 'v2');
  const auditRequirements = progress(page, 'v2').requirements.filter(row => row.id.startsWith('audit:seo:') || row.id.startsWith('audit:accessibility:'));
  assert.ok(auditRequirements.every(row => row.met));
  assert.equal(progress(page, 'v2').requirements.find(row => row.id === 'audit:security:security-fact').met, false, 'security judgment stays strict');
  assert.equal(page.audit.seo[0].at, at);
  assert.equal(page.audit.seo[0].by, 'agent:proof');
  assert.equal(page.audit.seo[0].carriedFrom.scannedAt, at);
  assert.equal(progress(page, 'v2').requirements.find(row => row.id === 'feature:buy').met, false, 'feature judgment stays strict');
});

test('dependency and context changes invalidate only affected evidence and legacy unknown snapshots stay stale', () => {
  const page = fixture();
  page.audit.accessibility[0].dependsOn = ['horizontalOverflow'];
  page.audit.accessibility[0].evidence = auditEvidence(page, 'accessibility', page.audit.accessibility[0], 'v1');
  page.scan.viewports.mobile.seo.title = 'Changed title';
  assert.equal(progress(page).requirements.find(row => row.id === 'audit:seo:seo-fact').met, false);
  assert.equal(progress(page).requirements.find(row => row.id === 'audit:accessibility:accessibility-fact').met, true);
  page.scan.environment = 'live';
  assert.equal(progress(page).requirements.find(row => row.id === 'audit:accessibility:accessibility-fact').met, false);
  const legacy = fixture();
  delete legacy.audit.seo[0].evidence;
  legacy.scan.scannedAt = later;
  assert.equal(progress(legacy).requirements.find(row => row.id === 'audit:seo:seo-fact').met, false);
});

test('valid awaiting-deploy debt passes local gates while staying explicit and pending deployment blocks again', () => {
  const page = defer(fixture());
  page.progress = progress(page);
  assert.equal(page.progress.complete, true);
  assert.equal(page.progress.accepted, true);
  assert.equal(page.progress.status, 'awaiting_live');
  assert.equal(page.progress.answers.find(answer => answer.id === 'works').status, 'awaiting_live');
  assert.equal(page.progress.liveDebtCount, 1);
  assert.match(pagesGate([page], 'acceptance').lines[0], /awaiting_live.*live debt: 1/);
  page.features[0].status = 'untested';
  Object.assign(page.features[0].liveDebt, { state: 'pending', deploymentId: 'release-1', activatedAt: later });
  page.progress = progress(page);
  assert.equal(page.progress.complete, false);
  assert.equal(page.progress.accepted, false);
  assert.match(page.progress.answers.find(answer => answer.id === 'works').summary, /pending after deployment/);
});

test('ordinary broken/blocked features, malformed deferral, captures and scan failures still fail the local gate', () => {
  for (const status of ['blocked', 'needs_work']) {
    const page = defer(fixture());
    page.features.push({ id: 'other', name: 'Other feature', ...verdict, status });
    assert.equal(progress(page).accepted, false);
  }
  const invalid = defer(fixture());
  invalid.features[0].requiresLive = false;
  assert.equal(progress(invalid).complete, false);
  const missing = defer(fixture());
  missing.captures.mobile.fullPage = false;
  assert.equal(progress(missing).complete, false);
  const scanFailed = defer(fixture());
  scanFailed.scanAttempt = { status: 'failed', reason: 'Wrong required role.' };
  assert.equal(progress(scanFailed).complete, false);
});

test('manifest checker accepts feature debt, rejects audit deferrals and validates evidence context', () => {
  const data = mkdtempSync(join(tmpdir(), 'dogfood-daily-check-'));
  cpSync(new URL('../demo', import.meta.url), data, { recursive: true });
  const file = join(data, 'projects/tidepool.json');
  const project = JSON.parse(readFileSync(file, 'utf8'));
  const page = project.pages[0];
  const feature = page.features[0];
  Object.assign(feature, defer(fixture()).features[0]);
  const run = () => spawnSync(process.execPath, ['scripts/check-projects.mjs'], { encoding: 'utf8', env: { ...process.env, DOGFOOD_DATA: data } });
  try {
    writeFileSync(file, JSON.stringify(project));
    assert.equal(run().status, 0);
    Object.assign(page.checks.design, { ...verdict, status: 'awaiting_live' });
    writeFileSync(file, JSON.stringify(project));
    assert.match(run().stderr, /invalid review status/);
    page.checks.design.status = 'pass';
    const row = page.audit.seo[0];
    row.evidence = auditEvidence(fixture(), 'seo', { ...row, dependsOn: ['seo.title'] });
    row.evidence.context.environment = 'guess';
    writeFileSync(file, JSON.stringify(project));
    assert.match(run().stderr, /audit evidence environment invalid/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});

test('report names deferred and pending proof and preserves original carried attribution', async () => {
  const data = mkdtempSync(join(tmpdir(), 'dogfood-daily-report-'));
  cpSync(new URL('../demo', import.meta.url), data, { recursive: true });
  process.env.DOGFOOD_DATA = data;
  const file = join(data, 'projects/tidepool.json');
  const project = JSON.parse(readFileSync(file, 'utf8'));
  const page = project.pages[0];
  const feature = page.features[0];
  Object.assign(feature, { status: 'awaiting_live', requiresLive: true, liveDebt: defer(fixture()).features[0].liveDebt });
  const row = page.audit.seo[0];
  Object.assign(row, { by: 'agent:original', at, dependsOn: ['seo.title'], carriedFrom: { scannedAt: at, sourceUrl: page.scan.sourceUrl } });
  row.evidence = auditEvidence(page, 'seo', row);
  try {
    writeFileSync(file, JSON.stringify(project));
    const { projectReport } = await import('../lib/report.mjs');
    const report = projectReport('tidepool');
    assert.ok(report.includes(`${page.name}, ${feature.name}: Deferred until deployment and live verification.`));
    assert.match(report, /Original verdict by agent:original at 2026-09-29T10:00:00Z; matching declared scan facts/);
    assert.match(report, /This does not add provider proof/);
    feature.status = 'untested';
    feature.liveDebt.state = 'pending';
    page.scan.environment = 'live';
    writeFileSync(file, JSON.stringify(project));
    const pending = projectReport('tidepool');
    assert.match(pending, /Live verification pending after deployment/);
    assert.match(pending, /earlier carry no longer matches current declared evidence/);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
