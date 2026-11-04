import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-qa-queue-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { qaWorkQueue, requestPageReview, qaWorkQueueTools, qaWorkQueueRoutes } = await import('../lib/qa-work-queue.mjs');
const { agentBoard, createAgentCard } = await import('../lib/agent-board.mjs');
after(() => rmSync(data, { recursive: true, force: true }));
store.createProject({ id: 'queue', name: 'QA queue', url: 'http://127.0.0.1:8181', environment: 'Local fixture' });
const register = (id, features = [{ id: 'save', name: 'Save changes', expected: 'The saved value survives reload.' }]) => store.registerPage('queue', { id, name: `Page ${id}`, group: "Public", route: `/${id}`, features });
const only = id => qaWorkQueue('queue', id).pages[0];

test('queue exposes exact missing gate checks and keeps blocked behavior unverified', () => {
  register('home');
  store.recordVerdicts('queue', 'home', { features: [{ id: 'save', status: 'blocked', note: 'The required local account fixture is not available.' }] }, 'test');
  const current = only('home');
  const actual = store.projectView(store.readProject('queue')).pages[0];
  assert.deepEqual(current.missingChecks, actual.progress.requirements.filter(row => !row.met));
  assert.equal(current.missingCount, current.missingChecks.length);
  assert.ok(current.missingChecks.some(row => row.id === 'feature:save'));
  assert.equal(current.features[0].status, 'blocked');
  assert.equal(current.features[0].expected, 'The saved value survives reload.');
  assert.equal(current.accepted, false);
  assert.equal(current.complete, false);
  assert.equal(current.request, null);
});

test('saving a full review includes finding detail, expectations and source without starting or changing QA', () => {
  store.createFinding('queue', 'home', { severity: 'P1', title: 'Saving loses the entered value', detail: 'Enter a value, save it, then reload. The previous value is shown.', attachCapture: false }, 'test');
  const before = readFileSync(join(data, 'projects/queue.json'), 'utf8');
  const result = requestPageReview('queue', 'home', { backend: 'claude' });
  assert.equal(result.reused, false);
  assert.equal(result.request.intent, 'qa');
  assert.equal(result.request.backend, 'claude');
  assert.equal(result.request.status, 'todo');
  assert.equal(result.request.queued, false);
  assert.equal(result.request.checkout, '');
  assert.match(result.request.request, /The saved value survives reload/);
  assert.match(result.request.request, /Enter a value, save it, then reload/);
  assert.match(result.request.request, /precise blocker and leave it incomplete/);
  assert.match(result.request.request, /dogfood_complete/);
  assert.match(result.request.request, /checkoutFingerprint/);
  assert.equal(readFileSync(join(data, 'projects/queue.json'), 'utf8'), before);
  assert.equal(only('home').request.id, result.request.id);
  const repeat = requestPageReview('queue', 'home', { backend: 'codex' });
  assert.equal(repeat.reused, true);
  assert.equal(repeat.request.id, result.request.id);
  assert.equal(agentBoard('queue').cards.length, 1);
});

test('closed requests do not prevent a fresh review of outstanding scope', () => {
  const path = join(data, 'agent-board/queue.json');
  const document = JSON.parse(readFileSync(path, 'utf8'));
  document.cards[0].status = 'done';
  writeFileSync(path, JSON.stringify(document));
  assert.equal(only('home').request, null);
  const next = requestPageReview('queue', 'home');
  assert.equal(next.reused, false);
  assert.notEqual(next.request.id, document.cards[0].id);
});

test('an oversized review contract points to an exact complete read instead of sampling or truncating', () => {
  const features = Array.from({ length: 30 }, (_, index) => ({ id: `feature-${index}`, name: `Behavior ${index}`, expected: `Check behavior ${index}: ${'the expected outcome must survive reload and recovery. '.repeat(5)}` }));
  register('large', features);
  const result = requestPageReview('queue', 'large');
  assert.ok(result.request.request.length <= 10_000);
  assert.match(result.request.request, /exceeds the inline brief limit/);
  assert.match(result.request.request, /No requirement is waived or sampled/);
  assert.match(result.request.request, /"project":"queue","page":"large"/);
  const full = qaWorkQueueTools[0].run({ project: 'queue', page: 'large' });
  assert.deepEqual(full.pages[0].features.map(feature => feature.expected), features.map(feature => feature.expected.trim()));
  assert.ok(full.pages[0].missingChecks.some(row => row.id === 'feature:feature-29'));
});

function createFromProcess(page) {
  const source = `import { requestPageReview } from ${JSON.stringify(new URL('../lib/qa-work-queue.mjs', import.meta.url).href)}; console.log(requestPageReview('queue',${JSON.stringify(page)}).request.id);`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', source], { env: process.env });
    let output = '', errors = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors)));
  });
}

test('concurrent retries save exactly one request', async () => {
  register('concurrent');
  const ids = await Promise.all(Array.from({ length: 5 }, () => createFromProcess('concurrent')));
  assert.equal(new Set(ids).size, 1);
  assert.equal(agentBoard('queue').cards.filter(card => card.pageId === 'concurrent').length, 1);
});

test('a narrow existing QA conversation does not replace the full-page contract', () => {
  register('narrow');
  const old = createAgentCard('queue', { title: 'Review the heading', request: 'Only inspect the page heading wording.', intent: 'qa', pageId: 'narrow', backend: 'codex' });
  assert.equal(only('narrow').request, null);
  const full = requestPageReview('queue', 'narrow');
  assert.equal(full.reused, false);
  assert.notEqual(full.request.id, old.id);
  assert.equal(requestPageReview('queue', 'narrow').request.id, full.request.id);
});

test('tool and route boundaries refuse starting, unknown pages, and invalid agents', async () => {
  assert.throws(() => requestPageReview('queue', '../wrong'), /page does not exist/);
  assert.throws(() => requestPageReview('queue', 'home', { start: true }), /always saved without starting/);
  assert.throws(() => requestPageReview('queue', 'home', { backend: 'shell' }), /Choose Codex/);
  const routes = qaWorkQueueRoutes(async body => body);
  const result = await routes[1][2](['queue', 'home'], { backend: 'claude' });
  assert.equal(result.reused, true);
  assert.equal(result.request.queued, false);
  assert.deepEqual(qaWorkQueueTools.map(tool => tool.name), ['dogfood_qa_work_queue', 'dogfood_request_page_review']);
});
