// Native browser proof uses only two owned loopback origins, a temporary profile and disposable data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scanSessions = value => new Set(value.match(/dogfood-scan-[a-f0-9]+/g) ?? []);
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
    const label = new URL(request.url, 'http://fixture').pathname === '/missing' ? 'missing route' : 'another route';
    response.writeHead(404, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' });
    response.end(`<!doctype html><html lang="en"><head><title>${origin} ${label}</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;min-height:100vh;background:#e9edf2;font:16px system-ui;border-bottom:8px solid #364b68;box-sizing:border-box"><main style="padding:24px"><h1>${origin} ${label}</h1><p data-role>${role}</p><p>${origin === 'live' ? 'Deployed synthetic page' : 'Local checkout page'}</p><p>${'Owned synthetic page content. '.repeat(200)}</p></main></body></html>`);
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
let ownedSession;
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
    fixtureSetup: { seed: { argv: [process.execPath, '-e', "require('node:fs').appendFileSync('seeded','ok\\n')"], timeoutMs: 2000 } } });
  store.registerPage('native-daily', { id: 'missing', name: 'Missing route', group: 'Fixture', route, expectedStatus: 404 });
  await scanner.withScanner(browserProfile, async browser => {
    ownedSession = browser.session;
    const localScan = await scan(browser);
    assert.equal(localScan.scanned, 1, JSON.stringify(localScan));
    check('local capture carries checkout evidence and retains exact hash route', () => {
      const page = currentPage();
      assert.equal(page.scan.sourceUrl, `${localUrl.slice(0, -1)}${route}`);
      assert.equal(page.scan.environment, 'local');
      assert.ok(page.scan.fingerprint);
      assert.equal(page.scan.viewports.desktop.failedRequests.length, 0);
    });
    const liveScan = await scan(browser, { liveUrl });
    assert.equal(liveScan.scanned, 1, JSON.stringify(liveScan));
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
    const verifiedScan = await scan(browser, { liveUrl });
    assert.equal(verifiedScan.scanned, 1, JSON.stringify(verifiedScan));
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
    const fixtureScan = await scan(browser, { fixtures: ['seed'] });
    assert.equal(fixtureScan.scanned, 1, JSON.stringify(fixtureScan));
    check('explicit local fixture runs argv in its checkout and records context', () => {
      assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'ok\n');
      assert.equal(currentPage().scan.environment, 'local');
      assert.deepEqual(currentPage().scan.fixture, ['seed']);
      assert.equal(currentPage().scan.verifiedRole, 'admin');
    });
    store.registerPage('native-daily', { id: 'second', name: 'Second page', group: 'Fixture', route: '/second?case=role%20proof#keep/hash', expectedStatus: 404 });
    const multiple = store.readProject('native-daily');
    const multiScan = await scanner.scanPages(browser, multiple, multiple.pages, undefined, { browserProfile, fixtures: ['seed'] });
    check('one native multi-page invocation executes requested setup once', () => {
      assert.equal(multiScan.scanned, 2, JSON.stringify(multiScan));
      assert.equal(readFileSync(join(checkout, 'seeded'), 'utf8'), 'ok\nok\n');
      assert.ok(store.readProject('native-daily').pages.every(page => page.scan.environment === 'local'));
    });
  }, { explicitProfile: true });
  let sessions;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    sessions = scanSessions(execFileSync('agent-browser', ['session', 'list'], { encoding: 'utf8' }));
    if (!sessions.has(ownedSession)) break;
    await new Promise(done => setTimeout(done, 100));
  }
  check('the proof closes only its owned temporary browser session', () => {
    assert.ok(ownedSession);
    assert.equal(sessions.has(ownedSession), false);
  });
  console.log(`${checks} native scanner checks passed`);
} finally {
  await Promise.all([new Promise(done => local.close(done)), new Promise(done => live.close(done))]);
  rmSync(directory, { recursive: true, force: true });
}
