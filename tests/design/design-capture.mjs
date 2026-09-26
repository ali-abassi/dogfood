// Captures every dogfood surface and state at the default and minimum viewports, first paint and full page.
// Usage: node tests/design/design-capture.mjs <phase> <data-dir> (needs agent-browser)
//   → design-evidence/<phase>/<surface>/<state>-<viewport>.png and <state>-<viewport>-full.png
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const [phase, data] = process.argv.slice(2);
const out = join(repo, 'design-evidence', phase);
const session = `dogfood-design-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
const run = script => browser('eval', `(async () => { ${script} ; return true; })()`);
const wait = ms => browser('wait', String(ms));
const viewports = { default: [1440, 900], minimum: [390, 844] };

const pause = ms => `await new Promise(r => setTimeout(r, ${ms}))`;
const openProject = id => `const s = document.querySelector('#project-select'); if (s && s.value !== '${id}') { s.value = '${id}'; s.dispatchEvent(new Event('change', { bubbles: true })); } ${pause(800)}`;
const click = selector => `document.querySelector(${JSON.stringify(selector)})?.click(); ${pause(400)}`;
const page = (project, id) => `${openProject(project)}; ${click(`.page-sidebar [data-page="${id}"]`)}`;
const answer = (project, id, view) => `${page(project, id)}; ${click(`[data-answer-row="${view}"]`)}`;

const shots = [
  ['overview', 'normal', openProject('tidepool')],
  ['overview', 'long', openProject('northwind')],
  ['overview', 'empty', openProject('empty-app')],
  ['report', 'normal', page('tidepool', 'book')],
  ['report', 'long', page('northwind', 'revenue')],
  ['report', 'empty', page('northwind', 'pipeline')],
  ['answer', 'normal', answer('tidepool', 'book', 'design')],
  ['answer', 'long', answer('northwind', 'revenue', 'design')],
  ['answer', 'empty', answer('tidepool', 'admin', 'purpose')],
  ['answer', 'editing', `${answer('tidepool', 'book', 'purpose')}; ${click('[data-action="edit-answer"]')}`],
  ['answer', 'speed', answer('tidepool', 'home', 'speed')],
  ['answer', 'safety', answer('tidepool', 'book', 'safety')],
  ['answer', 'questions', `${answer('tidepool', 'book', 'safety')}; ${click('[data-action="answer-questions"]')}`],
  ['works', 'normal', answer('tidepool', 'book', 'works')],
  ['works', 'long', answer('northwind', 'revenue', 'works')],
  ['works', 'empty', answer('northwind', 'pipeline', 'works')],
  ['works', 'adding', `${answer('tidepool', 'book', 'works')}; ${click('[data-action="report-bug"]')}`],
  ['screens', 'normal', `${page('tidepool', 'classes')}; ${click('[data-action="view-screens"]')}`],
  ['screens', 'phone', `${page('tidepool', 'classes')}; ${click('[data-action="view-screens"]')}; ${click('[data-screens-device="mobile"]')}`],
  ['screens', 'empty', `${page('tidepool', 'admin')}; ${click('[data-action="view-screens"]')}`],
  ['add-project', 'normal', `${openProject('tidepool')}; ${click('[data-action="add-project"]')}`],
  ['suggestions', 'normal', `${openProject('tidepool')}; ${pause(600)}; ${click('[data-action="review-suggestions"]')}`],
  ['navigation', 'normal', `${page('tidepool', 'book')}; ${click('[data-action="open-pages"]')}`],
  ['navigation', 'search-empty', `${openProject('tidepool')}; ${click('[data-action="open-pages"]')}; const q = document.querySelector('#page-search'); q.value = 'zzz'; q.dispatchEvent(new Event('input', { bubbles: true })); ${pause(300)}`],
];

async function freePort() {
  return new Promise(done => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
}

async function serve(dataDir) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: dataDir }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/projects`)).ok) break; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  return { child, url: `http://127.0.0.1:${port}` };
}

function capture(surface, state, viewport) {
  mkdirSync(join(out, surface), { recursive: true });
  run('window.scrollTo(0, 0)');
  browser('screenshot', join(out, surface, `${state}-${viewport}.png`));
  browser('screenshot', '--full', join(out, surface, `${state}-${viewport}-full.png`));
}

const main = await serve(data);
const empty = await serve(mkdtempSync(join(tmpdir(), 'dogfood-design-empty-')));
try {
  for (const [viewport, [width, height]] of Object.entries(viewports)) {
    browser('open', main.url);
    browser('set', 'viewport', String(width), String(height));
    wait(1000);
    for (const [surface, state, script] of shots) {
      // A fresh load per shot, so an editor left open by one shot cannot block the next.
      browser('open', main.url);
      wait(700);
      run(script);
      wait(700);
      capture(surface, state, viewport);
    }
    browser('open', empty.url);
    wait(800);
    capture('add-project', 'welcome', viewport);
  }
  console.log(`captured ${(shots.length + 1) * 4} screenshots in ${out}`);
} finally {
  try { browser('close'); } catch { /* closed */ }
  main.child.kill();
  empty.child.kill();
}
