import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { livePageUrl, runLocalFixtures, scanTarget, verifyRole } from '../lib/scan-target.mjs';
const data = mkdtempSync(join(tmpdir(), 'dogfood-daily-scanner-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { scanPages, viewportFacts } = await import('../lib/scanner.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

const project = { source: { url: 'http://localhost:5173/' } };
const page = { id: 'settings', route: '/settings?view=full#tab/security' };

test('explicit live rebasing retains registered path query hash and local configuration', () => {
  assert.equal(livePageUrl(project, page, 'https://app.example/deployed?ignore=yes'), 'https://app.example/settings?view=full#tab/security');
  assert.equal(livePageUrl(project, { ...page, url: 'http://localhost:5173/exact?a=1%202#keep/%20' }, 'https://app.example/'), 'https://app.example/exact?a=1%202#keep/%20');
  assert.equal(livePageUrl(project, { ...page, url: 'http://localhost:5173/exact?#' }, 'https://app.example/'), 'https://app.example/exact?#');
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


function fixtureBrowser() {
  let url;
  return {
    command: async args => {
      if (args[0] === 'open') url = args[1];
      if (args[0] === 'screenshot') copyFileSync(new URL(`../demo/captures/tidepool/${url.includes('/second') ? 'classes' : 'home'}.png`, import.meta.url), args[2]);
      return { requests: [], messages: [], errors: [] };
    },
    evaluate: async () => ({ url, loadMs: 100, horizontalOverflow: false, links: [],
      seo: { title: 'Configured fixture', h1: 'Fixture', description: 'Fixture', canonical: null, robots: null, lang: 'en', h1Count: 1 },
      accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 } }),
  };
}

function acceptanceRequirement(project, page, id) {
  return store.pageProgress(project, page).acceptanceRequirements.find(row => row.id === id).met;
}

test('configured remote URL-only scans retain base acceptance without a deployment receipt', async () => {
  store.createProject({ id: 'configured-remote', name: 'Configured remote', url: 'https://app.example.com/' });
  store.registerPage('configured-remote', { id: 'home', name: 'Home', group: 'Public', route: '/' });
  const project = store.readProject('configured-remote');
  const result = await scanPages(fixtureBrowser(), project, project.pages);
  assert.equal(result.scanned, 1, JSON.stringify(result));
  const fresh = store.readProject(project.id);
  assert.equal(fresh.pages[0].scan.environment, 'local');
  assert.equal(acceptanceRequirement(fresh, fresh.pages[0], 'provenance'), true);
  assert.equal(acceptanceRequirement(fresh, fresh.pages[0], 'environment'), true);
  assert.equal(fresh.deployments, undefined);
});

test('configured LAN checkout fixtures run once per invocation across multiple pages', async () => {
  const checkout = mkdtempSync(join(tmpdir(), 'dogfood-lan-fixture-'));
  execFileSync('git', ['init', '-q', checkout]);
  writeFileSync(join(checkout, 'app.txt'), 'Owned LAN fixture checkout');
  execFileSync('git', ['-C', checkout, 'add', 'app.txt']);
  execFileSync('git', ['-C', checkout, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Owned fixture']);
  try {
    store.createProject({ id: 'lan-fixture', name: 'LAN fixture', url: 'http://192.168.1.20:3000/', servesCheckout: true, checkout,
      fixtureSetup: { seed: { argv: [process.execPath, '-e', "require('node:fs').appendFileSync('seeded','seed\\n')"] } } });
    store.registerPage('lan-fixture', { id: 'first', name: 'First', group: 'App', route: '/first', fixture: ['seed'] });
    store.registerPage('lan-fixture', { id: 'second', name: 'Second', group: 'App', route: '/second' });
    const project = store.readProject('lan-fixture');
    assert.equal(scanTarget(project, project.pages[0], { fixtures: ['seed'] }).environment, 'local');
    const result = await scanPages(fixtureBrowser(), project, project.pages, undefined, { fixtures: ['seed'] });
    assert.equal(result.scanned, 2, JSON.stringify(result));
    assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'seed\n');
    const fresh = store.readProject(project.id);
    for (const page of fresh.pages) {
      assert.equal(page.scan.environment, 'local');
      assert.ok(page.scan.fingerprint);
      assert.equal(acceptanceRequirement(fresh, page, 'provenance'), true);
      assert.equal(acceptanceRequirement(fresh, page, 'environment'), true);
    }
    assert.equal((await scanPages(fixtureBrowser(), fresh, fresh.pages, undefined, { fixtures: ['seed'] })).scanned, 2);
    assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'seed\nseed\n', 'a new invocation runs setup once again');
    store.registerPage(project.id, { id: 'third', name: 'Missing prerequisite', group: 'App', route: '/third', fixture: ['other'] });
    const withMissing = store.readProject(project.id);
    const incomplete = await scanPages(fixtureBrowser(), withMissing, [withMissing.pages[0], withMissing.pages[2]], undefined, { fixtures: ['seed'] });
    assert.equal(incomplete.scanned, 1);
    assert.equal(incomplete.failed[0].code, 'SETUP_MISSING');
    assert.match(incomplete.failed[0].error, /other/);
    assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'seed\nseed\nseed\n');
    const liveResult = await scanPages(fixtureBrowser(), store.readProject(project.id), fresh.pages, undefined, { liveUrl: 'https://deployed.example', fixtures: ['seed'] });
    assert.equal(liveResult.failed.length, 2);
    assert.ok(liveResult.failed.every(row => row.code === 'SETUP_MISSING'));
    assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'seed\nseed\nseed\n');
  } finally { rmSync(checkout, { recursive: true, force: true }); }
});
