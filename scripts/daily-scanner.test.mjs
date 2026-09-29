import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { livePageUrl, runLocalFixtures, scanTarget, verifyRole } from '../lib/scan-target.mjs';
import { viewportFacts } from '../lib/scanner.mjs';

const project = { source: { url: 'http://localhost:5173/' } };
const page = { id: 'settings', route: '/settings?view=full#tab/security' };

test('explicit live rebasing retains registered path query hash and local configuration', () => {
  assert.equal(livePageUrl(project, page, 'https://app.example/deployed?ignore=yes'), 'https://app.example/settings?view=full#tab/security');
  assert.equal(livePageUrl(project, { ...page, url: 'http://localhost:5173/exact?a=1%202#keep/%20' }, 'https://app.example/'), 'https://app.example/exact?a=1%202#keep/%20');
  assert.equal(project.source.url, 'http://localhost:5173/');
  assert.equal(scanTarget(project, page).environment, 'local');
  assert.equal(scanTarget(project, page, { liveUrl: 'http://127.0.0.1:9876/' }).environment, 'live');
});

test('role prerequisites require a manual profile and bounded DOM proof', () => {
  const rolePage = { ...page, requiredRole: 'admin', roleProof: { selector: '[data-role]', expectedText: 'Administrator' } };
  assert.throws(() => scanTarget(project, rolePage), { code: 'SETUP_MISSING', message: /manually prepared browserProfile/ });
  assert.throws(() => scanTarget(project, rolePage, { browserProfile: 'Admin', requiredRole: 'viewer' }), { code: 'SETUP_MISSING', message: /requires the admin role/ });
  assert.throws(() => scanTarget(project, { ...rolePage, roleProof: { selector: 'x'.repeat(301), expectedText: 'Admin' } }, { browserProfile: 'Admin' }), /bounded DOM selector/);
  assert.equal(scanTarget(project, rolePage, { browserProfile: 'Admin' }).requiredRole, 'admin');
});

test('absent or mismatched visible role proof fails as setup missing', async () => {
  const target = scanTarget(project, { ...page, requiredRole: 'admin', roleProof: { selector: '[data-role]', expectedText: 'Administrator' } }, { browserProfile: 'Admin' });
  await assert.rejects(verifyRole({ evaluate: async () => false }, target), { code: 'SETUP_MISSING', message: /absent or mismatched/ });
  assert.equal(await verifyRole({ evaluate: async () => true }, target), 'admin');
});

test('an expected 404 with hash ignores only its document and still finds failed assets', () => {
  const document = { url: 'https://app.example/missing?mode=full#tab', seo: {}, accessibility: {}, horizontalOverflow: false };
  const requests = [
    { method: 'GET', url: 'https://app.example/missing?mode=full', status: 404, resourceType: 'document', responseHeaders: { 'X-Frame-Options': 'DENY' } },
    { method: 'GET', url: 'https://app.example/broken', status: 404, resourceType: 'fetch' },
  ];
  const facts = viewportFacts(document, requests, [], [], 404);
  assert.deepEqual(facts.failedRequests.map(request => request.url), ['https://app.example/broken']);
  assert.equal(facts.headers['x-frame-options'], 'DENY');
});

test('required named fixtures need explicit local opt-in and refuse live scans', () => {
  const fixturePage = { ...page, fixture: ['seed'] };
  assert.throws(() => scanTarget(project, fixturePage), { code: 'SETUP_MISSING', message: /opt in/ });
  assert.throws(() => scanTarget(project, fixturePage, { liveUrl: 'https://app.example', fixtures: ['seed'] }), { code: 'SETUP_MISSING', message: /only on local/ });
  assert.throws(() => scanTarget(project, page, { liveUrl: 'https://app.example', fixtures: ['seed'] }), /only on local/);
});

test('only explicitly requested configured argv fixture commands run', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'dogfood-fixture-unit-'));
  const marker = join(checkout, 'seeded');
  const fixtureProject = { ...project, fixtureSetup: { seed: { argv: [process.execPath, '-e', "require('node:fs').writeFileSync('seeded','ok')"] } } };
  try {
    await runLocalFixtures(fixtureProject, scanTarget(fixtureProject, page), checkout);
    assert.equal(existsSync(marker), false);
    await runLocalFixtures(fixtureProject, scanTarget(fixtureProject, page, { fixtures: ['seed'] }), checkout);
    assert.equal(existsSync(marker), true);
    await assert.rejects(runLocalFixtures(fixtureProject, { environment: 'live', fixture: ['seed'] }, checkout), /only on local/);
    await assert.rejects(runLocalFixtures(fixtureProject, { environment: 'local', fixture: ['missing'] }, checkout), /configure an argv command/);
  } finally { rmSync(checkout, { recursive: true, force: true }); }
});

test('setup timeout and command output stay bounded and do not leak output', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'dogfood-fixture-timeout-'));
  const fixtureProject = { fixtureSetup: { hung: { argv: [process.execPath, '-e', "console.error('PRIVATE_OUTPUT');setTimeout(()=>{},10000)"], timeoutMs: 100 } } };
  const before = Date.now();
  try {
    await assert.rejects(runLocalFixtures(fixtureProject, { environment: 'local', fixture: ['hung'] }, checkout), error => error.code === 'SETUP_MISSING' && !error.message.includes('PRIVATE_OUTPUT'));
    assert.ok(Date.now() - before < 3000);
  } finally { rmSync(checkout, { recursive: true, force: true }); }
});


test('setup timeout also bounds owned subprocess groups', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'dogfood-fixture-group-'));
  const command = "require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:'inherit'});setTimeout(()=>{},10000)";
  const fixtureProject = { fixtureSetup: { hung: { argv: [process.execPath, '-e', command], timeoutMs: 100 } } };
  const before = Date.now();
  try {
    await assert.rejects(runLocalFixtures(fixtureProject, { environment: 'local', fixture: ['hung'] }, checkout), { code: 'SETUP_MISSING' });
    assert.ok(Date.now() - before < 3000);
  } finally { rmSync(checkout, { recursive: true, force: true }); }
});
