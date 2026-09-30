import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { encodePng } from '../lib/diff.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-history-evidence-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { captureHistory } = await import('../lib/history.mjs');
const source = fileURLToPath(new URL('../lib/store.mjs', import.meta.url));
after(() => rmSync(data, { recursive: true, force: true }));

function facts() {
  return { loadMs: 12, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false,
    seo: { title: 'History', h1: 'History', description: 'Inspect past evidence', h1Count: 1, canonical: null, robots: 'noindex', lang: 'en' },
    accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {} };
}

function fixture(id) {
  store.createProject({ id, name: 'History proof', url: 'http://localhost:4322' });
  store.registerPage(id, { id: 'home', name: 'Home', group: 'App', route: '/' });
  const rgb = Buffer.alloc(40 * 20 * 3);
  for (let i = 0; i < rgb.length; i += 1) rgb[i] = i % 256;
  const file = join(data, `${id}.png`);
  writeFileSync(file, encodePng(40, 20, rgb));
  return file;
}

function scan(id, file, environment) {
  const live = environment === 'live';
  const sourceUrl = live ? 'https://live.example.com/' : 'http://localhost:4322/';
  const input = { sourceUrl, environment, actor: 'History QA agent', tier: environment === 'mock' ? 'mock' : 'automated',
    desktop: { file, viewport: '1280 x 900', facts: facts() }, mobile: { file, viewport: '390 x 844', facts: facts() } };
  if (live) input.liveUrl = 'https://live.example.com/';
  store.recordScan(id, 'home', input);
  return store.readProject(id).pages[0].captures;
}

test('history preserves local, live and mock provenance at capture time in sidecars', () => {
  const id = 'capture-provenance';
  const file = fixture(id);
  const local = scan(id, file, 'local');
  const live = scan(id, file, 'live');
  const mock = scan(id, file, 'mock');
  const history = captureHistory(id, 'home');
  for (const device of ['desktop', 'mobile']) {
    assert.equal(history[device].length, 3);
    const byEnvironment = Object.fromEntries(history[device].map(shot => [shot.environment, shot]));
    assert.equal(byEnvironment.local.sourceUrl, 'http://localhost:4322/');
    assert.equal(byEnvironment.local.takenAt, local[device].capturedAt);
    assert.equal(byEnvironment.local.tier, 'automated');
    assert.equal(byEnvironment.live.sourceUrl, 'https://live.example.com/');
    assert.equal(byEnvironment.live.takenAt, live[device].capturedAt);
    assert.equal(byEnvironment.mock.sourceUrl, 'http://localhost:4322/');
    assert.equal(byEnvironment.mock.takenAt, mock[device].capturedAt);
    assert.equal(byEnvironment.mock.tier, 'mock');
    const sidecar = JSON.parse(readFileSync(join(data, byEnvironment.local.path.slice(1)) + '.json', 'utf8'));
    assert.equal(sidecar.environment, 'local');
    assert.equal(sidecar.sourceUrl, 'http://localhost:4322/');
  }
});

test('legacy historical captures never borrow current provenance and current absent metadata is unknown', () => {
  const id = 'legacy-history';
  const file = fixture(id);
  scan(id, file, 'live');
  const directory = join(data, 'captures', id, 'history');
  mkdirSync(directory, { recursive: true });
  copyFileSync(file, join(directory, 'home-1700000000000.png'));
  const old = captureHistory(id, 'home').desktop.find(shot => shot.path.endsWith('1700000000000.png'));
  assert.equal(old.environment, 'unknown');
  assert.equal(old.sourceUrl, null);
  assert.equal(old.tier, null);
  const project = store.readProject(id);
  delete project.pages[0].captures.desktop.environment;
  store.writeProject(project);
  assert.equal(captureHistory(id, 'home').desktop[0].environment, 'unknown');
});

test('corrupt historical sidecars fail closed and archive sidecars are not listed as screenshots', () => {
  const id = 'corrupt-history';
  const file = fixture(id);
  scan(id, file, 'local');
  scan(id, file, 'live');
  let history = captureHistory(id, 'home').desktop;
  const old = history.find(shot => shot.environment === 'local');
  writeFileSync(join(data, old.path.slice(1)) + '.json', '{broken');
  history = captureHistory(id, 'home').desktop;
  assert.equal(history.length, 2);
  const unknown = history.find(shot => shot.path === old.path);
  assert.equal(unknown.environment, 'unknown');
  assert.equal(unknown.sourceUrl, null);
});

function writer(script) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `const store = await import(${JSON.stringify(source)}); ${script}`], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: 'inherit' });
    child.on('exit', code => code === 0 ? done() : fail(new Error(`Writer exited ${code}`)));
  });
}

test('deployment, fixture setup and page updates coexist across concurrent processes', async () => {
  const id = 'project-writes';
  fixture(id);
  const deployment = `for (let n=0;n<10;n++) store.recordDeployment('${id}', {id:'deploy-'+n,url:'https://live.example.com/'}, 'deployer');`;
  const fixtures = `for (let n=0;n<10;n++) store.setFixtureSetup('${id}', {['fixture-'+n]:{argv:['node','seed.mjs']}}, 'setup');`;
  const findings = `for (let n=0;n<10;n++) store.createFinding('${id}', 'home', {severity:'P3',title:'Concurrent finding '+n,detail:'Written alongside deployment and fixture setup changes.',attachCapture:false}, 'page-writer');`;
  await Promise.all([writer(deployment), writer(fixtures), writer(findings)]);
  const project = store.readProject(id);
  assert.equal(project.deployments.length, 10);
  assert.equal(project.fixtureSetupHistory.length, 10);
  assert.equal(project.pages[0].findings.length, 10);
  assert.ok(project.deployments.every(receipt => receipt.by === 'deployer'));
  assert.equal(project.fixtureSetupUpdated.by, 'setup');
});
