import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-start-project-'));
process.env.DOGFOOD_DATA = data;
const { startProject } = await import('../lib/new-project.mjs');
const { projectReadiness } = await import('../lib/project-readiness.mjs');
const { initProject } = await import('../lib/project-init.mjs');
const { readProject } = await import('../lib/store.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

test('a new idea gets an isolated committed managed workspace and an unready discovery brief', () => {
  const result = startProject({ name: 'Trail Notes', idea: 'Record short trail observations and find them again.' }, 'person');
  assert.equal(result.view, 'discovery');assert.match(result.project, /^trail-notes-/);
  assert.ok(!relative(join(data, 'workspaces'), result.checkout).startsWith('..'));
  assert.ok(existsSync(join(result.checkout, '.git')));
  assert.match(execFileSync('git', ['-C', result.checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }), /^[a-f0-9]{40}\n$/);
  assert.equal(execFileSync('git', ['-C', result.checkout, 'status', '--short'], { encoding: 'utf8' }), '');
  const brief = projectReadiness(result.project);
  assert.equal(brief.mode, 'new');assert.equal(brief.ready, false);assert.equal(brief.reviewed, false);
  assert.equal(brief.answers.idea, 'Record short trail observations and find them again.');
  assert.equal(readProject(result.project).source.url, null);
  assert.equal(readProject(result.project).source.checkout, realpathSync(result.checkout));
});

test('repeated names create distinct workspaces and do not overwrite earlier material', () => {
  const first = startProject({ name: 'Same Name', idea: 'One independent idea for an audit fixture.' });
  writeFileSync(join(first.checkout, 'vision.md'), 'Existing first-project decisions.\n');
  const second = startProject({ name: 'Same Name', idea: 'Another independent idea for an audit fixture.' });
  assert.notEqual(first.project, second.project);assert.notEqual(first.checkout, second.checkout);
  assert.equal(readFileSync(join(first.checkout, 'vision.md'), 'utf8'), 'Existing first-project decisions.\n');
});

test('existing project import preserves its documents and is explicitly labeled existing', () => {
  const checkout = join(data, 'existing');mkdirSync(checkout);
  writeFileSync(join(checkout, 'vision.md'), '# Existing Vision\nPreserve this user decision.\n');
  const before = readFileSync(join(checkout, 'vision.md'));
  const project = initProject({ id: 'existing', name: 'Existing application', checkout });
  assert.ok(project);
  const readiness = projectReadiness('existing');
  assert.equal(readiness.mode, 'existing');assert.equal(readiness.imported, true);
  assert.deepEqual(readFileSync(join(checkout, 'vision.md')), before);
});

test('new-project input cannot choose arbitrary paths, commands or insufficient names', () => {
  assert.throws(() => startProject({ name: 'Valid Name', idea: 'An adequately described idea.', checkout: '/tmp' }), /Only a project name and idea/);
  assert.throws(() => startProject({ name: 'x', idea: 'An adequately described idea.' }), /Project name/);
  assert.throws(() => startProject({ name: 'Valid Name', idea: 'x' }), /Idea/);
});
