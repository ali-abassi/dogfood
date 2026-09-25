// Acceptance: screenshots on both devices, what the page check measured (in plain words under the
// answer it affects), accessibility, expected behavior, adding an app, and the first-run welcome
// (needs agent-browser).
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

  const overviewMark = (pageId, answer) => page(`document.querySelector('[data-overview-page="${pageId}"] [data-answer-mark][aria-label^="${answer}:"]')?.getAttribute('aria-label')`);
  check('the overview shows what the page check found: errors under Works as expected, sideways scrolling under Easy to use', () => {
    assert.equal(overviewMark('book', 'Works as expected'), 'Works as expected: Needs work');
    assert.equal(overviewMark('book', 'Easy to use'), 'Easy to use: Needs work');
  });

  click('[data-page="book"]');
  settle();
  check('the page shows the computer and the phone screenshot side by side', () => {
    assert.equal(page(`Boolean(document.querySelector('.report-screen-desktop img'))`), true);
    assert.equal(page(`Boolean(document.querySelector('.report-screen-mobile img'))`), true);
    const [desktop, mobile] = page(`['desktop', 'mobile'].map(device => document.querySelector('.report-screen-' + device).getBoundingClientRect().width)`);
    assert.ok(mobile < desktop, 'the phone screenshot is shown narrower than the computer one');
  });
  check('Check again is a quiet link and the report keeps one blue button', () => {
    assert.equal(page(`Boolean(document.querySelector('.page-heading button[data-action="scan"]'))`), true);
    assert.ok(page(`document.querySelectorAll('.page-workspace .save-button').length`) <= 1, 'one filled blue button per view');
  });
  const answerText = (id, selector = `[data-answer-detail="${id}"]`) => {
    click(`[data-answer-row="${id}"]`);
    settle();
    const content = text(selector);
    click('[data-action="back-to-report"]');
    settle();
    return content;
  };
  check('the page check\'s measurements appear in plain words under the answer they affect', () => {
    const works = answerText('works');
    for (const expected of ['TypeError: slots is undefined', 'https://tidepool.example/api/hold', '503', '/api/slots']) assert.ok(works.includes(expected), `Works as expected should show ${expected}`);
    const speed = answerText('speed');
    assert.match(speed, /Load time on a computer\s*1\.8 s/);
    assert.ok(speed.includes('Book a lesson · Tidepool'), 'the page title');
    const ease = answerText('ease');
    assert.match(ease, /Scrolls sideways on a phone\s*Yes/);
    assert.match(ease, /Buttons without a name\s*1/);
    const safety = answerText('safety');
    assert.match(safety, /Cannot be hidden inside another site\s*Yes/, 'x-frame-options: DENY');
    assert.match(safety, /Limits which scripts can run\s*No/, 'no content security policy');
  });
  check('things people can do show what should happen', () => {
    assert.ok(answerText('works').includes('Lists all four classes with their ages.'));
  });
  check('Easy to use includes the accessibility questions', () => {
    assert.match(answerText('ease'), /keyboard/i);
  });

  const rescanned = structuredClone(project);
  stubApi({ 'POST /api/projects/tidepool/pages/book/scan': [200, rescanned] });
  click('.page-heading button[data-action="scan"]');
  settle();
  check('Check again posts to the page scan API', () => {
    const calls = page('window.__calls');
    assert.deepEqual(calls.map(item => item.key), ['POST /api/projects/tidepool/pages/book/scan']);
  });

  click('[data-page="home"]');
  settle();
  check('a page without a phone screenshot says why', () => {
    assert.match(text('.report-screen-mobile'), /Not captured yet/);
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
  stubApi({ 'POST /api/onboard': [202, { job: 'job-1' }], 'GET /api/jobs/job-1': [200, { status: 'done', total: 5, scanned: 5, current: null, projectId: 'tidepool', error: '' }] });
  page(`(() => { const form = document.querySelector('#add-project-form'); form.querySelector('input[type="url"]').value = 'https://tidepool.example/'; form.querySelector('input[name="name"]').value = 'Tidepool'; form.querySelector('input[name="browserProfile"]').value = 'Default'; form.requestSubmit(); return true; })()`);
  browser('wait', '2500');
  check('submitting Add project starts onboarding, follows its progress, and opens the new project', () => {
    const calls = page('window.__calls');
    assert.deepEqual(calls[0], { key: 'POST /api/onboard', body: { url: 'https://tidepool.example/', name: 'Tidepool', browserProfile: 'Default' } });
    assert.ok(calls.some(item => item.key === 'GET /api/jobs/job-1'));
    assert.equal(page(`Boolean(document.querySelector('section[aria-label="Project overview"]'))`), true);
    assert.equal(page(`document.querySelector('#project-select')?.value`), 'tidepool');
  });

  browser('set', 'viewport', '390', '844');
  click('[data-page="book"]');
  settle();
  check('the report and its answers fit a phone screen', () => {
    assert.equal(page('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    for (const id of ['works', 'speed', 'safety']) {
      click(`[data-answer-row="${id}"]`);
      settle();
      assert.equal(page('document.documentElement.scrollWidth <= window.innerWidth + 1'), true, `${id} scrolls sideways`);
      click('[data-action="back-to-report"]');
      settle();
    }
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
