/* eslint-disable complexity -- This proof runner enumerates independent surface probes. */
// Captures actual rendered UI with controlled, isolated fixture states. Does not call providers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:4433';
const out = resolve(process.argv[3] || 'data/reviews/app-polish-2026-09-29');
const session = `dogfood-polish-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, '--profile', 'Default', ...args], { encoding: 'utf8', timeout: 60_000 });
const evaluate = code => JSON.parse(browser('eval', `(async()=>{${code}})()`));
const results = [];
const cases = [
  ['navigation', 'tidepool', 'overview', '', 'northwind', 'empty-app'],
  ['overview', 'tidepool', 'overview', '', 'northwind', 'empty-app'],
  ['vision', 'dogfood-preview', 'vision', '', 'long-docs', 'empty-app'],
  ['guide', 'dogfood-preview', 'guide', '', 'long-docs', 'empty-app'],
  ['features', 'tidepool', 'features', '', 'northwind', 'empty-app'],
  ['competitors', 'tidepool', 'competitors', '', 'northwind', 'empty-app'],
  ['report', 'tidepool', 'report', 'book', 'northwind', 'northwind'],
  ['answers', 'tidepool', 'design', 'book', 'northwind', 'tidepool'],
  ['screens', 'tidepool', 'screens', 'classes', 'tidepool', 'tidepool'],
  ['suggestions', 'tidepool', 'suggestions', '', 'tidepool', 'empty-app'],
  ['onboarding', 'tidepool', 'add-project', '', 'tidepool', 'empty-app'],
  ['plan', 'dogfood-preview', 'plan', '', 'dogfood-preview', 'empty-app'],
];

function pageId(surface, state, normal) {
  if (surface === 'report') return state === 'long' ? 'revenue' : state === 'empty' ? 'pipeline' : normal;
  if (surface === 'answers') return state === 'long' ? 'revenue' : state === 'empty' ? 'admin' : normal;
  if (surface === 'screens' && state === 'empty') return 'admin';
  return normal;
}

function open(project, view, page = '') {
  browser('open', `${url}/?project=${project}&view=${view}${page ? `&page=${page}` : ''}`);
  browser('wait', 'h1');
  browser('wait', '250');
}

function click(selector) {
  browser('click', selector);
  browser('wait', '200');
}

async function prepare(surface, variant) {
  if (surface === 'navigation') click('[data-action="open-pages"]');
  if (surface === 'navigation' && variant === 'empty') browser('fill', '#page-search', 'unmatched scheduling and fiscal-calendar query');
  if (surface === 'onboarding' && variant === 'long') {
    browser('fill', '#product-url', 'https://workspace.northwind.example/reports/region/product-line/channel?period=trailing-twelve-months&currency=usd');
    await evaluate(`const {state}=await import('/js/state.mjs');state.projectDraft.name='Northwind reporting for operations, revenue and finance teams';const {render}=await import('/js/app.mjs');render();return true;`);
  }
  if (surface === 'plan' && variant === 'long') await evaluate(`const {state}=await import('/js/state.mjs');state.workflow.data.tasks[0].outcome='Compare regional revenue and pipeline while preserving every selected product line, currency, fiscal-calendar period and permission boundary across reloads. '.repeat(8);const {render}=await import('/js/app.mjs');render();return true;`);
  if (surface === 'competitors' && variant === 'long') click('[data-action="open-competitor"]');
}

function layout() {
  return evaluate(`return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,h1:document.querySelector('h1')?.textContent,visiblePrimary:[...document.querySelectorAll('button.save-button')].filter(x=>x.getBoundingClientRect().width).length};`);
}

function capture(surface, state, viewport) {
  const dir = join(out, surface);
  mkdirSync(dir, { recursive: true });
  browser('eval', 'window.scrollTo(0,0)');
  browser('screenshot', join(dir, `${state}-${viewport}.png`));
  browser('screenshot', join(dir, `${state}-${viewport}-full.png`), '--full');
  const facts = layout();
  assert.ok(facts.scrollWidth <= facts.width, `${surface}/${state}/${viewport} overflows: ${JSON.stringify(facts)}`);
  results.push({ surface, state, viewport, controlledFixture: true, ...facts });
  writeFileSync(join(dir, `${state}-${viewport}.json`), JSON.stringify(facts, null, 2));
}

async function interaction(surface) {
  if (surface === 'navigation') { browser('select', '#project-select', 'northwind'); browser('wait', '200'); }
  if (surface === 'overview') click('.overview-page [data-page]');
  if (surface === 'vision') { const links = evaluate(`return [...document.querySelectorAll('.doc-toc a')].map(x=>x.getAttribute('href'));`); if (links.length) click('.doc-toc a'); }
  if (surface === 'guide') assert.equal(evaluate(`return document.querySelector('iframe')?.getAttribute('sandbox');`), 'allow-same-origin');
  if (surface === 'features') click('.feature-page');
  if (surface === 'competitors') { browser('fill', '#competitor-url', 'invalid'); click('#competitor-form button[type="submit"]'); assert.match(evaluate(`return document.querySelector('#competitor-error')?.textContent||'';`), /address|website|http/i); }
  if (surface === 'report') click('[data-answer-row="design"]');
  if (surface === 'answers') { click('[data-action="edit-answer"]'); browser('check', '#answer-form input[value="needs_work"]'); browser('fill', '#answer-note', 'The isolated fixture contrast was inspected and needs a clearer primary action.'); click('#answer-form button[type="submit"]'); assert.match(evaluate(`return document.querySelector('.answer-text')?.textContent||'';`), /isolated fixture/); }
  if (surface === 'screens') { click('[data-screens-device="mobile"]'); assert.equal(evaluate(`return document.querySelector('[data-screens-device="mobile"]')?.getAttribute('aria-pressed');`), 'true'); }
  if (surface === 'suggestions') { const boxes = evaluate(`return document.querySelectorAll('input[name="project-suggestion"]:checked').length;`); browser('uncheck', 'input[name="project-suggestion"]'); const label = evaluate(`return document.querySelector('[data-action="add-project-suggestions"]')?.textContent;`); assert.match(label, new RegExp(String(boxes - 1))); }
  if (surface === 'onboarding') { browser('fill', '#product-url', 'invalid'); click('#add-project-form button[type="submit"]'); assert.equal(evaluate(`return document.querySelector('#product-url')?.getAttribute('aria-invalid');`), 'true'); }
  if (surface === 'plan') { click('[data-action="add-task"]'); assert.ok(evaluate(`return !!document.querySelector('#task-form');`)); }
}

async function degraded(surface) {
  const changes = {
    vision: "state.docs.error='The project document could not be read. Retry when the checkout is available.';state.docs.loading=false;",
    guide: "state.docs.error='The brand guide could not be read. Retry when the checkout is available.';state.docs.loading=false;",
    competitors: "state.competitors.error='The saved research could not be read. Try again.';state.competitors.loading=false;",
    suggestions: "state.suggestions.error='The suggestions request failed. Your earlier choices are retained.';state.suggestions.loading=false;",
    onboarding: "state.onboarding.error='The app could not be opened. Start its server and try again.';state.onboarding.running=false;",
    plan: "state.workflow.error='The work plan could not be loaded. Try again.';state.workflow.loading=false;",
    report: "state.scan={key:state.project.id+'/'+state.pageId,running:false,error:'The page could not be opened. Start its server and check again.'};",
    answers: "state.visual.error='The optional model check is unavailable; manual evidence remains usable.';",
    screens: "state.project.pages.find(x=>x.id===state.pageId).captures.mobile={state:'blocked',reason:'No phone capture. Check the page to take one.'};state.screensDevice='mobile';",
    overview: "state.scanAll.error='The page check failed. Start the app and try again.';",
  };
  if (changes[surface]) await evaluate(`const {state}=await import('/js/state.mjs');${changes[surface]}const {render}=await import('/js/app.mjs');render();return true;`);
}

function audit(surface, viewport, theme) {
  browser('set', 'media', theme);
  const result = JSON.parse(browser('a11y', '--tags', 'wcag2a,wcag2aa', '--json'));
  writeFileSync(join(out, surface, `axe-${theme}-${viewport}.json`), JSON.stringify(result, null, 2));
  assert.equal(result.data.counts.violations, 0, `${surface} ${theme} has accessibility violations`);
}

try {
  for (const [viewport, width, height] of [['default', 1280, 900], ['minimum', 390, 844]]) {
    browser('set', 'viewport', String(width), String(height));
    for (const [surface, project, view, page, longProject, emptyProject] of cases) {
      browser('set', 'media', 'light');
      for (const [variant, id] of [['normal', project], ['long', longProject], ['empty', emptyProject]]) {
        open(id, view, pageId(surface, variant, page));
        await prepare(surface, variant);
        capture(surface, variant, viewport);
      }
      open(project, view, page);
      await prepare(surface, 'normal');
      audit(surface, viewport, 'light');
      audit(surface, viewport, 'dark');
      browser('set', 'media', 'light');
      await interaction(surface);
      capture(surface, 'interaction', viewport);
      open(project, view, page);
      await degraded(surface);
      capture(surface, 'degraded', viewport);
      console.log(`${surface}: ${viewport} normal, long, empty, interaction and degraded captured; both themes audited.`);
    }
  }
  writeFileSync(join(out, 'browser-proof.json'), JSON.stringify({ fixtureOnly: true, cases: results, result: 'pass' }, null, 2));
} finally {
  browser('close');
}
