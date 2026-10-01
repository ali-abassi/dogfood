// Acceptance: search the real sidebar and open a result on desktop and phone.
// Run sequentially with other browser suites: a shared Chrome profile has one viewport.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checker, startServer } from '../harness.mjs';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-search-proof-'));
const session = `dogfood-search-proof-${process.pid}-${Date.now()}`;
const { check, passed } = checker();
const label = 'Search pages, routes, things to do or open bugs';
// Linux/CI proves a disposable UI fixture, never Ali's authenticated session.
const realProfile = process.platform === 'darwin' && !process.env.CI;
const launch = realProfile ? ['--profile', 'Default', '--headed'] : [];
const browserOptions = ['--session', session, '--pin-tab', ...launch];
let server;

const browser = (...args) => execFileSync('agent-browser', [
  ...browserOptions, ...args,
], { encoding: 'utf8', timeout: 60_000 });

function evaluate(expression) {
  const output = execFileSync('agent-browser', [
    ...browserOptions, 'eval', '--stdin',
  ], { input: `JSON.stringify(${expression})`, encoding: 'utf8', timeout: 60_000 });
  const value = JSON.parse(output.trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}

const snapshot = () => browser('snapshot', '-i');
const sidebarIds = () => evaluate(`[...document.querySelectorAll('.page-sidebar [data-page]')].map(item => item.dataset.page)`);
const noOverflow = () => evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1');

function search(query) {
  browser('fill', '#page-search', query);
  snapshot();
  return sidebarIds();
}

function openSidebar(width) {
  if (width > 760) return;
  browser('click', '[data-action="open-pages"]');
  snapshot();
  assert.equal(evaluate(`document.activeElement.id`), 'page-search');
}

async function checkSearch(width, height) {
  const name = `${width} × ${height}`;
  browser('set', 'viewport', String(width), String(height));
  browser('open', `${server.url}/?project=tidepool&view=overview`);
  browser('wait', '--fn', 'document.querySelector("#page-search") !== null');
  snapshot();
  assert.equal(new URL(evaluate('location.href')).origin, server.url);
  openSidebar(width);
  await check(`${name}: the search label explains routes, things to do and open bugs`, () => {
    assert.equal(evaluate(`document.querySelector('#page-search').closest('label').querySelector('.sr-only').textContent`), label);
    assert.equal(noOverflow(), true);
  });
  await check(`${name}: routes and feature words locate a page together`, () => {
    assert.deepEqual(search('membership /landing'), ['home']);
  });
  await check(`${name}: open bug identifiers work and resolved bugs do not`, () => {
    assert.deepEqual(search('tp-001'), ['book']);
    assert.deepEqual(search('tp-archived'), []);
    assert.equal(evaluate(`document.querySelector('.page-no-results').textContent`), 'No pages match. Try another search or filter.');
  });
  await check(`${name}: typing in the middle preserves focus and the caret as results update`, () => {
    assert.deepEqual(search('caf home'), ['home']);
    evaluate(`(() => { const input = document.querySelector('#page-search'); input.focus(); input.setSelectionRange(3, 3); return true; })()`);
    browser('type', '#page-search', 'é');
    snapshot();
    const input = evaluate(`(() => { const input = document.querySelector('#page-search'); return { value: input.value, focused: document.activeElement === input, start: input.selectionStart, end: input.selectionEnd }; })()`);
    assert.deepEqual(input, { value: 'café home', focused: true, start: 4, end: 4 });
    assert.deepEqual(sidebarIds(), ['home']);
    assert.equal(noOverflow(), true);
  });
  await check(`${name}: clicking the result opens its report and focuses its heading`, () => {
    browser('click', '.page-sidebar [data-page="home"]');
    browser('wait', '#selected-page-heading');
    snapshot();
    assert.equal(evaluate(`document.querySelector('#selected-page-heading').textContent`), 'Café home');
    assert.equal(evaluate('document.activeElement.id'), 'selected-page-heading');
    assert.equal(evaluate(`document.querySelector('#page-search').value`), '');
    assert.equal(noOverflow(), true);
  });
}

function prepareFixture(store) {
  const project = store.readProject('tidepool');
  const home = project.pages.find(item => item.id === 'home');
  Object.assign(home, { name: 'Café home', route: '/landing' });
  home.features[0].name = 'Choose café membership';
  const book = project.pages.find(item => item.id === 'book');
  book.findings.push({ id: 'TP-ARCHIVED', severity: 'P3', status: 'resolved', title: 'Archived booking ghost', detail: 'Only a resolved fixture.', evidence: '' });
  store.writeProject(project);
}

try {
  cpSync(join(repo, 'demo'), data, { recursive: true });
  process.env.DOGFOOD_DATA = data;
  const store = await import(join(repo, 'lib/store.mjs'));
  prepareFixture(store);
  server = await startServer(data);
  await checkSearch(1280, 900);
  await checkSearch(390, 844);
  const errors = browser('errors').trim();
  await check('search and navigation throw no page errors', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  console.log(`\n${passed()} checks passed; browser session ${session}.`);
} catch (error) {
  console.error(`FAILED after ${passed()} checks:`, error.message);
  process.exitCode = 1;
} finally {
  if (!realProfile) {
    try { browser('close'); } catch { /* fixture browser already stopped */ }
  }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
}
