// Acceptance: the project overview and each page's six answers in the app (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { shortReason } from '../../public/js/format.mjs';
import { displayAnswerStatus } from '../../public/js/state.mjs';

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
  // Seed one attributed verdict so the UI has something to attribute, and one blocked answer.
  await api('/api/projects/tidepool/pages/home/verdicts', { method: 'PATCH', body: JSON.stringify({
    checks: {
      purpose: { status: 'pass', note: 'The heading says Tidepool teaches swimming to children and adults.' },
      design: { status: 'blocked', note: 'Waiting on the brand fonts from the designer.' },
    },
  }) });
  const seeded = await api('/api/projects/tidepool');

  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  settle();

  check('the app opens on the project overview', () => {
    assert.equal(page(`Boolean(document.querySelector('section[aria-label="Project overview"]'))`), true);
  });
  check('a known page report has a direct entry URL', () => {
    browser('open', `${url}?project=tidepool&page=book&view=report`);
    settle();
    assert.equal(page(`document.querySelector('#selected-page-heading')?.textContent`), book.name);
    browser('open', `${url}?project=tidepool&page=unknown&view=report`);
    settle();
    assert.equal(page(`document.querySelector('section[aria-label="Project overview"]') !== null`), true);
    browser('open', `${url}?project=unknown&view=plan`);
    settle();
    assert.equal(page(`document.querySelector('section[aria-label="Project overview"]') !== null`), true);
    browser('open', url);
    settle();
  });
  check('the overview lists every page once, in site order', () => {
    const ids = page(`[...document.querySelectorAll('[data-overview-page]')].map(row => row.dataset.overviewPage)`);
    assert.deepEqual(ids, seeded.pages.map(item => item.id));
  });
  const words = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked', recheck: 'Recheck', blocked: 'Blocked' };
  const shown = (item, answer) => `${answer.name}: ${words[displayAnswerStatus(item, answer)]}`;
  const blockedPages = seeded.pages.filter(item => !['pass', 'needs_work'].includes(item.progress.status) && item.progress.answers.some(answer => answer.status === 'blocked')).length;
  check('each overview row shows the server\'s status and six answers, with Recheck for Good answers on changed pages', () => {
    const rows = page(`[...document.querySelectorAll('[data-overview-page]')].map(row => ({ id: row.dataset.overviewPage, status: row.dataset.status, marks: [...row.querySelectorAll('[data-answer-mark]')].map(mark => mark.getAttribute('aria-label')) }))`);
    for (const item of seeded.pages) {
      const row = rows.find(entry => entry.id === item.id);
      assert.equal(row.status, item.progress.status, `${item.id} status`);
      assert.deepEqual(row.marks, item.progress.answers.map(answer => shown(item, answer)), `${item.id} answers`);
    }
  });
  check('the overview sentence counts good pages, pages that need work, blocked pages, and the rest from the server', () => {
    const count = status => seeded.pages.filter(item => item.progress.status === status).length;
    const rest = seeded.pages.length - count('pass') - count('needs_work') - blockedPages;
    const sentence = page(`document.querySelector('[data-answer-sentence]').textContent`);
    assert.match(sentence, new RegExp(`\\b${count('pass')} pages? (is|are) good, ${count('needs_work')} needs? work, ${blockedPages} pages? (is|are) blocked, and ${rest} `));
  });
  check('the overview separates accepted from checked and incomplete pages', () => {
    const accepted = seeded.pages.filter(item => item.progress.accepted === true).length;
    const checked = seeded.pages.filter(item => item.progress.accepted !== true && item.progress.complete === true).length;
    const remaining = seeded.pages.length - accepted - checked;
    assert.equal(page(`document.querySelector('[data-gate-counts]')?.textContent`), `${accepted} accepted · ${checked} checked, not accepted · ${remaining} not fully checked`);
  });
  check('Fix first lists open P0-P2 bugs across pages, worst and oldest first', () => {
    const rows = page(`[...document.querySelectorAll('[data-fix-first] .finding-row')].map(row => ({ severity: row.querySelector('.bug-severity').textContent, title: row.querySelector('.finding-row-title').textContent, meta: row.querySelector('.finding-row-meta').textContent }))`);
    assert.deepEqual(rows, [{ severity: 'Annoying', title: 'Reserve button sits beside the email field', meta: 'Book a lesson · TP-001' }]);
  });
  check('choosing a Fix first row opens that page’s bugs', () => {
    page(`document.querySelector('[data-fix-first] .finding-row').click() || true`);
    settle();
    assert.equal(page(`document.querySelector('#answer-heading')?.textContent`), 'Works as expected');
    page(`document.querySelector('[data-project-view="overview"]').click() || true`);
    settle();
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
  check('the report shows the backend acceptance gate and only unmet requirements', () => {
    const expected = book.progress.accepted === true ? 'Accepted' : book.progress.complete === true ? 'Checked · Not accepted' : 'Not fully checked';
    assert.equal(page(`document.querySelector('[data-gate-status]')?.textContent`), expected);
    const shown = page(`[...document.querySelectorAll('.page-gate-requirements li strong')].map(item => item.textContent)`);
    assert.deepEqual(shown, book.progress.requirements.filter(item => !item.met).map(item => item.label));
  });
  check('the page shows the server\'s six answers with one-line reasons', () => {
    const rows = page(`[...document.querySelectorAll('[data-answer-row]')].map(row => ({ id: row.dataset.answerRow, mark: row.querySelector('[data-answer-mark]').getAttribute('aria-label'), summary: row.querySelector('.answer-summary').textContent }))`);
    assert.deepEqual(rows, book.progress.answers.map(answer => ({ id: answer.id, mark: shown(book, answer), summary: shortReason(answer.summary) })));
  });
  check('the page lists its open bugs above its answers', () => {
    const rows = page(`[...document.querySelectorAll('[data-open-findings] .finding-row')].map(row => ({ severity: row.querySelector('.bug-severity').textContent, title: row.querySelector('.finding-row-title').textContent, meta: row.querySelector('.finding-row-meta').textContent }))`);
    assert.deepEqual(rows, [
      { severity: 'Annoying', title: 'Reserve button sits beside the email field', meta: 'TP-001' },
      { severity: 'Cosmetic', title: 'Time slots have no time zone', meta: 'TP-002' },
    ]);
    assert.ok(page(`document.querySelector('[data-open-findings]').getBoundingClientRect().top < document.querySelector('[data-answers]').getBoundingClientRect().top`));
  });
  check('an answer that is not answered says what would answer it, and opens its detail', () => {
    const open = book.progress.answers.find(answer => answer.status === 'untested');
    const row = page(`(() => { const row = document.querySelector('[data-answer-row="${open.id}"]'); return { summary: row.querySelector('.answer-summary').textContent, view: row.dataset.view }; })()`);
    assert.deepEqual(row, { summary: shortReason(open.summary), view: open.id });
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
  check('a blocked answer reads Blocked with its reason, and the form offers Blocked', () => {
    assert.equal(page(`document.querySelector('[data-answer-row="design"] [data-answer-mark]').getAttribute('aria-label')`), 'Looks right: Blocked');
    page(`document.querySelector('[data-answer-row="design"]').click() || true`);
    settle();
    assert.equal(page(`document.querySelector('[data-answer-detail="design"] .answer-verdict strong').textContent`), 'Blocked');
    assert.equal(page(`document.querySelector('[data-answer-detail="design"] .answer-text').textContent`), 'Waiting on the brand fonts from the designer.');
    page(`document.querySelector('[data-action="edit-answer"]').click() || true`);
    settle();
    assert.deepEqual(page(`[...document.querySelectorAll('#answer-form input[name="status"]')].map(input => input.value)`), ['pass', 'needs_work', 'blocked']);
  });

  page(`document.querySelector('[data-page="admin"]').click() || true`);
  settle();
  check('a page whose screenshot is blocked without a time still shows its reason', () => {
    assert.equal(page(`document.querySelector('#selected-page-heading')?.textContent`), 'Staff schedule');
    assert.equal(page(`document.body.textContent.includes('Staff sign-in is not available')`), true);
    assert.equal(page(`document.body.textContent.includes('Invalid Date')`), false);
  });

  browser('set', 'viewport', '390', '844');
  page(`document.querySelector('[data-project-view="overview"]')?.click() || true`);
  settle();
  check('the overview has no horizontal overflow at 390 × 844', () => assert.equal(noHorizontalOverflow(), true));
  page(`document.querySelector('[data-overview-page="book"] button').click() || true`);
  settle();
  check('the report gate has no horizontal overflow at 390 × 844', () => assert.equal(noHorizontalOverflow(), true));

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
