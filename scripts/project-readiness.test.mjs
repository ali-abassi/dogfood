import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = mkdtempSync(join(tmpdir(), 'dogfood-readiness-'));
process.env.DOGFOOD_DATA = join(directory, 'data');
const { initProject } = await import('../lib/project-init.mjs');
const { projectReadiness, saveProjectBrief, reviewProjectScope, assertBuildReady, createReadinessDocuments, saveScopeBaseline } = await import('../lib/project-readiness.mjs');
const { registerPage } = await import('../lib/store.mjs');
const { addTask } = await import('../lib/tasks.mjs');
const { createAgentCard } = await import('../lib/agent-board.mjs');
const { projectMap } = await import('../lib/project-map.mjs');
after(() => rmSync(directory, { recursive: true, force: true }));
function fixture(id) {
  const checkout = join(directory, id); mkdirSync(checkout);
  writeFileSync(join(checkout, 'README.md'), '# Fictional readiness fixture\n');
  writeFileSync(join(checkout, '.gitignore'), 'graphify-out/\n');
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Fixture');
  initProject({ id, name: 'Fictional readiness fixture', checkout });
  return { checkout, git };
}
const completeAnswers = { idea: 'A small appointment booking tool.', audience: 'A visitor who needs a confirmed booking.', problem: 'Messages lose the agreed date and time.', success: 'A persisted confirmed booking.', journey: 'Select date, confirm, return to view the booking.', constraints: 'A local fixture only; no payments.', exclusions: 'No billing or team accounts.', risks: 'Invalid dates and interrupted saves must recover.', proof: 'Native persistence check plus actual desktop and phone confirmation.' };
const pages = [{ id: 'booking', name: 'Booking', route: '/booking', features: [{ id: 'confirm', name: 'Confirm a booking', expected: 'The booking survives a reload.' }] }];
function save(id, input) { return saveProjectBrief(id, { expectedRevision: projectReadiness(id).revision, ...input }, 'fixture'); }
function review(id) { const data = projectReadiness(id); return reviewProjectScope(id, { expectedRevision: data.revision, contractHash: data.contractHash }, 'person'); }

test('existing projects stay usable but are explicitly not discovery-certified', () => {
  fixture('existing'); const data = assertBuildReady('existing');
  assert.equal(data.imported, true); assert.equal(data.ready, true); assert.equal(data.reviewed, false);
  assert.match(data.label, /not certified/);
});

test('new projects require actual documents, complete scope and resolved material questions before an attributed review', () => {
  const { checkout } = fixture('new-project');
  let data = save('new-project', { mode: 'new', answers: completeAnswers, pages, questions: [{ id: 'billing', text: 'Does this version charge?', material: true, status: 'open' }] });
  assert.equal(data.ready, false); assert.throws(() => assertBuildReady('new-project'), /before the first build/);
  assert.throws(() => review('new-project'), /Resolve/);
  data = createReadinessDocuments('new-project', { expectedRevision: data.revision }, 'person');
  assert.equal(data.documents.vision.present, true); assert.equal(data.documents.plan.present, true);
  const original = readFileSync(join(checkout, 'vision.md'), 'utf8');
  createReadinessDocuments('new-project', { expectedRevision: data.revision }, 'person');
  assert.equal(readFileSync(join(checkout, 'vision.md'), 'utf8'), original);
  data = save('new-project', { questions: [{ id: 'billing', text: 'Does this version charge?', material: true, status: 'answered', answer: 'No billing in this version.' }], decisions: ['Exclude billing because confirmation is the first complete outcome.'] });
  assert.equal(data.ready, false); assert.equal(data.stage, 'scope_review');
  const reviewed = review('new-project'); assert.equal(reviewed.scopeReady, true); assert.equal(reviewed.ready, false); assert.equal(reviewed.review.by, 'person');
  assert.equal(reviewed.stage, 'baseline');
  const baseline = saveScopeBaseline('new-project', { expectedRevision: reviewed.revision, contractHash: reviewed.contractHash }, 'person');
  assert.equal(baseline.ready, true);
  assert.equal(baseline.baselineReceipt.files.length, 2);
  assert.equal(assertBuildReady('new-project').reviewed, true);
  appendFileSync(join(checkout, 'README.md'), '\nOrdinary ongoing implementation work.\n');
  assert.equal(projectReadiness('new-project').scopeReady, true);
  assert.equal(projectReadiness('new-project').ready, true);
  execFileSync('git', ['-C', checkout, 'add', '--', 'README.md']);
  writeFileSync(join(checkout, '.DS_Store'), 'Unrelated untracked fixture file.');
  assert.equal(assertBuildReady('new-project').ready, true);
  assert.equal(projectReadiness('new-project').scopeReady, true);
  assert.equal(projectReadiness('new-project').baseline.clean, false);
  assert.throws(() => save('new-project', { mode: 'existing' }), /cannot bypass/);
  appendFileSync(join(checkout, 'vision.md'), '\nThe agreed scope changed.\n');
  assert.equal(projectReadiness('new-project').scopeReady, false);
  assert.equal(projectReadiness('new-project').ready, false);
  assert.throws(() => assertBuildReady('new-project'), /needs review/);
});

