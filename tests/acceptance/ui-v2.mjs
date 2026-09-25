// Acceptance: desktop and mobile screenshots, scan results, accessibility, expected behavior,
// Add project, and the first-run welcome in the app (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-ui2-proof-'));
const empty = mkdtempSync(join(tmpdir(), 'dogfood-ui2-empty-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
process.env.DOGFOOD_DATA = data;
const store = await import(join(repo, 'lib/store.mjs'));

const facts = (overrides = {}) => ({
  loadMs: 1830, consoleErrors: ['Warning: slot list failed to parse'], pageErrors: [], failedRequests: [], horizontalOverflow: false,
  requests: [{ method: 'GET', url: 'https://tidepool.example/api/slots?day=sat', status: 200 }],
  seo: { title: 'Book a lesson · Tidepool', description: 'Pick a class and a time.', canonical: null, robots: null, lang: 'en', h1Count: 1 },
  accessibility: { imagesWithoutAlt: 0, unlabeledFields: 2, unnamedButtons: 1 },
  headers: { 'x-frame-options': 'DENY', 'content-security-policy': null },
  ...overrides,
});
store.recordScan('tidepool', 'book', {
  sourceUrl: 'https://tidepool.example/book', actor: 'Signed-out visitor', tier: 'automated',
  desktop: { file: join(repo, 'demo/captures/tidepool/book.png'), viewport: '1440 × 900', facts: facts() },
  mobile: { file: join(repo, 'demo/captures/tidepool/book.png'), viewport: '390 × 844', facts: facts({ pageErrors: ['TypeError: slots is undefined'], failedRequests: [{ method: 'POST', url: 'https://tidepool.example/api/hold', status: 503 }], horizontalOverflow: true }) },
});
const manifestFile = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.pages.find(item => item.id === 'book').features[0].expected = 'Lists all four classes with their ages.';
// A page whose mobile view was never captured, and never scanned.
Object.assign(manifest.pages.find(item => item.id === 'home'), { scan: null });
manifest.pages.find(item => item.id === 'home').captures.mobile = { state: 'blocked', reason: 'Not captured yet.' };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

const session = `dogfood-ui2-proof-${process.pid}`;
let passed = 0;
const servers = [];

async function freePort() {
  return new Promise(done => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
}

async function startServer(dataDir) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  servers.push(spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: dataDir }, stdio: 'ignore' }));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) return url; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('server did not start');
}

