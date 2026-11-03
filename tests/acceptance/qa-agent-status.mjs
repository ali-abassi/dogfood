// Mock native state: page QA uses the durable Agent board, not a timestamp-based cooldown.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-agent-status-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const runsFile = join(data, 'qa-agents/tidepool.json');
mkdirSync(join(data, 'qa-agents'), { recursive: true });
writeFileSync(runsFile, JSON.stringify({ home: { run: 'legacy-run', startedAt: new Date().toISOString(), workdir: data } }));
const fake = join(data, 'pal');
writeFileSync(fake, `#!/usr/bin/env node\nconsole.log(JSON.stringify({name:'fixture-qa',cwd:${JSON.stringify(data)},status:'running',turns:[{n:1,status:'running'}]}));\n`, { mode: 0o700 });
process.env.DOGFOOD_PAL_BIN = fake;
process.env.DOGFOOD_QA_AGENT = 'must-not-be-executed';
const card = { id: 'fixture-qa', title: 'Check Home', request: 'Audit Home.', backend: 'codex', intent: 'qa', pageId: 'home', featureId: '', taskId: '', status: 'running', comments: [], session: 'fixture-qa', branch: '', checkout: '', baseRevision: '', result: '', error: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pending: [], queued: false, started: true, seenTurn: 0, operation: null, stopRequested: false };
const boardFile = join(data, 'agent-board/tidepool.json');
function nativeStatus(status) {
  mkdirSync(join(data, 'agent-board'), { recursive: true });
  writeFileSync(boardFile, JSON.stringify({ version: 1, projectId: 'tidepool', cards: [{ ...card, status }] }));
}
const { browser, evaluate } = browserSession('qa-agent-status');
const { check, passed } = checker();
let server;
function openHome() {
  browser('open', server.url);
  browser('wait', '.overview-content');
  evaluate(`document.querySelector('[data-page="home"]').click() || true`);
  browser('wait', '.qa-agent-status');
}
try {
  server = await startServer(data);
  openHome();
  await check('legacy unknown launches remain historical and do not impose a thirty-minute cooldown', () => {
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.disabled`), false);
    assert.match(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /Earlier launch; status unavailable/);
    assert.doesNotMatch(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /another run available in/);
  });
  nativeStatus('running');
  openHome();
  await check('actual native working status prevents a duplicate and links to the same conversation', () => {
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.disabled`), true);
    assert.match(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /Working/);
    assert.match(evaluate(`document.querySelector('.qa-agent-status a')?.getAttribute('href')`), /view=board&card=fixture-qa/);
  });
  await check('the native status and request link fit a phone viewport', () => {
    browser('set', 'viewport', '390', '844');
    assert.equal(evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
  });
  nativeStatus('review');
  openHome();
  await check('completed native work is reviewable immediately and allows another deliberate QA request', () => {
    assert.equal(evaluate(`document.querySelector('[data-action="start-qa-agent"]')?.disabled`), false);
    assert.match(evaluate(`document.querySelector('.qa-agent-status')?.textContent`), /Ready for review/);
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