test('optimistic saves and document contract hashes reject stale writers or stale reviews', () => {
  fixture('concurrency');
  const first = save('concurrency', { mode: 'new', answers: completeAnswers, pages });
  const next = save('concurrency', { answers: { ...completeAnswers, proof: 'Updated native and browser checks.' } });
  assert.throws(() => saveProjectBrief('concurrency', { expectedRevision: first.revision, answers: completeAnswers }, 'other'), /changed/);
  assert.notEqual(next.revision, first.revision);
  const withDocs = createReadinessDocuments('concurrency', { expectedRevision: next.revision }, 'person');
  assert.throws(() => reviewProjectScope('concurrency', { expectedRevision: withDocs.revision, contractHash: first.contractHash }, 'person'), /documents or scope changed/);
  const decision = save('concurrency', { decisions: ['Use the smallest complete flow.'] });
  const repeated = save('concurrency', { decisions: ['Use the smallest complete flow.'] });
  assert.equal(repeated.revision, decision.revision); assert.deepEqual(repeated.decisions, decision.decisions);
});

test('source documents cannot escape checkout through symlinks and document creation never overwrites them', () => {
  const { checkout } = fixture('symlink'); const outside = join(directory, 'outside.md');
  writeFileSync(outside, 'Private material outside the registered checkout.');
  symlinkSync(outside, join(checkout, 'vision.md'));
  const brief = save('symlink', { mode: 'new', answers: completeAnswers, pages });
  assert.equal(brief.documents.vision.present, false);
  const created = createReadinessDocuments('symlink', { expectedRevision: brief.revision }, 'person');
  assert.equal(created.createdDocuments.find(item => item.file === 'vision.md').created, false);
  assert.equal(readFileSync(outside, 'utf8'), 'Private material outside the registered checkout.');
  assert.throws(() => review('symlink'), /vision.md/);
});

test('the product map uses actual links and bounded explicit task scope; stale graphs are not current evidence', () => {
  const { checkout, git } = fixture('map');
  save('map', { mode: 'existing', answers: completeAnswers, pages });
  registerPage('map', { id: 'booking', name: 'Booking', group: 'App', route: '/booking', features: [{ id: 'confirm', name: 'Confirm a booking', expected: 'The booking survives a reload.' }], untestedNote: 'Fixture only; no provider is called.' });
  addTask('map', { id: 'booking-task', title: 'Persist a booking', outcome: 'A confirmed booking survives reload.', scope: ['src/booking'], pageIds: ['booking'], look: 'Confirmation is readable at both widths.', checks: [{ id: 'check', command: ['node', '-e', 'process.exit(0)'] }] }, 'fixture');
  createAgentCard('map', { title: 'Implement booking confirmation', request: 'Only this fictional scope.', backend: 'codex', pageId: 'booking', taskId: 'booking-task', start: false });
  mkdirSync(join(checkout, 'graphify-out'));
  writeFileSync(join(checkout, 'graphify-out', 'graph.json'), JSON.stringify({ built_at_commit: git('rev-parse', 'HEAD'), nodes: [{ source_file: 'src/booking/store.mjs' }, { source_file: '../secret.mjs' }, { source_file: 'src/unrelated.mjs' }] }));
  let map = projectMap('map');
  assert.equal(map.graphify.status, 'current'); assert.equal(map.pages.length, 1);
  assert.equal(map.pages[0].tasks[0].id, 'booking-task'); assert.equal(map.pages[0].requests.length, 1);
  assert.deepEqual(map.pages[0].code.map(item => item.file), ['src/booking/store.mjs']);
  assert.equal(map.pages[0].evidence.accepted, false);
  appendFileSync(join(checkout, 'README.md'), '\nChanged source\n');
  map = projectMap('map'); assert.equal(map.graphify.status, 'stale'); assert.match(map.graphify.message, /historical/);
  save('map', { pages: [{ ...pages[0], features: [{ ...pages[0].features[0], expected: 'The confirmation also sends a receipt.' }] }] });
  map = projectMap('map'); assert.equal(map.pages[0].status, 'scope_changed'); assert.equal(map.pages[0].features[0].expectationChanged, true);
  writeFileSync(join(checkout, 'graphify-out', 'graph.json'), '{bad');
  assert.equal(projectMap('map').graphify.status, 'unavailable');
});