const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function page(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
const settle = () => browser('wait', '700');
const click = selector => page(`(document.querySelector(${JSON.stringify(selector)})?.click(), true)`);
const text = selector => page(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// Replaces window.fetch for the listed API paths and records what the app sent.
function stubApi(responses) {
  page(`(() => {
    const responses = ${JSON.stringify(responses)};
    window.__calls = [];
    const real = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
      const path = new URL(String(input), location.href).pathname;
      const key = (options.method || 'GET') + ' ' + path;
      if (!(key in responses)) return real(input, options);
      window.__calls.push({ key, body: options.body ? JSON.parse(options.body) : null });
      const [status, body] = responses[key];
      return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    };
    return true;
  })()`);
}

try {
  const url = await startServer(data);
  const project = await (await fetch(`${url}/api/projects/tidepool`)).json();
  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  settle();

  check('the overview flags pages with measured scan problems', () => {
    const problems = page(`document.querySelector('[data-overview-page="book"] [data-scan-problems]')?.dataset.scanProblems`);
    assert.equal(problems, '3', 'book has one page error, one failed request, and mobile sideways scrolling');
  });

  click('[data-page="book"]');
  settle();
  click('[data-view="capture"]');
  settle();
  check('See page shows the desktop and the mobile screenshot side by side', () => {
    assert.equal(page(`Boolean(document.querySelector('[data-device="desktop"] img'))`), true);
    assert.equal(page(`Boolean(document.querySelector('[data-device="mobile"] img'))`), true);
    const [desktop, mobile] = page(`['desktop', 'mobile'].map(device => document.querySelector('[data-device="' + device + '"]').getBoundingClientRect().width)`);
    assert.ok(mobile < desktop, 'the mobile screenshot is shown narrower than the desktop one');
  });
  check('See page shows the scan results for both devices', () => {
    const results = text('section[aria-label="Scan results"]');
    for (const expected of ['TypeError: slots is undefined', '/api/hold', '503', 'Warning: slot list failed to parse', '/api/slots', 'Book a lesson · Tidepool', 'DENY']) {
      assert.ok(results.includes(expected), `scan results should show ${expected}`);
    }
    assert.match(results, /1\.8\s?s|1,?830\s?ms/, 'load time');
    assert.match(results, /sideways|horizontal/i, 'mobile overflow');
    assert.match(results, /content-security-policy|CSP/i, 'a missing security header is named');
  });
  check('Scan again is a secondary action next to the AI review', () => {
    assert.equal(page(`Boolean(document.querySelector('button[data-action="scan"]'))`), true);
    assert.equal(page(`document.querySelectorAll('.page-workspace .save-button, .page-workspace .review-button').length`), 1, 'one filled blue button per view');
  });

  const rescanned = structuredClone(project);
  stubApi({ 'POST /api/projects/tidepool/pages/book/scan': [200, rescanned] });
  click('button[data-action="scan"]');
  settle();
  check('Scan again posts to the page scan API', () => {
    const calls = page('window.__calls');
    assert.deepEqual(calls.map(item => item.key), ['POST /api/projects/tidepool/pages/book/scan']);
  });

  click('[data-page="home"]');
  settle();
  click('[data-view="capture"]');
  settle();
  check('a page without a mobile screenshot says so and offers a scan', () => {
    assert.match(text('[data-device="mobile"]'), /Not captured yet/);
    assert.match(text('section[aria-label="Scan results"]'), /not been scanned|No scan yet/i);
  });

  click('[data-page="book"]');
  settle();
  click('[data-view="review"]');
  settle();
  check('features show their expected behavior', () => {
    assert.ok(text('section[aria-label="Page review"]').includes('Lists all four classes with their ages.'));
  });
  click('[data-view="risk"]');
  settle();
  check('Safety & search includes the accessibility checklist', () => {
    assert.match(text('.audit-section'), /Accessibility/);
    assert.match(text('.audit-section'), /keyboard/i);
  });

  click('[data-overview]');
  settle();
  click('[data-action="add-project"]');
  settle();
  check('Add project opens a form asking only for the URL, with optional name and signed-in profile', () => {
    assert.equal(page(`document.querySelector('#add-project-form input[type="url"]')?.required`), true);
    assert.equal(page(`Boolean(document.querySelector('#add-project-form input[name="name"]'))`), true);
    assert.equal(page(`Boolean(document.querySelector('#add-project-form input[name="browserProfile"]'))`), true);
  });
  stubApi({ 'POST /api/onboard': [202, { job: 'job-1' }], 'GET /api/onboard/job-1': [200, { status: 'done', total: 5, scanned: 5, current: null, projectId: 'tidepool', error: '' }] });
  page(`(() => { const form = document.querySelector('#add-project-form'); form.querySelector('input[type="url"]').value = 'https://tidepool.example/'; form.querySelector('input[name="name"]').value = 'Tidepool'; form.querySelector('input[name="browserProfile"]').value = 'Default'; form.requestSubmit(); return true; })()`);
  browser('wait', '2500');
  check('submitting Add project starts onboarding, follows its progress, and opens the new project', () => {
    const calls = page('window.__calls');
    assert.deepEqual(calls[0], { key: 'POST /api/onboard', body: { url: 'https://tidepool.example/', name: 'Tidepool', browserProfile: 'Default' } });
    assert.ok(calls.some(item => item.key === 'GET /api/onboard/job-1'));
    assert.equal(page(`Boolean(document.querySelector('section[aria-label="Project overview"]'))`), true);
    assert.equal(page(`document.querySelector('#project-select')?.value`), 'tidepool');
  });

  browser('set', 'viewport', '390', '844');
  click('[data-page="book"]');
  settle();
  click('[data-view="capture"]');
  settle();
  check('See page with two screenshots and scan results fits a phone screen', () => {
    assert.equal(page('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
  });

  const emptyUrl = await startServer(empty);
  browser('set', 'viewport', '1440', '900');
  browser('open', emptyUrl);
  settle();
  check('with no projects yet, the app opens on Add project instead of an error', () => {
    assert.equal(page(`Boolean(document.querySelector('#add-project-form input[type="url"]'))`), true);
    assert.doesNotMatch(page('document.body.textContent'), /could not open/i);
  });
  page(`(() => { const form = document.querySelector('#add-project-form'); form.querySelector('input[type="url"]').value = 'ftp://nope'; form.requestSubmit(); return true; })()`);
  settle();
  check('an invalid URL is explained without starting onboarding', () => {
    assert.match(page('document.body.textContent'), /http/i);
  });

  const errors = browser('errors').trim();
  check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  servers.forEach(server => server.kill());
  rmSync(data, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
}
