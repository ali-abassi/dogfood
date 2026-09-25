// Acceptance: people review the AI review's suggested features for a whole project in one pass
// and add the ones they agree with in one step; agents list them over MCP (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-suggestions-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
// The suite seeds its own AI reviews; the demo's real ones would otherwise be newer.
rmSync(join(data, 'visual-reviews'), { recursive: true, force: true });
const manifestFile = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const pageById = id => manifest.pages.find(item => item.id === id);

// Seeds a saved AI review; `stale` makes it belong to older screenshots.
function seedReview(pageId, suggestions, stale = false) {
  const { captures } = pageById(pageId);
  const hash = device => (captures[device].sha256 ? { sha256: stale ? 'f'.repeat(64) : captures[device].sha256 } : null);
  const directory = join(data, 'visual-reviews/tidepool', pageId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, '2026-09-25T00-00-00.000Z-seed.json'), JSON.stringify({ promptVersion: 'page-answers-v4', captures: { desktop: hash('desktop'), mobile: hash('mobile') }, analyzedAt: '2026-09-25T00:00:00.000Z', analysis: { dimensions: { design: { score: 8, reason: 'One consistent style.' }, purpose: { score: 8, reason: 'The heading says what the page is for.' }, ease: { score: 8, reason: 'The main job is easy to find.' } }, suggestedFeatures: suggestions } }));
}
seedReview('home', [
  { name: 'Book a lesson button', expected: 'Opens the booking page.' },
  { name: 'Weekly timetable', expected: 'Shows every class time this week.' },
  { name: 'learn why to choose Tidepool', expected: 'Already listed, so it must not be offered.' },
]);
seedReview('classes', [
  { name: 'Age filter', expected: 'Choosing an age shows only matching classes.' },
  { name: 'Class price', expected: 'Each class shows its price per lesson.' },
], true);

let passed = 0;
function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}
const session = `dogfood-suggestions-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function evaluate(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);

const port = await new Promise(done => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => done(free)); }); });
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  const pending = await (await fetch(`${url}/api/projects/tidepool/suggestions`)).json();
  check('the suggestions API lists what each page does not list yet', () => {
    assert.deepEqual(pending.map(item => [item.page, item.suggestions.length, item.stale]), [['home', 2, false], ['classes', 2, true]]);
  });
  const foreign = await fetch(`${url}/api/projects/tidepool/features`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ pages: { home: [{ name: 'X' }] } }) });
  check('adding features for the project refuses cross-origin requests', () => assert.equal(foreign.status, 403));

  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  browser('wait', '800');
  check('the overview says how many suggested things are waiting', () => {
    assert.match(text('[data-suggestions-waiting]'), /The AI suggested 4 things people can do on 2 pages/);
  });
  evaluate(`(document.querySelector('[data-action="review-suggestions"]').click(), true)`);
  browser('wait', '600');
  const offered = evaluate(`[...document.querySelectorAll('section[aria-label="Review suggested features"] [data-suggestion-page]')].map(group => ({ page: group.dataset.suggestionPage, text: group.textContent, boxes: [...group.querySelectorAll('input[name="project-suggestion"]')].map(box => box.checked) }))`);
  check('SG-1 the review lists suggestions by page, all checked, without ones already listed', () => {
    assert.deepEqual(offered.map(item => [item.page, item.boxes]), [['home', [true, true]], ['classes', [true, true]]]);
    assert.ok(offered[0].text.includes('Weekly timetable') && offered[0].text.includes('Shows every class time this week.'));
    assert.ok(!/learn why to choose Tidepool/i.test(offered[0].text));
  });
  check('suggestions from a review of older screenshots are marked', () => {
    assert.match(offered[1].text, /older screenshots/i);
    assert.doesNotMatch(offered[0].text, /older screenshots/i);
  });
  check('SG-1 the add button counts the checked suggestions and is the view\'s one blue action', () => {
    assert.match(text('button[data-action="add-project-suggestions"]'), /Add 4 things/);
    assert.equal(evaluate(`document.querySelector('button[data-action="add-project-suggestions"]').classList.contains('save-button')`), true);
  });
  evaluate(`(() => { const box = document.querySelectorAll('[data-suggestion-page="home"] input[name="project-suggestion"]')[1]; box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  check('unchecking updates the count', () => assert.match(text('button[data-action="add-project-suggestions"]'), /Add 3 things/));
  evaluate(`(document.querySelector('button[data-action="add-project-suggestions"]').click(), true)`);
  browser('wait', '900');
  const saved = JSON.parse(readFileSync(manifestFile, 'utf8'));
  check('SG-3 adding saves only the checked suggestions, with expected behavior, attributed to you', () => {
    const names = id => saved.pages.find(item => item.id === id).features.map(feature => feature.name);
    assert.ok(names('home').includes('Book a lesson button'));
    assert.ok(!names('home').includes('Weekly timetable'));
    assert.ok(names('classes').includes('Age filter') && names('classes').includes('Class price'));
    const added = saved.pages.find(item => item.id === 'classes').features.find(feature => feature.name === 'Age filter');
    assert.deepEqual([added.expected, added.addedBy, added.status], ['Choosing an age shows only matching classes.', 'person', 'untested']);
  });
  check('SG-3 what was left unchecked is still offered afterwards', () => {
    assert.match(text('[data-suggestions-waiting]') || text('section[aria-label="Review suggested features"]'), /suggested 1 thing|Weekly timetable/);
  });
  browser('set', 'viewport', '390', '844');
  evaluate(`(document.querySelector('[data-action="review-suggestions"]')?.click(), true)`);
  browser('wait', '500');
  check('SG-2 the review fits a phone screen and its Add button stays reachable', () => {
    assert.equal(evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), true);
    const add = evaluate(`(() => { const button = document.querySelector('button[data-action="add-project-suggestions"]'); if (!button) return 'no review'; const box = button.getBoundingClientRect(); return box.bottom <= innerHeight && box.top >= 0; })()`);
    assert.ok(add === true || add === 'no review', String(add));
  });
  const errors = browser('errors').trim();
  check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));

  const child = spawn(process.execPath, [join(repo, 'mcp.mjs')], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dogfood_suggestions', arguments: { project: 'tidepool' } } })}\n`);
  for (let waited = 0; waited < 10_000 && !output.includes('"id":2'); waited += 100) await new Promise(done => setTimeout(done, 100));
  child.kill();
  const reply = output.trim().split('\n').map(line => JSON.parse(line)).find(message => message.id === 2);
  check('agents list the remaining suggestions with dogfood_suggestions', () => {
    assert.deepEqual(JSON.parse(reply.result.content[0].text).map(item => [item.page, item.suggestions.map(suggestion => suggestion.name)]), [['home', ['Weekly timetable']]]);
  });
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* closed */ }
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
