// Task acceptance errors link only known pages to their report.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserSession, checker, repo, startServer } from '../harness.mjs';

const data = mkdtempSync(join(tmpdir(), 'dogfood-plan-errors-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
const secondProject = { ...JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8')), id: 'second-project', name: 'Second project' };
writeFileSync(join(data, 'projects/second-project.json'), JSON.stringify(secondProject));
const { browser, evaluate } = browserSession('plan-errors');
const { check, passed } = checker();
let server;

function showError(message) {
  browser('eval', `void Promise.all([import('/js/state.mjs'), import('/js/app.mjs')]).then(([{ state }, { render }]) => { state.workflow.loading = false; state.workflow.data = { tasks: [], next: null, summary: {} }; state.workflow.error = ${JSON.stringify(message)}; render(); })`);
  browser('wait', '250');
}

function rerender() {
  browser('eval', `void import('/js/app.mjs').then(({ render }) => render())`);
  browser('wait', '100');
  browser('snapshot', '-i');
}

function assertDraft(fields, busy, error = '') {
  assert.deepEqual(evaluate(`(() => { const values = new FormData(document.querySelector('#task-form')); return { ...Object.fromEntries(values), pageIds: values.getAll('pageIds'), releaseOwner: values.has('releaseOwner') }; })()`), fields);
  assert.equal(evaluate(`document.querySelector('#task-form').dataset.dirty`), 'true');
  assert.equal(evaluate(`document.querySelector('#task-form button[type="submit"]').disabled`), busy);
  assert.equal(evaluate(`document.querySelector('[data-action="cancel-task-form"]').disabled`), busy);
  assert.equal(evaluate(`document.querySelector('#task-form-error').textContent`), error);
  assert.equal(evaluate(`document.querySelector('#task-form-error').hidden`), !error);
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

  for (const width of [1280, 390]) {
    await check(`task save shows pending feedback and retains a retryable failed draft at ${width}`, () => {
      browser('set', 'viewport', String(width), '900');
      browser('open', `${server.url}?project=tidepool&view=plan`);
      browser('wait', '350');
      browser('snapshot', '-i');
      browser('click', '[data-action="add-task"]');
      browser('snapshot', '-i');
      const fields = { title: ` Retain the failed draft ${width} `, outcome: ' Keep every raw field.\nIncluding this line. ', checks: ' [ "node", "--version" ]\n\n', scope: ' public/js/views/plan.mjs \n  tests/acceptance/plan-errors.mjs  \n', look: ' Keep spaces, lines & <text>. ', pageIds: ['home', 'book'], releaseOwner: false };
      for (const name of ['title', 'outcome', 'checks', 'scope', 'look']) browser('fill', `#task-${name}`, fields[name]);
      browser('check', '#task-form input[name="pageIds"][value="home"]');
      browser('check', '#task-form input[name="pageIds"][value="book"]');
      rerender();
      assertDraft(fields, false);
      browser('eval', `window.nativeFetch=window.fetch;window.fetch=(url,options)=>options?.method==='POST' && /\\/tasks$/.test(url) ? new Promise(done=>{window.failPlanSave=()=>done(new Response(JSON.stringify({error:'Synthetic task save failure'}),{status:503,headers:{'Content-Type':'application/json'}}))}) : window.nativeFetch(url,options);true`);
      browser('scrollintoview', '#task-form button[type="submit"]');
      browser('snapshot', '-i');
      browser('click', '#task-form button[type="submit"]');
      browser('snapshot', '-i');
      rerender();
      assertDraft(fields, true);
      assert.equal(evaluate(`document.querySelector('#task-form button[type="submit"]').textContent`), 'Saving…');
      browser('eval', 'window.failPlanSave();true');
      browser('wait', '--fn', `document.querySelector('#task-form-error')?.textContent === 'Synthetic task save failure'`);
      rerender();
      assertDraft(fields, false, 'Synthetic task save failure');
      assert.equal(evaluate(`document.querySelector('#task-form button[type="submit"]').textContent`), 'Add task');
      browser('eval', `window.fetch=(url,options)=>options?.method==='POST' && /\\/tasks$/.test(url) ? new Promise((done,reject)=>{window.completePlanRetry=()=>window.nativeFetch(url,options).then(done,reject)}) : window.nativeFetch(url,options);true`);
      browser('scrollintoview', '#task-form button[type="submit"]');
      browser('snapshot', '-i');
      browser('click', '#task-form button[type="submit"]');
      browser('snapshot', '-i');
      rerender();
      assertDraft(fields, true);
      assert.equal(evaluate(`document.querySelector('#task-form button[type="submit"]').textContent`), 'Saving…');
      browser('eval', 'window.fetch=window.nativeFetch;window.completePlanRetry();true');
      browser('wait', '--fn', `document.querySelector('#task-form') === null`);
      browser('snapshot', '-i');
      const taskId = evaluate(`document.querySelector('[data-selected-task]').dataset.selectedTask`);
      browser('eval', `window.savedPlanWorkflow=null;void window.nativeFetch('/api/projects/tidepool/workflow').then(response=>response.json()).then(data=>{window.savedPlanWorkflow=data});true`);
      browser('wait', '--fn', 'window.savedPlanWorkflow !== null');
      const saved = evaluate('window.savedPlanWorkflow').tasks.find(task => task.id === taskId);
      assert.equal(saved.title, fields.title.trim());
      assert.deepEqual(saved.pageIds, fields.pageIds);
      browser('eval', `void import('/js/state.mjs').then(({ state }) => { window.savedWorkflow = { draft: state.workflow.draft, error: state.workflow.formError }; })`);
      browser('wait', '--fn', 'window.savedWorkflow !== undefined');
      assert.deepEqual(evaluate('window.savedWorkflow'), { draft: null, error: '' });

      browser('click', '[data-action="task-claim"]');
      browser('wait', '--fn', `document.querySelector('[data-action="task-verify"]') !== null`);
      browser('snapshot', '-i');
      browser('click', '[data-action="edit-task"]');
      browser('snapshot', '-i');
      browser('select', '#task-status', 'blocked');
      browser('fill', '#task-blocker', ' Awaiting review. ');
      browser('fill', '#task-handoff', ' Preserve this handoff.\nAnd its spacing. ');
      browser('check', '#task-form input[name="releaseOwner"]');
      browser('uncheck', '#task-form input[name="pageIds"][value="book"]');
      const edited = { title: saved.title, outcome: saved.outcome, checks: '["node","--version"]', scope: saved.scope.join('\n'), look: saved.look, pageIds: ['home'], status: 'blocked', blocker: ' Awaiting review. ', handoff: ' Preserve this handoff.\nAnd its spacing. ', releaseOwner: true };
      rerender();
      assertDraft(edited, false);
      assert.deepEqual(evaluate(`[...document.querySelector('#task-status').options].map(option => option.value)`), ['doing', 'todo', 'blocked']);
      browser('click', '[data-action="cancel-task-form"]');
      browser('snapshot', '-i');
      browser('click', '[data-action="discard-changes"]');
      browser('snapshot', '-i');
      browser('click', '[data-action="add-task"]');
      assert.equal(evaluate(`document.querySelector('#task-title').value`), '');
      assert.equal(evaluate(`document.querySelector('#task-form-error').hidden`), true);
      assert.equal(evaluate(`document.querySelector('#task-form').dataset.dirty`), 'false');
      browser('fill', '#task-title', 'Clear the draft on project switch');
      browser('fill', '#task-outcome', 'Keep drafts scoped to their project.');
      browser('fill', '#task-checks', 'invalid check');
      browser('scrollintoview', '#task-form button[type="submit"]');
      browser('click', '#task-form button[type="submit"]');
      browser('wait', '--fn', `document.querySelector('#task-form-error')?.hidden === false`);
      rerender();
      assert.match(evaluate(`document.querySelector('#task-form-error').textContent`), /JSON array/);
      const otherProject = evaluate(`[...document.querySelector('#project-select').options].find(option => option.value !== 'tidepool').value`);
      browser('eval', `void import('/js/app.mjs').then(({ loadProject }) => loadProject(${JSON.stringify(otherProject)})).then(() => import('/js/state.mjs')).then(({ state }) => { window.switchedWorkflow = { draft: state.workflow.draft, error: state.workflow.formError }; })`);
      browser('wait', '--fn', 'window.switchedWorkflow !== undefined');
      browser('snapshot', '-i');
      assert.deepEqual(evaluate('window.switchedWorkflow'), { draft: null, error: '' });
    });
  }

  console.log(`\n${passed()} Plan error checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed()} passing checks:`, error);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* already closed */ }
  server?.stop();
  rmSync(data, { recursive: true, force: true });
}
