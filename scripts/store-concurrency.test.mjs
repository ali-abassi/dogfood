import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-concurrency-'));
mkdirSync(join(data, 'projects'));
copyFileSync(join(source, 'demo/projects/tidepool.json'), join(data, 'projects/tidepool.json'));
process.env.DOGFOOD_DATA = data;
const { createFinding, readProject, writeProject } = await import('../lib/store.mjs');
const pageId = readProject('tidepool').pages[0].id;
after(() => rmSync(data, { recursive: true, force: true }));

const writer = tag => new Promise((done, fail) => {
  const script = `const { createFinding } = await import(${JSON.stringify(join(source, 'lib/store.mjs'))});
for (let n = 0; n < 10; n += 1) createFinding('tidepool', ${JSON.stringify(pageId)}, { attachCapture: false, severity: 'P3', title: '${tag} concurrent finding ' + n, detail: 'Written by a concurrent process to prove no update is lost.' }, '${tag}');`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: 'inherit' });
  child.on('exit', code => (code === 0 ? done() : fail(new Error(`${tag} exited ${code}`))));
});

test('two processes writing findings at once lose none of them', async () => {
  const before = readProject('tidepool').pages[0].findings.length;
  await Promise.all([writer('a'), writer('b')]);
  const titles = readProject('tidepool').pages[0].findings.map(finding => finding.title);
  assert.equal(titles.length, before + 20);
  assert.equal(titles.filter(title => title.includes('concurrent finding')).length, 20);
});

test('a write from a stale read is refused instead of overwriting the newer project', () => {
  const stale = readProject('tidepool');
  createFinding('tidepool', pageId, { attachCapture: false, severity: 'P3', title: 'Newer finding that must survive', detail: 'Lands between the stale read and its write.' }, 'test');
  stale.name = 'Overwritten';
  assert.throws(() => writeProject(stale), error => error.status === 409 && error.code === 'STALE_PROJECT');
  const fresh = JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8'));
  assert.ok(fresh.pages[0].findings.some(finding => finding.title === 'Newer finding that must survive'));
});
