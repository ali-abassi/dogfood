// Acceptance: the project overview and each page's six answers in the app (needs agent-browser).
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
  await api('/api/projects/tidepool/pages/home/verdicts', { method: 'PATCH', body: JSON.stringify({
    checks: { purpose: { status: 'pass', note: 'The heading says Tidepool teaches swimming to children and adults.' } },
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
  const words = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked' };
  check('each overview row shows the server\'s status and six answers, not a client-side recomputation', () => {
    const rows = page(`[...document.querySelectorAll('[data-overview-page]')].map(row => ({ id: row.dataset.overviewPage, status: row.dataset.status, marks: [...row.querySelectorAll('[data-answer-mark]')].map(mark => mark.getAttribute('aria-label')) }))`);
    for (const item of seeded.pages) {
      const row = rows.find(entry => entry.id === item.id);
      assert.equal(row.status, item.progress.status, `${item.id} status`);
      assert.deepEqual(row.marks, item.progress.answers.map(answer => `${answer.name}: ${words[answer.status]}`), `${item.id} answers`);
    }
  });
  check('the overview sentence counts good pages, pages that need work, and the rest from the server', () => {
    const count = status => seeded.pages.filter(item => item.progress.status === status).length;
    const sentence = page(`document.querySelector('[data-answer-sentence]').textContent`);
    assert.match(sentence, new RegExp(`\\b${count('pass')} pages? (is|are) good, ${count('needs_work')} needs? work, and ${seeded.pages.length - count('pass') - count('needs_work')} `));
  });
  check('sidebar status marks use the server status in plain words', () => {
    const labels = page(`[...document.querySelectorAll('.page-sidebar [data-page]')].map(item => ({ id: item.dataset.page, label: item.querySelector('[role="img"]')?.getAttribute('aria-label') }))`);
    const names = { blocked: 'Can’t open', untested: 'Not checked', in_review: 'Partly checked', pass: 'Good', needs_work: 'Needs work' };
    for (const item of seeded.pages) assert.equal(labels.find(entry => entry.id === item.id)?.label, names[item.progress.status], item.id);
  });
  check('the overview has no horizontal overflow at 1440 × 900', () => assert.equal(noHorizontalOverflow(), true));

  page(`document.querySelector('[data-overview-page="book"] a, [data-overview-page="book"] button').click() || true`);
  settle();
  check('choosing a page from the overview opens that page', () => {
    assert.equal(page(`document.querySelector('#selected-page-heading')?.textContent`), book.name);
  });
  check('the page shows the server\'s six answers with their summaries', () => {
    const rows = page(`[...document.querySelectorAll('[data-answer-row]')].map(row => ({ id: row.dataset.answerRow, mark: row.querySelector('[data-answer-mark]').getAttribute('aria-label'), summary: row.querySelector('.answer-summary').textContent }))`);
    assert.deepEqual(rows, book.progress.answers.map(answer => ({ id: answer.id, mark: `${answer.name}: ${words[answer.status]}`, summary: answer.summary })));
  });
  check('an answer that is not answered says what would answer it, and opens its detail', () => {
    const open = book.progress.answers.find(answer => answer.status === 'untested');
    const row = page(`(() => { const row = document.querySelector('[data-answer-row="${open.id}"]'); return { summary: row.querySelector('.answer-summary').textContent, view: row.dataset.view }; })()`);
    assert.deepEqual(row, { summary: open.summary, view: open.id });
  });

  page(`document.querySelector('[data-page="home"]').click() || true`);
  settle();
  page(`document.querySelector('[data-answer-row="purpose"]').click() || true`);
  settle();
  check('an answer given in the app says it came from you; agent answers name the agent', () => {
    assert.match(page(`document.querySelector('[data-answer-source]').textContent`), /^From you/);
    const agentNamed = seeded.pages.flatMap(item => item.progress.answers).flatMap(answer => answer.parts).find(part => part.source === 'verdict' && String(part.by).startsWith('agent:'));
    if (agentNamed) assert.doesNotMatch(agentNamed.by.slice(6), /^you$/);
  });
  page(`document.querySelector('[data-action="back-to-report"]').click() || true`);
  settle();

  page(`document.querySelector('[data-page="admin"]').click() || true`);
  settle();
  check('a page whose screenshot is blocked without a time still shows its reason', () => {
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
