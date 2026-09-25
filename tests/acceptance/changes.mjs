// Acceptance: after a deploy, "Scan all pages" shows what changed visually since the last scan
// and which reviewed pages need another look, in the API, the app, and over MCP (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-changes-'));
process.env.DOGFOOD_DATA = data;
const store = await import(join(repo, 'lib/store.mjs'));
let passed = 0;
let release = 1;

function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// Release 2 adds a large banner to the home page only, as a deploy would.
function page(title) {
  const banner = release === 2 && title === 'Home' ? '<div style="height:360px;background:#d33;color:#fff;font-size:40px;padding:40px">New spring timetable</div>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="margin:0;font:16px system-ui"><nav aria-label="Main"><a href="/">Home</a> <a href="/about">About</a></nav>${banner}<main style="padding:24px"><h1>${title}</h1><p>${'Stable copy. '.repeat(60)}</p></main></body></html>`;
}

const fixture = createServer((request, response) => {
  const path = new URL(request.url, 'http://fixture').pathname;
  const titles = { '/': 'Home', '/about': 'About' };
  if (!titles[path]) return response.writeHead(404).end('Not found');
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(titles[path]));
});
await new Promise(done => fixture.listen(0, '127.0.0.1', done));
const site = `http://127.0.0.1:${fixture.address().port}`;

function run(script, args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(repo, script), ...args], { env: { ...process.env, DOGFOOD_DATA: data } });
    let stderr = '';
    child.stderr.on('data', text => { stderr += text; });
    child.on('close', code => (code === 0 ? done() : fail(new Error(`${script} exited ${code}: ${stderr}`))));
  });
}

async function freePort() {
  return new Promise(done => { const probe = createNetServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
}

const session = `dogfood-changes-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 120_000 });
function evaluate(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
const click = selector => evaluate(`(document.querySelector(${JSON.stringify(selector)})?.click(), true)`);
const text = selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);

let server;
try {
  await run('scripts/onboard.mjs', [`${site}/`, '--name', 'Swim Club']);
  store.recordVerdicts('swim-club', 'home', { checks: { clarity: { status: 'pass', note: 'Heading and navigation read clearly at 1440 wide.' } } }, 'agent:proof');
  release = 2;

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  const post = path => fetch(`${url}${path}`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: '{}' });
  const foreign = await fetch(`${url}/api/projects/swim-club/scan`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  check('the scan-all API refuses cross-origin requests', () => assert.equal(foreign.status, 403));
  const started = await post('/api/projects/swim-club/scan');
  const { job } = await started.json();
  let status;
  for (let waited = 0; waited < 300_000; waited += 1000) {
    status = await (await fetch(`${url}/api/jobs/${job}`)).json();
    if (status.status !== 'running') break;
    await new Promise(done => setTimeout(done, 1000));
  }
  check('Scan all runs as a job and reports which pages changed', () => {
    assert.equal(started.status, 202);
    assert.equal(status.status, 'done', JSON.stringify(status));
    assert.equal(status.total, 2);
    assert.equal(status.scanned, 2);
    assert.deepEqual(status.changed, ['home']);
    assert.equal(status.projectId, 'swim-club');
  });

  const project = await (await fetch(`${url}/api/projects/swim-club`)).json();
  const home = project.pages.find(item => item.id === 'home');
  const about = project.pages.find(item => item.id === 'about');
  check('only the reviewed page that changed needs another look', () => {
    assert.equal(home.progress.changedSinceReview, true);
    assert.equal(about.progress.changedSinceReview, false);
    assert.equal(home.scan.changes.desktop.changed, true);
    assert.equal(about.scan.changes.desktop.changed, false);
  });
  const images = await Promise.all([home.scan.changes.desktop.diffPath, home.scan.changes.desktop.previousPath].map(path => fetch(`${url}${path}`)));
  check('the diff and the previous screenshot are served as images', () => {
    for (const response of images) {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/png');
    }
  });

  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  browser('wait', '800');
  check('the overview counts pages changed since their review', () => {
    assert.match(text('[data-metric="changed"]'), /\b1\b/);
  });
  check('the overview marks the changed page, and only it', () => {
    assert.match(text('[data-overview-page="home"] [data-changed-since-review]'), /Changed since review/);
    assert.equal(evaluate(`Boolean(document.querySelector('[data-overview-page="about"] [data-changed-since-review]'))`), false);
  });
  check('Scan all pages is the overview\'s action', () => {
    assert.equal(evaluate(`document.querySelector('button[data-action="scan-all"]')?.classList.contains('save-button')`), true);
  });
  evaluate(`(() => { const select = document.querySelector('#page-filter'); select.value = 'changed'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  browser('wait', '500');
  check('the sidebar can show only pages changed since review', () => {
    assert.deepEqual(evaluate(`[...document.querySelectorAll('.page-groups [data-page]')].map(item => item.dataset.page)`), ['home']);
  });

  click('[data-page="home"]');
  browser('wait', '500');
  click('[data-view="capture"]');
  browser('wait', '1500');
  check('See page shows what changed, with the previous, current, and diff images', () => {
    const panel = text('section[aria-label="Visual changes"]');
    assert.match(panel, /Changed since review/i);
    assert.match(panel, /\d+(\.\d+)?% of (the )?pixels/);
    const loaded = evaluate(`['previous', 'current', 'diff'].map(kind => document.querySelector('section[aria-label="Visual changes"] img[data-change-image="' + kind + '"]')?.naturalWidth > 0)`);
    assert.deepEqual(loaded, [true, true, true]);
  });
  evaluate(`(() => { const select = document.querySelector('#page-filter'); select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  click('[data-page="about"]');
  browser('wait', '500');
  click('[data-view="capture"]');
  browser('wait', '800');
  check('a page that did not change says so', () => {
    assert.match(text('section[aria-label="Visual changes"]'), /No visual change/i);
  });

  const child = spawn(process.execPath, [join(repo, 'mcp.mjs')], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'dogfood_scan_project', arguments: { project: 'swim-club' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dogfood_next', arguments: { project: 'swim-club' } } })}\n`);
  for (let waited = 0; waited < 300_000 && !output.includes('"id":3'); waited += 250) await new Promise(done => setTimeout(done, 250));
  child.kill();
  const replies = Object.fromEntries(output.trim().split('\n').map(line => JSON.parse(line)).map(message => [message.id, message]));
  check('dogfood_scan_project rescans every page and lists what changed since the previous scan', () => {
    assert.notEqual(replies[2].result.isError, true, replies[2].result.content?.[0]?.text);
    const summary = JSON.parse(replies[2].result.content[0].text);
    assert.equal(summary.scanned, 2);
    assert.deepEqual(summary.changed, [], 'nothing changed since the scan just before it');
  });
  check('dogfood_next tells agents which pages changed since their review', () => {
    const next = JSON.parse(replies[3].result.content[0].text);
    assert.equal(next.find(item => item.page === 'home').changedSinceReview, true);
  });
  const errors = browser('errors').trim();
  check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* closed */ }
  server?.kill();
  fixture.close();
  rmSync(data, { recursive: true, force: true });
}
