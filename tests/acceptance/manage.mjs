// Acceptance: people can download a project's QA report and remove a page registered by mistake,
// with a reason on record, from the app (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-manage-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const session = `dogfood-manage-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function evaluate(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
let passed = 0;
function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const port = await new Promise(done => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => done(free)); }); });
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });
try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  const report = await fetch(`${url}/api/projects/tidepool/report`);
  const text = await report.text();
  check('the report API returns the project report as Markdown', () => {
    assert.equal(report.status, 200);
    assert.match(report.headers.get('content-type'), /^text\/markdown/);
    assert.match(text, /^# Tidepool \(demo\): QA report/);
  });
  const foreign = await fetch(`${url}/api/projects/tidepool/pages/admin/remove`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'A cross-site request must not remove pages.' }) });
  check('removing a page refuses cross-origin requests', () => assert.equal(foreign.status, 403));

  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  browser('wait', '800');
  check('the overview offers the report as a download next to Scan all', () => {
    const link = evaluate(`(() => { const a = document.querySelector('.overview-actions a[download]'); return a && { href: a.getAttribute('href'), download: a.getAttribute('download'), text: a.textContent }; })()`);
    assert.deepEqual(link, { href: '/api/projects/tidepool/report', download: 'tidepool-qa-report.md', text: 'Download report' });
  });
  evaluate(`(document.querySelector('[data-page="admin"]').click(), true)`);
  browser('wait', '500');
  evaluate(`(document.querySelector('[data-action="remove-page"]').click(), true)`);
  browser('wait', '300');
  check('Remove page opens an inline form asking why', () => {
    assert.equal(evaluate(`document.activeElement?.id`), 'remove-reason');
  });
  evaluate(`(() => { const form = document.querySelector('#remove-page-form'); form.querySelector('textarea').value = 'dup'; form.querySelector('textarea').removeAttribute('minlength'); form.requestSubmit(); return true; })()`);
  browser('wait', '500');
  check('a reason that is too short is refused and the page stays', () => {
    assert.match(evaluate(`document.querySelector('#remove-page-error').textContent`), /12–400/);
    assert.ok(JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8')).pages.some(page => page.id === 'admin'));
  });
  evaluate(`(() => { const form = document.querySelector('#remove-page-form'); form.querySelector('textarea').value = 'Staff pages are out of scope for the public demo.'; form.requestSubmit(); return true; })()`);
  browser('wait', '800');
  const saved = JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8'));
  check('removing the page returns to the overview without it', () => {
    assert.equal(evaluate(`Boolean(document.querySelector('section[aria-label="Project overview"]'))`), true);
    assert.equal(evaluate(`Boolean(document.querySelector('[data-page="admin"]'))`), false);
  });
  check('the removal is recorded with its reason and who removed it', () => {
    assert.ok(!saved.pages.some(page => page.id === 'admin'));
    assert.deepEqual([saved.removedPages[0].id, saved.removedPages[0].reason, saved.removedPages[0].by], ['admin', 'Staff pages are out of scope for the public demo.', 'person']);
  });
  const errors = browser('errors').trim();
  check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* closed */ }
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
