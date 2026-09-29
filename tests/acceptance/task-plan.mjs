// Acceptance: a checkout-only project can plan, claim, verify and accept a task in the browser.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-plan-'));
const checkout = mkdtempSync(join(tmpdir(), 'dogfood-plan-checkout-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
writeFileSync(join(checkout, 'ready.txt'), 'Ready for a real check.\n');
execFileSync('git', ['init', '-q', checkout]);
execFileSync('git', ['-C', checkout, 'add', 'ready.txt']);
execFileSync('git', ['-C', checkout, '-c', 'user.name=Dogfood Test', '-c', 'user.email=dogfood@example.test', 'commit', '-qm', 'Fixture']);
const manifestPath = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.source.checkout = checkout;
manifest.source.url = null;
manifest.pages = [];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const { browser, evaluate } = browserSession('task-plan');
const { check, passed } = checker();
let server;

const settle = () => browser('wait', '350');
const click = selector => { evaluate(`document.querySelector(${JSON.stringify(selector)}).click() || true`); settle(); };
const fill = (selector, value) => browser('fill', selector, value);
const status = () => evaluate(`document.querySelector('[data-selected-task] .task-status')?.textContent`);

try {
  server = await startServer(data);
  browser('open', server.url);
  browser('set', 'viewport', '1280', '850');
  settle();

  await check('checkout-only project opens with Plan available and no fake app link', () => {
    assert.equal(evaluate(`document.querySelector('[data-project-view="plan"]') !== null`), true);
    assert.equal(evaluate(`document.querySelector('.source-link') === null`), true);
    assert.equal(evaluate(`document.querySelector('[data-action="scan-all"]') === null`), true);
    click('[data-project-view="plan"]');
    assert.match(evaluate(`document.querySelector('.plan-empty')?.textContent`), /No tasks yet/);
  });

  await check('human can add a task with a real argv check', () => {
    click('[data-action="add-task"]');
    fill('#task-title', 'Prove the checkout is ready');
    fill('#task-outcome', 'The ready file exists in the checkout.');
    fill('#task-checks', JSON.stringify([process.execPath, '-e', 'require("fs").accessSync("ready.txt")']));
    click('#task-form button[type="submit"]');
    assert.equal(evaluate(`document.querySelectorAll('.plan-tasks li').length`), 1);
    assert.equal(status(), 'To do');
    assert.match(evaluate(`document.querySelector('.plan-detail')?.textContent`), /ready file exists/);
  });

  await check('claim, verify and accept have server-backed states and receipt', () => {
    click('[data-action="task-claim"]');
    assert.equal(status(), 'In progress');
    click('[data-action="task-verify"]');
    assert.match(evaluate(`document.querySelector('.task-receipt')?.textContent`), /Passed/);
    assert.equal(evaluate(`document.querySelector('[data-action="task-accept"]') !== null`), true);
    click('[data-action="task-accept"]');
    assert.equal(status(), 'Accepted');
    assert.match(evaluate(`document.querySelector('.plan-summary')?.textContent`), /1 of 1 accepted/);
  });

  await check('Plan remains usable at phone width without horizontal overflow', () => {
    browser('set', 'viewport', '390', '844');
    settle();
    assert.equal(evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
    assert.equal(evaluate(`document.querySelector('.plan-document summary') !== null`), true);
  });

  console.log(`\n${passed()} task Plan checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
  rmSync(checkout, { recursive: true, force: true });
}
