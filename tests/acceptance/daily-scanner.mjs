// Native browser proof uses only two owned loopback origins, a temporary profile and disposable data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'dogfood-daily-native-'));
process.env.DOGFOOD_DATA = join(directory, 'data');
delete process.env.DOGFOOD_BROWSER_STATE;
const store = await import('../../lib/store.mjs');
const scanner = await import('../../lib/scanner.mjs');
const checkout = join(directory, 'checkout');
execFileSync('git', ['init', '-q', checkout]);
writeFileSync(join(checkout, 'app.txt'), 'owned synthetic checkout');
execFileSync('git', ['-C', checkout, 'add', 'app.txt']);
execFileSync('git', ['-C', checkout, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic fixture']);

let liveRole = '';
const requests = { local: [], live: [] };
function fixture(origin) {
  return createServer((request, response) => {
    requests[origin].push(request.url);
    const role = origin === 'local' ? 'Administrator' : liveRole;
    response.writeHead(404, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' });
    response.end(`<!doctype html><html lang="en"><head><title>${origin} missing route</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>${origin} missing route</h1><p data-role>${role}</p><p>${origin === 'live' ? 'Deployed synthetic page' : 'Local checkout page'}</p></body></html>`);
  });
}
const local = fixture('local');
const live = fixture('live');
await Promise.all([new Promise(done => local.listen(0, '127.0.0.1', done)), new Promise(done => live.listen(0, '127.0.0.1', done))]);
const localUrl = `http://127.0.0.1:${local.address().port}/`;
const liveUrl = `http://127.0.0.1:${live.address().port}/`;
const browserProfile = join(directory, 'browser');
const route = '/missing?case=role%20proof#keep/hash';
let checks = 0;
function check(name, action) {
  action();
  console.log(`ok ${++checks} - ${name}`);
}
const currentPage = () => store.pageById(store.readProject('native-daily'), 'missing');
async function scan(browser, options = {}) {
  const project = store.readProject('native-daily');
  return scanner.scanPages(browser, project, [store.pageById(project, 'missing')], undefined, { browserProfile, ...options });
}

try {
  store.createProject({ id: 'native-daily', name: 'Owned synthetic fixture', url: localUrl, checkout,
    fixtureSetup: { seed: { argv: [process.execPath, '-e', "require('node:fs').writeFileSync('seeded','ok')"], timeoutMs: 2000 } } });
  store.registerPage('native-daily', { id: 'missing', name: 'Missing route', group: 'Fixture', route, expectedStatus: 404 });
  await scanner.withScanner(browserProfile, async browser => {
    assert.equal((await scan(browser)).scanned, 1);
    check('local capture carries checkout evidence and retains exact hash route', () => {
      const page = currentPage();
      assert.equal(page.scan.sourceUrl, `${localUrl.slice(0, -1)}${route}`);
      assert.equal(page.scan.environment, 'local');
      assert.ok(page.scan.fingerprint);
      assert.equal(page.scan.viewports.desktop.failedRequests.length, 0);
    });
    assert.equal((await scan(browser, { liveUrl })).scanned, 1);
    check('explicit live scan reaches the other origin and leaves local configuration intact', () => {
      const project = store.readProject('native-daily');
      const page = currentPage();
      assert.equal(project.source.url, localUrl);
      assert.equal(page.scan.sourceUrl, `${liveUrl.slice(0, -1)}${route}`);
      assert.equal(page.scan.environment, 'live');
      assert.equal(page.scan.viewports.desktop.seo.title, 'live missing route');
      assert.ok(requests.live.includes('/missing?case=role%20proof'));
      assert.equal(page.scan.fingerprint, undefined);
      assert.equal(page.captures.desktop.fingerprint, undefined);
      assert.equal(page.captures.desktop.gitSha, undefined);
      assert.equal(page.scan.viewports.desktop.failedRequests.length, 0);
      assert.equal(page.scan.viewports.desktop.headers['x-frame-options'], 'DENY');
    });
    store.registerPage('native-daily', { id: 'missing', name: 'Missing route', group: 'Fixture', route, requiredRole: 'admin', roleProof: { selector: '[data-role]', expectedText: 'Administrator' } });
    const previousScan = currentPage().scan.scannedAt;
    const missingRole = await scan(browser, { liveUrl });
    check('wrong-role expected 404 fails setup and cannot replace accepted evidence', () => {
      assert.equal(missingRole.scanned, 0);
      assert.equal(missingRole.failed[0].code, 'SETUP_MISSING');
      assert.match(missingRole.failed[0].error, /absent or mismatched/);
      assert.equal(currentPage().scan.scannedAt, previousScan);
      assert.equal(currentPage().scanAttempt.status, 'failed');
    });
    liveRole = 'Viewer';
    assert.equal((await scan(browser, { liveUrl })).failed[0].code, 'SETUP_MISSING');
    liveRole = '<span style="display:none">Administrator</span>';
    const hiddenProof = await scan(browser, { liveUrl });
    check('a hidden role label and a different visible role cannot prove prerequisites', () => {
      assert.equal(hiddenProof.failed[0].code, 'SETUP_MISSING');
      assert.equal(currentPage().scan.scannedAt, previousScan);
    });
    liveRole = 'Administrator';
    assert.equal((await scan(browser, { liveUrl })).scanned, 1);
    check('visible role proof succeeds on both viewports with explicit profile provenance', () => {
      const page = currentPage();
      assert.equal(page.scan.requiredRole, 'admin');
      assert.equal(page.scan.verifiedRole, 'admin');
      assert.equal(page.scan.browserProfile, browserProfile);
      assert.deepEqual(page.scan.roleProof, { selector: '[data-role]', expectedText: 'Administrator' });
    });
    store.registerPage('native-daily', { id: 'missing', name: 'Missing route', group: 'Fixture', route, fixture: ['seed'] });
    const notOptedIn = await scan(browser);
    check('a required fixture without opt-in cannot run', () => {
      assert.equal(notOptedIn.failed[0].code, 'SETUP_MISSING');
      assert.equal(existsSync(join(checkout, 'seeded')), false);
    });
    const forbidden = await scan(browser, { liveUrl, fixtures: ['seed'] });
    check('live scan refuses fixture setup before touching the local command', () => {
      assert.equal(forbidden.failed[0].code, 'SETUP_MISSING');
      assert.match(forbidden.failed[0].error, /only on local/);
      assert.equal(existsSync(join(checkout, 'seeded')), false);
    });
    assert.equal((await scan(browser, { fixtures: ['seed'] })).scanned, 1);
    check('explicit local fixture runs argv in its checkout and records context', () => {
      assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'ok');
      assert.equal(currentPage().scan.environment, 'local');
      assert.deepEqual(currentPage().scan.fixture, ['seed']);
      assert.equal(currentPage().scan.verifiedRole, 'admin');
    });
  }, { explicitProfile: true });
  console.log(`${checks} native scanner checks passed`);
} finally {
  await Promise.all([new Promise(done => local.close(done)), new Promise(done => live.close(done))]);
  rmSync(directory, { recursive: true, force: true });
}
