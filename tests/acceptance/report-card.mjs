// Acceptance: the six answers, as a non-technical owner meets them (needs agent-browser). Each check
// carries its locked ID from docs/design/interface-contract.md; the suggestions checks (SG-1–3) live
// in suggestions.mjs. Set DOGFOOD_RECORD_DIR to keep a video of the run.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, recordRun, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-report-card-'));
const empty = mkdtempSync(join(tmpdir(), 'dogfood-report-card-empty-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
process.env.DOGFOOD_DATA = data;
const store = await import('../../lib/store.mjs');

// The long-content project: the longest credible names, routes, notes, features, bugs, and connections.
const longNote = `${'The region filter resets when the product line changes, so comparing two lines takes three extra clicks and loses the fiscal calendar. '.repeat(8)}Seen at 1440 × 900 and 390 × 844.`;
store.createProject({ id: 'northwind', name: 'Northwind Analytics for Operations and Revenue Teams', url: 'https://app.northwind-analytics.example' });
store.registerPage('northwind', {
  id: 'revenue', name: 'Revenue by region, product line, and sales channel over time', group: 'Workspace and reporting',
  route: '/workspace/reports/revenue-by-region-product-line-and-channel?period=trailing-twelve-months&currency=usd',
  features: Array.from({ length: 9 }, (_, n) => ({ id: `f${n}`, name: `Compare revenue for a region against the same period last year, view ${n + 1}`, expected: 'The comparison appears within a second and keeps every other filter.' })),
});
store.registerPage('northwind', { id: 'pipeline', name: 'Pipeline forecast', group: 'Workspace and reporting', route: '/workspace/pipeline' });
store.recordVerdicts('northwind', 'revenue', { checks: { design: { status: 'needs_work', note: longNote } }, features: [{ id: 'f0', status: 'needs_work', note: longNote }] }, 'agent:long-content');
for (const severity of ['P1', 'P2', 'P3']) store.createFinding('northwind', 'revenue', { severity, title: `Region filter resets when the product line changes (${severity})`, detail: longNote, attachCapture: false }, 'agent:long-content');
store.setConnections('northwind', 'revenue', Array.from({ length: 12 }, (_, n) => ({ id: `c${n}`, name: `Revenue query ${n + 1}`, method: 'GET', endpoint: `/api/v2/reports/revenue/regions/${n}?include=channels,currencies`, sends: 'Report filters', receives: 'Revenue rows', source: 'Observed in the page traffic', provenance: 'observed' })));

const answerOrder = ['design', 'purpose', 'ease', 'safety', 'speed', 'works'];
const answerNames = ['Looks right', 'Clear purpose', 'Easy to use', 'Safe', 'Fast & findable', 'Works as expected'];
const markLabel = /^(Looks right|Clear purpose|Easy to use|Safe|Fast & findable|Works as expected): (Good|Needs work|Partly checked|Not checked)$/;
const internalTerms = /\b(requirements?|verdicts?|audits?|checklists?|connections?|captures?|P0|P1)\b/i;

const { check, passed } = checker();
const { browser, evaluate } = browserSession('dogfood-report-card');
const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);
const count = selector => evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
const noSidewaysScroll = () => evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1');
const settle = (ms = 600) => browser('wait', String(ms));
const manifest = () => JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8'));

function openProject(id) {
  evaluate(`(() => { const select = document.querySelector('#project-select'); select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  settle(900);
}

function openPage(id) {
  browser('click', `.page-sidebar [data-page="${id}"]`);
  settle();
}

function openAnswer(id) {
  browser('click', `[data-answer-row="${id}"]`);
  settle();
}

function marks(scope) {
  return evaluate(`[...document.querySelectorAll(${JSON.stringify(`${scope} [data-answer-mark]`)})].map(mark => mark.getAttribute('aria-label'))`);
}

const main = await startServer(data);
const welcome = await startServer(empty);
let stopRecording = () => {};
try {
  browser('open', main.url);
  browser('set', 'viewport', '1440', '900');
  settle(1000);
  stopRecording = recordRun(browser, 'report-card');
  openProject('tidepool');

  await check('OV-1 the overview opens with one sentence saying how many pages are good, need work, and are not checked', () => {
    assert.match(text('[data-answer-sentence]'), /^Is Tidepool \(demo\) working\? \d+ pages? (is|are) good, \d+ needs? work, and \d+ (is|are) not fully checked yet\.$/);
  });
  await check('OV-2 every page row shows six named marks in the report order under six column headings', () => {
    assert.equal(count('[data-answer-heading]'), 6);
    const rows = evaluate(`[...document.querySelectorAll('[data-overview-page]')].map(row => [...row.querySelectorAll('[data-answer-mark]')].map(mark => mark.getAttribute('aria-label')))`);
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.deepEqual(row.map(label => label.split(':')[0]), answerNames);
      assert.ok(row.every(label => markLabel.test(label)), row.join(' | '));
    }
  });
  await check('OV-5 no internal term appears on the overview', () => {
    assert.doesNotMatch(text('.overview-content'), internalTerms);
  });

  openPage('book');
  await check('PR-1 both screenshots and all six answers are visible on first paint', () => {
    const layout = evaluate(`({ height: innerHeight, images: [...document.querySelectorAll('[data-report-screens] img')].map(image => image.getBoundingClientRect().top), rows: [...document.querySelectorAll('[data-answer-row]')].map(row => row.getBoundingClientRect().bottom) })`);
    assert.equal(layout.images.length, 2);
    assert.ok(layout.images.every(top => top < layout.height));
    assert.equal(layout.rows.length, 6);
    assert.ok(layout.rows.every(bottom => bottom <= layout.height), `rows end at ${layout.rows.join(', ')} of ${layout.height}`);
  });
  await check('PR-2 the six answers come in order, each one line of plain words', () => {
    const rows = evaluate(`[...document.querySelectorAll('[data-answer-row]')].map(row => { const summary = row.querySelector('.answer-summary'); return { id: row.dataset.answerRow, name: row.querySelector('.answer-name').innerText, summary: summary.innerText, lines: Math.round(summary.getBoundingClientRect().height / parseFloat(getComputedStyle(summary).lineHeight)) }; })`);
    assert.deepEqual(rows.map(row => row.id), answerOrder);
    assert.deepEqual(rows.map(row => row.name), answerNames);
    for (const row of rows) {
      assert.equal(row.lines, 1, `${row.name} wraps: ${row.summary}`);
      assert.doesNotMatch(`${row.name} ${row.summary}`, internalTerms);
    }
  });
  await check('PR-6 the page has no tabs and at most one blue filled button', () => {
    assert.equal(count('[role="tablist"], .view-navigation'), 0);
    assert.ok(evaluate(`[...document.querySelectorAll('.save-button')].filter(button => button.offsetParent).length`) <= 1);
  });

  openAnswer('design');
  await check('AD-1 an answer shows its question, the answer, and where it came from', () => {
    assert.equal(text('[data-answer-detail="design"] h1'), 'Looks right');
    assert.match(text('[data-answer-detail="design"]'), /Does it look finished and match the rest of the app\?/);
    assert.match(text('[data-answer-source]'), /(From you|From [\w -]+|From the AI|Measured)/);
  });
  browser('click', '[data-action="back-to-report"]');
  settle();

  browser('focus', '[data-answer-row="safety"]');
  browser('press', 'Enter');
  settle();
  await check('PR-3 a row opens its answer, and Back returns to the report with focus on that row', () => {
    assert.equal(count('[data-answer-detail="safety"]'), 1);
    browser('focus', '[data-action="back-to-report"]');
    browser('press', 'Enter');
    settle();
    assert.equal(evaluate('document.activeElement?.dataset.answerRow ?? null'), 'safety');
  });

  openAnswer('safety');
  await check('AD-4 Safe lists its questions with their answers and lets the person answer them', () => {
    const questions = evaluate(`[...document.querySelectorAll('[data-question]')].map(row => row.innerText)`);
    assert.equal(questions.length, 5, 'three security and two copying questions');
    assert.ok(questions.every(row => /Good|Needs work|Not checked/.test(row)));
    browser('click', '[data-action="answer-questions"]');
    settle(300);
    browser('select', '#questions-form [data-question-row] select', 'pass');
    browser('fill', '#questions-form [data-question-row] textarea', 'Every booking field is checked again by the server before saving.');
    browser('click', '#questions-form button[type="submit"]');
    settle(900);
    assert.match(evaluate(`document.querySelector('[data-question]').innerText`), /Good/);
    assert.equal(manifest().pages.find(page => page.id === 'book').audit.security[0].by, 'person');
  });
  browser('click', '[data-action="back-to-report"]');
  settle();

  openAnswer('purpose');
  await check('AD-2 answering Needs work with a note updates the report; a short note is refused', () => {
    browser('click', '[data-action="edit-answer"]');
    settle(300);
    browser('click', '#answer-form input[value="needs_work"]');
    browser('fill', '#answer-form textarea', 'Too short');
    browser('click', '#answer-form button[type="submit"]');
    settle(600);
    assert.match(text('#answer-error'), /12/);
    browser('fill', '#answer-form textarea', 'Nothing on the page says which ages Tidepool teaches.');
    browser('click', '#answer-form button[type="submit"]');
    settle(900);
    browser('click', '[data-action="back-to-report"]');
    settle();
    assert.equal(evaluate(`document.querySelector('[data-answer-row="purpose"] [data-answer-mark]').getAttribute('aria-label')`), 'Clear purpose: Needs work');
    const saved = manifest().pages.find(page => page.id === 'book').checks.purpose;
    assert.deepEqual([saved.status, saved.by], ['needs_work', 'person']);
  });

  openAnswer('works');
  await check('WK-1 each thing a person can do shows its name, what should happen, and its mark', () => {
    const things = evaluate(`[...document.querySelectorAll('[data-thing]')].map(row => ({ name: row.querySelector('.thing-name')?.innerText, expected: row.querySelector('.thing-expected')?.innerText, mark: row.querySelector('[data-answer-mark]')?.getAttribute('aria-label') }))`);
    assert.ok(things.length >= 1);
    for (const thing of things) {
      assert.ok(thing.name && thing.expected, JSON.stringify(thing));
      assert.match(thing.mark, /^.+: (Good|Needs work|Not checked)$/);
    }
  });
  await check('WK-2 open bugs say how bad they are in plain words, never P0–P3', () => {
    const severities = evaluate(`[...document.querySelectorAll('[data-bug] .bug-severity')].map(item => item.innerText)`);
    assert.ok(severities.length >= 1);
    assert.ok(severities.every(item => ['Breaks the app', 'Blocks this page', 'Annoying', 'Cosmetic'].includes(item)), severities.join(', '));
    assert.doesNotMatch(text('[data-answer-detail="works"]'), /\bP[0-3]\b/);
  });
  browser('set', 'viewport', '390', '844');
  settle();
  await check('WK-5 at phone width the lists and the bug form fit with no sideways scrolling', () => {
    browser('click', '[data-action="report-bug"]');
    settle(300);
    assert.equal(count('#finding-form'), 1);
    assert.ok(noSidewaysScroll());
    browser('click', '#finding-form [data-finding-action="cancel"]');
    settle(300);
  });
  browser('click', '[data-action="back-to-report"]');
  settle();
  await check('PR-4 at phone width the screenshots come first, then the six answers, with no sideways scrolling', () => {
    const order = evaluate(`({ screens: document.querySelector('[data-report-screens]').getBoundingClientRect().top, answers: document.querySelector('[data-answer-row]').getBoundingClientRect().top })`);
    assert.ok(order.screens < order.answers);
    assert.ok(noSidewaysScroll());
  });
  openAnswer('purpose');
  await check('AD-5 at phone width an answer and its form fit with no sideways scrolling', () => {
    browser('click', '[data-action="edit-answer"]');
    settle(300);
    assert.equal(count('#answer-form'), 1);
    assert.ok(noSidewaysScroll());
    browser('click', '#answer-form [data-action="cancel-answer"]');
    settle(300);
  });
  browser('click', '[data-action="back-to-report"]');
  settle();
  browser('click', '[data-action="open-pages"]');
  settle(300);
  browser('click', '[data-overview]');
  settle();
  await check('OV-3 at phone width each row shows its name and six marks with no sideways scrolling, and the columns are explained', () => {
    assert.ok(noSidewaysScroll());
    assert.equal(evaluate(`[...document.querySelectorAll('[data-overview-page]')].every(row => row.querySelectorAll('[data-answer-mark]').length === 6 && row.querySelector('[data-answer-mark]').getBoundingClientRect().width > 0)`), true);
    assert.equal(evaluate(`[...document.querySelectorAll('[data-answer-heading], [data-answer-legend]')].some(item => item.getBoundingClientRect().width > 0)`), true);
  });
  await check('NV-2 on a phone Pages opens a sheet, Done closes it, and focus returns to Pages', () => {
    browser('focus', '[data-action="open-pages"]');
    browser('press', 'Enter');
    settle(400);
    assert.equal(count('.page-sidebar.open'), 1);
    browser('focus', '[data-action="close-pages"]');
    browser('press', 'Enter');
    settle(400);
    assert.equal(count('.page-sidebar.open'), 0);
    assert.equal(evaluate('document.activeElement?.dataset.action ?? null'), 'open-pages');
  });
  browser('set', 'viewport', '1440', '900');
  settle();

  openPage('classes');
  browser('click', '[data-action="view-screens"]');
  settle();
  await check('SC-1 View full page shows the full screenshot, and the switch changes device without moving', () => {
    assert.match(evaluate(`document.querySelector('[data-screens-image]').getAttribute('src')`), /\/classes\.png$/);
    const before = evaluate(`document.querySelector('[data-screens-device="mobile"]').getBoundingClientRect().top`);
    browser('click', '[data-screens-device="mobile"]');
    settle(400);
    assert.match(evaluate(`document.querySelector('[data-screens-image]').getAttribute('src')`), /\/classes-mobile\.png$/);
    assert.equal(evaluate(`document.querySelector('[data-screens-device="mobile"]').getBoundingClientRect().top`), before);
  });
  await check('SC-2 a changed page shows the previous and current screenshots and the difference in plain words', () => {
    assert.deepEqual(evaluate(`[...new Set([...document.querySelectorAll('[data-change-image]')].map(image => image.dataset.changeImage))]`), ['previous', 'current', 'diff']);
    assert.match(text('[data-screens]'), /of the page looks different/);
    assert.doesNotMatch(text('[data-screens]'), /\b(sha|pixels?|diff)\b/i);
  });
  browser('set', 'viewport', '390', '844');
  settle();
  await check('SC-3 at phone width the screenshot fits the width with no sideways scrolling', () => {
    assert.ok(noSidewaysScroll());
    assert.ok(evaluate(`document.querySelector('[data-screens-image]').getBoundingClientRect().width <= innerWidth`));
  });
  browser('set', 'viewport', '1440', '900');
  settle();

  openPage('account');
  openAnswer('works');
  await check('WK-3 reporting a bug adds it and turns Works as expected to Needs work', () => {
    browser('click', '[data-action="report-bug"]');
    settle(300);
    browser('fill', '#finding-title', 'Sign in button does nothing');
    browser('select', '#finding-severity', 'P1');
    browser('fill', '#finding-detail', 'Open Sign in, enter any email and password, press Sign in: nothing happens.');
    browser('click', '#finding-form button[type="submit"]');
    settle(900);
    assert.match(text('[data-answer-detail="works"]'), /Sign in button does nothing/);
    browser('click', '[data-action="back-to-report"]');
    settle();
    assert.equal(evaluate(`document.querySelector('[data-answer-row="works"] [data-answer-mark]').getAttribute('aria-label')`), 'Works as expected: Needs work');
  });

  openPage('home');
  openAnswer('speed');
  await check('AD-3 Fast & findable gives each device\'s load time in seconds and says whether search has a title and description', () => {
    const detail = text('[data-answer-detail="speed"]');
    assert.match(detail, /Load time on a computer\s+(under 0\.1 s|\d+\.\d s)/);
    assert.match(detail, /Load time on a phone\s+(under 0\.1 s|\d+\.\d s)/);
    assert.match(detail, /Page title\s+(Missing|.+)/);
    assert.match(detail, /Search description\s+(Missing|.+)/);
    assert.doesNotMatch(detail, /h1Count|content-security-policy/);
  });
  browser('click', '[data-action="back-to-report"]');
  settle();

  browser('click', '[data-overview]');
  settle();
  browser('focus', '[data-overview-page="classes"] button');
  browser('press', 'Enter');
  settle();
  await check('NV-3 the overview, a page, and an answer open with the keyboard alone', () => {
    assert.equal(text('#selected-page-heading'), 'Classes');
    browser('focus', '[data-answer-row="works"]');
    browser('press', 'Enter');
    settle();
    assert.equal(count('[data-answer-detail="works"]'), 1);
  });
  await check('NV-1 every page in the sidebar names its status in plain words', () => {
    const labels = evaluate(`[...document.querySelectorAll('.page-sidebar [data-page] .menu-status')].map(mark => mark.getAttribute('aria-label'))`);
    assert.equal(labels.length, 5);
    assert.ok(labels.every(label => ['Good', 'Needs work', 'Not checked', 'Partly checked', 'Can’t open'].includes(label)), labels.join(', '));
  });

  openProject('northwind');
  await check('OV-4 long page names wrap to at most two lines while long routes stay on one line', () => {
    const shape = evaluate(`(() => { const row = document.querySelector('[data-overview-page="revenue"]'); const name = row.querySelector('.overview-identity strong'); const route = row.querySelector('.overview-identity code'); const line = element => parseFloat(getComputedStyle(element).lineHeight); return { nameLines: Math.round(name.getBoundingClientRect().height / line(name)), routeLines: Math.round(route.getBoundingClientRect().height / line(route)), ellipsis: getComputedStyle(route).textOverflow }; })()`);
    assert.ok(shape.nameLines <= 2, `${shape.nameLines} lines`);
    assert.equal(shape.routeLines, 1);
    assert.equal(shape.ellipsis, 'ellipsis');
  });
  openPage('pipeline');
  await check('PR-5 a page with no screenshots offers one Take screenshots action and six Not checked answers', () => {
    assert.equal(evaluate(`[...document.querySelectorAll('[data-action="scan"]')].filter(button => button.offsetParent && /Take screenshots/.test(button.innerText)).length`), 1);
    assert.deepEqual(marks('[data-answers]').map(label => label.split(': ')[1]), Array(6).fill('Not checked'));
  });
  openPage('revenue');
  openAnswer('works');
  await check('WK-4 the longest content stays readable and data connections are folded', () => {
    assert.equal(count('[data-thing]'), 9);
    assert.equal(count('[data-bug]'), 3);
    assert.equal(evaluate(`document.querySelector('[data-connections]')?.open`), false);
    assert.ok(noSidewaysScroll());
  });

  const errors = browser('errors').trim();
  await check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));

  stopRecording();
  stopRecording = () => {};
  browser('open', welcome.url);
  settle(900);
  await check('AP-1 the first run shows the logo, what dogfood tells you, a sentence for your coding agent, and the address field', () => {
    assert.equal(count('.welcome-brand img[src="/logo.svg"]'), 1);
    assert.match(text('[data-promise]'), /working/i);
    assert.match(text('[data-agent-prompt]'), /dogfood/);
    assert.equal(count('[data-action="copy-agent-prompt"]'), 1);
    assert.equal(count('#product-url'), 1);
  });
  await check('AP-2 an invalid address is explained without starting', async () => {
    browser('fill', '#product-url', 'not a web address');
    browser('click', '#add-project-form button[type="submit"]');
    settle(600);
    assert.ok(text('#add-project-form [role="alert"]').length > 0);
    assert.deepEqual(await (await fetch(`${welcome.url}/api/projects`)).json(), []);
  });
  browser('set', 'viewport', '390', '844');
  settle();
  await check('AP-3 at phone width the first run fits with no sideways scrolling', () => assert.ok(noSidewaysScroll()));
  console.log(`\n${passed()} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { stopRecording(); } catch { /* not recording */ }
  try { browser('close'); } catch { /* closed */ }
  main.stop();
  welcome.stop();
  rmSync(data, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
}
