// A recent start is a recorded event, not proof that the agent is working.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-agent-status-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const runsFile = join(data, 'qa-agents/tidepool.json');
mkdirSync(join(data, 'qa-agents'), { recursive: true });
const record = startedAt => writeFileSync(runsFile, JSON.stringify({ home: { run: 'fixture-run', startedAt, workdir: data } }));
record(new Date().toISOString());
process.env.DOGFOOD_QA_AGENT = 'true';

const { browser, evaluate } = browserSession('qa-agent-status');
const { check, passed } = checker();
let server;

try {
  server = await startServer(data);
  browser('open', server.url);
  browser('wait', '350');
  evaluate(`document.querySelector('[data-page="home"]').click() || true`);
  browser('wait', '350');

  await check('recent start is shown as status unknown and prevents a duplicate start', () => {
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.disabled`), true);
    assert.match(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /current status unknown/);
    assert.match(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /another run available in/);
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.textContent`), 'Recent start recorded');
  });

  await check('the recent-start explanation fits a phone viewport', () => {
    browser('set', 'viewport', '390', '844');
    assert.equal(evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
  });

  await check('an older start leaves the agent action available', () => {
    record(new Date(Date.now() - 31 * 60_000).toISOString());
    browser('reload');
    browser('wait', '350');
    evaluate(`document.querySelector('[data-page="home"]').click() || true`);
    browser('wait', '350');
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.disabled`), false);
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.textContent`), 'Ask the QA agent');
  });

  console.log(`\n${passed()} QA agent status checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
}
