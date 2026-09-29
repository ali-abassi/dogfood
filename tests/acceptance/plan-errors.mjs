// Task acceptance errors link only known pages to their report.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-plan-errors-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const { browser, evaluate } = browserSession('plan-errors');
const { check, passed } = checker();
let server;

function showError(message) {
  browser('eval', `void Promise.all([import('/js/state.mjs'), import('/js/app.mjs')]).then(([{ state }, { render }]) => { state.workflow.loading = false; state.workflow.data = { tasks: [], next: null, summary: {} }; state.workflow.error = ${JSON.stringify(message)}; render(); })`);
  browser('wait', '250');
}

try {
  server = await startServer(data);
  browser('open', `${server.url}?project=tidepool&view=plan`);
  browser('wait', '350');

  await check('other errors remain plain text', () => {
    showError('Could not verify <this task>.');
    assert.equal(evaluate(`document.querySelector('.plan-view .form-error')?.textContent`), 'Could not verify <this task>.');
    assert.equal(evaluate(`document.querySelector('.plan-view .form-error a') === null`), true);
  });

  await check('known page IDs in the exact acceptance error become report links', () => {
    showError('Pages are not accepted: home, book, unknown.');
    const links = evaluate(`[...document.querySelectorAll('.plan-view .form-error a')].map(link => ({ text: link.textContent, href: link.getAttribute('href') }))`);
    assert.deepEqual(links, [
      { text: 'Home (home)', href: '?project=tidepool&view=report&page=home' },
      { text: 'Book a lesson (book)', href: '?project=tidepool&view=report&page=book' },
    ]);
    assert.match(evaluate(`document.querySelector('.plan-view .form-error')?.textContent`), /unknown\./);
    browser('click', '.plan-view .form-error a');
    browser('wait', '350');
    assert.equal(evaluate(`document.querySelector('#selected-page-heading')?.textContent`), 'Home');
  });

  console.log(`\n${passed()} Plan error checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
}
