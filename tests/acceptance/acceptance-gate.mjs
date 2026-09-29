// The page report explains why an audit-complete page still cannot pass the acceptance gate.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-acceptance-view-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const { browser, evaluate } = browserSession('acceptance-view');
const { check, passed } = checker();
let server;

try {
  server = await startServer(data);
  browser('open', `${server.url}?project=tidepool&page=home&view=report`);
  browser('wait', '350');
  browser('eval', `void Promise.all([import('/js/state.mjs'), import('/js/app.mjs')]).then(([{ state }, { render }]) => {
    const page = state.project.pages.find(item => item.id === 'home');
    page.progress.complete = true;
    page.progress.accepted = false;
    page.progress.requirements = [{ id: 'audit', label: 'Audit', met: true, missing: '' }];
    page.progress.acceptanceRequirements = [
      { id: 'audit', label: 'Audit complete', met: true, missing: '' },
      { id: 'provenance', label: 'Declared checkout evidence', met: false, missing: 'The site is not declared to serve this checkout.' },
    ];
    render();
  })`);
  browser('wait', '350');

  await check('checked but unaccepted report names provenance as the missing gate requirement', () => {
    assert.equal(evaluate(`document.querySelector('[data-gate-status]')?.textContent`), 'Checked · Not accepted');
    assert.deepEqual(evaluate(`[...document.querySelectorAll('.page-gate-requirements li strong')].map(item => item.textContent)`), ['Declared checkout evidence']);
    assert.match(evaluate(`document.querySelector('.page-gate-requirements')?.textContent`), /not declared to serve this checkout/);
  });

  await check('the provenance explanation fits a phone viewport', () => {
    browser('set', 'viewport', '390', '844');
    assert.equal(evaluate(`document.documentElement.scrollWidth <= window.innerWidth + 1`), true);
  });

  console.log(`\n${passed()} acceptance gate checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
}
