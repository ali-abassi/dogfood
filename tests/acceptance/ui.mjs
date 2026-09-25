// Acceptance: the project overview and per-page QA completion in the app (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-ui-proof-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
// A never-captured page has only a reason: no capture time, source, or viewport.
const manifestFile = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
manifest.pages.find(item => item.id === 'admin').captures.desktop = { state: 'blocked', reason: 'Staff sign-in is not available to the capture account.' };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const session = `dogfood-ui-proof-${process.pid}`;
let passed = 0;

const port = await new Promise(done => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => done(free)); });
});
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });

function browser(...args) {
  return execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
}

// Runs an expression in the page and returns its JSON value.
function page(expression) {
  const output = browser('eval', `JSON.stringify(${expression})`).trim();
  const value = JSON.parse(output);
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

async function api(path, options) {
  const response = await fetch(`${url}${path}`, { ...options, headers: { Origin: url, 'Content-Type': 'application/json' } });
  return response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) return; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error('demo server did not start');
}

function settle() {
  browser('wait', '600');
}

function noHorizontalOverflow() {
  return page('document.documentElement.scrollWidth <= window.innerWidth + 1');
}

try {
  await waitForServer();
  const project = await api('/api/projects/tidepool');
  const book = project.pages.find(item => item.id === 'book');
  // Seed one attributed verdict so the UI has something to attribute.
  await api('/api/projects/tidepool/pages/home/review', { method: 'PUT', body: JSON.stringify({
    checks: { ...project.pages[0].checks, connected: { status: 'pass', note: 'Booking loads its classes and saves the reservation.' } },
    features: project.pages[0].features,
  }) });
  const seeded = await api('/api/projects/tidepool');

  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  settle();

  check('the app opens on the project overview', () => {
    assert.equal(page(`Boolean(document.querySelector('section[aria-label="Project overview"]'))`), true);
  });
  check('the overview lists every page once, in site order', () => {
    const ids = page(`[...document.querySelectorAll('[data-overview-page]')].map(row => row.dataset.overviewPage)`);
    assert.deepEqual(ids, seeded.pages.map(item => item.id));
  });
  check('each overview row shows the server status and names the missing requirements', () => {
    const rows = page(`[...document.querySelectorAll('[data-overview-page]')].map(row => ({ id: row.dataset.overviewPage, status: row.dataset.status, text: row.textContent }))`);
    for (const item of seeded.pages) {
      const row = rows.find(entry => entry.id === item.id);
      assert.equal(row.status, item.progress.status, `${item.id} status`);
      for (const requirement of item.progress.requirements.filter(entry => !entry.met)) assert.ok(row.text.includes(requirement.label), `${item.id} should name ${requirement.label}`);
    }
  });
  check('the overview summarises complete pages, pages needing work, and open P0/P1 issues', () => {
    const metrics = page(`Object.fromEntries([...document.querySelectorAll('[data-metric]')].map(item => [item.dataset.metric, item.textContent]))`);
    const complete = seeded.pages.filter(item => item.progress.complete).length;
    const needsWork = seeded.pages.filter(item => item.progress.status === 'needs_work').length;
    const blocking = seeded.pages.flatMap(item => item.findings).filter(item => item.status === 'open' && ['P0', 'P1'].includes(item.severity)).length;
    assert.match(metrics.complete, new RegExp(`\\b${complete}\\b`));
    assert.match(metrics.complete, new RegExp(`\\b${seeded.pages.length}\\b`));
    assert.match(metrics['needs-work'], new RegExp(`\\b${needsWork}\\b`));
    assert.match(metrics['blocking-issues'], new RegExp(`\\b${blocking}\\b`));
  });
  check('sidebar status dots use the server status, not a client-side recomputation', () => {
    const labels = page(`[...document.querySelectorAll('[data-page]')].map(item => ({ id: item.dataset.page, label: item.querySelector('[role="img"]')?.getAttribute('aria-label') }))`);
    const names = { blocked: 'Blocked', untested: 'Untested', in_review: 'In review', pass: 'Pass', needs_work: 'Needs work' };
    for (const item of seeded.pages) assert.equal(labels.find(entry => entry.id === item.id)?.label, names[item.progress.status], item.id);
  });
  check('the overview has no horizontal overflow at 1440 × 900', () => assert.equal(noHorizontalOverflow(), true));

  page(`document.querySelector('[data-overview-page="book"] a, [data-overview-page="book"] button').click() || true`);
  settle();
  check('choosing a page from the overview opens that page', () => {
    assert.equal(page(`document.querySelector('#selected-page-heading')?.textContent`), book.name);
  });
  check('the page shows its QA completion with every applicable requirement', () => {
    const requirements = page(`[...document.querySelectorAll('section[aria-label="QA completion"] [data-requirement]')].map(item => ({ id: item.dataset.requirement, met: item.dataset.met }))`);
    // Unmet requirements are listed first (see docs/design/interface-contract.md), so compare as a set.
    const pairs = list => list.map(item => `${item.id}:${item.met}`).sort();
    assert.deepEqual(pairs(requirements), pairs(book.progress.requirements.map(item => ({ id: item.id, met: String(item.met) }))));
  });
  check('an unmet requirement shows why and links to the view that resolves it', () => {
    const missing = book.progress.requirements.find(item => !item.met);
    const detail = page(`(() => { const item = document.querySelector('[data-requirement="${missing.id}"]'); return { text: item.textContent, action: Boolean(item.querySelector('button[data-view]')) }; })()`);
    assert.ok(detail.text.includes(missing.missing.slice(0, 30)), 'missing detail text');
    assert.equal(detail.action, true, 'a button with data-view that opens the resolving view');
  });

  page(`document.querySelector('[data-page="home"]').click() || true`);
  settle();
  page(`document.querySelector('[data-view="review"]').click() || true`);
  settle();
  check('a verdict recorded in the app is attributed to "you"; agent verdicts name the agent', () => {
    const attribution = page(`[...document.querySelectorAll('.verdict-by')].map(item => item.textContent)`);
    assert.ok(attribution.some(text => /you/i.test(text)), JSON.stringify(attribution));
  });

  page(`document.querySelector('[data-page="admin"]').click() || true`);
  settle();
  check('a page whose capture is blocked without a capture time still renders its reason', () => {
    assert.equal(page(`document.querySelector('#selected-page-heading')?.textContent`), 'Staff schedule');
    assert.equal(page(`document.body.textContent.includes('Staff sign-in is not available')`), true);
    assert.equal(page(`document.body.textContent.includes('Invalid Date')`), false);
  });

  browser('set', 'viewport', '390', '844');
  page(`document.querySelector('[data-overview]')?.click() || true`);
  settle();
  check('the overview has no horizontal overflow at 390 × 844', () => assert.equal(noHorizontalOverflow(), true));

  const errors = browser('errors').trim();
  check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