test('scope baseline refuses unrelated, staged and modified unmanaged documents without committing other work', () => {
  const { checkout, git } = fixture('baseline-safety');
  let data = save('baseline-safety', { mode: 'new', answers: completeAnswers, pages });
  data = createReadinessDocuments('baseline-safety', { expectedRevision: data.revision }, 'person');
  data = review('baseline-safety');
  const apply = () => saveScopeBaseline('baseline-safety', { expectedRevision: data.revision, contractHash: data.contractHash }, 'person');
  const before = git('rev-parse', 'HEAD');
  writeFileSync(join(checkout, 'other.txt'), 'Unrelated work must remain untouched.');
  assert.throws(apply, /other source changes/); assert.equal(git('rev-parse', 'HEAD'), before); assert.equal(git('diff', '--cached', '--name-only'), '');
  rmSync(join(checkout, 'other.txt'));
  git('add', '--', 'vision.md');
  assert.throws(apply, /staged changes/); assert.equal(git('rev-parse', 'HEAD'), before); assert.equal(git('diff', '--cached', '--name-only'), 'vision.md');
  git('restore', '--staged', '--', 'vision.md');
  appendFileSync(join(checkout, 'vision.md'), '\nA user changed this draft.\n');
  data = review('baseline-safety');
  assert.throws(apply, /unchanged vision.md draft/); assert.equal(git('rev-parse', 'HEAD'), before);
  assert.match(readFileSync(join(checkout, 'vision.md'), 'utf8'), /user changed/);
});

test('a mixed baseline skips an unchanged committed document and commits only the remaining managed draft', () => {
  const { checkout, git } = fixture('mixed-baseline');
  const originalVision = '# Existing Vision\n\nA committed project vision already approved for this fixture.\n';
  writeFileSync(join(checkout, 'vision.md'), originalVision);
  git('add', '--', 'vision.md');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'Existing vision');
  let data = save('mixed-baseline', { mode: 'new', answers: completeAnswers, pages });
  data = createReadinessDocuments('mixed-baseline', { expectedRevision: data.revision }, 'person');
  assert.equal(data.createdDocuments.find(item => item.file === 'vision.md').created, false);
  assert.equal(data.createdDocuments.find(item => item.file === 'plan.md').created, true);
  data = review('mixed-baseline');
  assert.equal(data.scopeReady, true); assert.equal(data.ready, false);
  data = saveScopeBaseline('mixed-baseline', { expectedRevision: data.revision, contractHash: data.contractHash }, 'person');
  assert.equal(data.ready, true); assert.deepEqual(data.baselineReceipt.files, ['plan.md']);
  assert.equal(git('show', 'HEAD:vision.md') + '\n', originalVision);
  assert.equal(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'), 'plan.md');
  assert.equal(git('status', '--short'), '');
  const baselineRevision = git('rev-parse', 'HEAD');
  appendFileSync(join(checkout, 'vision.md'), '\nUnmanaged vision edit after the baseline.\n');
  data = review('mixed-baseline');
  assert.throws(() => saveScopeBaseline('mixed-baseline', { expectedRevision: data.revision, contractHash: data.contractHash }, 'person'), /unchanged vision.md draft/);
  assert.equal(git('rev-parse', 'HEAD'), baselineRevision);
  assert.equal(git('diff', '--cached', '--name-only'), '');
});

test('native requests may save proposals but cannot create source documents, approve scope or commit a baseline', () => {
  const { checkout, git } = fixture('native-boundary');
  let data = save('native-boundary', { mode: 'new', answers: completeAnswers, pages });
  const before = git('rev-parse', 'HEAD');
  const oldNative = process.env.DOGFOOD_NATIVE_REQUEST, oldProject = process.env.DOGFOOD_PROJECT;
  try {
    process.env.DOGFOOD_NATIVE_REQUEST = '1';
    data = save('native-boundary', { decisions: ['Propose a local-only first version for operator review.'] });
    assert.equal(data.decisions[0].by, 'fixture');
    assert.throws(() => createReadinessDocuments('native-boundary', { expectedRevision: data.revision }, 'native'), /native request cannot write source/);
    assert.equal(existsSync(join(checkout, 'vision.md')), false); assert.equal(existsSync(join(checkout, 'plan.md')), false);
    assert.throws(() => reviewProjectScope('native-boundary', { expectedRevision: data.revision, contractHash: data.contractHash }, 'native'), /native request cannot approve/);
    assert.throws(() => saveScopeBaseline('native-boundary', { expectedRevision: data.revision, contractHash: data.contractHash }, 'native'), /native request cannot commit/);
    assert.equal(projectReadiness('native-boundary').reviewed, false); assert.equal(git('rev-parse', 'HEAD'), before);
    delete process.env.DOGFOOD_NATIVE_REQUEST;
    process.env.DOGFOOD_PROJECT = 'native-boundary';
    data = createReadinessDocuments('native-boundary', { expectedRevision: data.revision }, 'person');
    data = review('native-boundary');
    data = saveScopeBaseline('native-boundary', { expectedRevision: data.revision, contractHash: data.contractHash }, 'person');
    assert.equal(data.ready, true);
  } finally {
    if (oldNative === undefined) delete process.env.DOGFOOD_NATIVE_REQUEST; else process.env.DOGFOOD_NATIVE_REQUEST = oldNative;
    if (oldProject === undefined) delete process.env.DOGFOOD_PROJECT; else process.env.DOGFOOD_PROJECT = oldProject;
  }
});
