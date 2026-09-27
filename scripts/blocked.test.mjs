import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-blocked-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { projectReport } = await import('../lib/report.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

const waiting = 'Waiting on the staging password from Ali.';
const progress = pageId => store.pageProgress(store.readProject('shop'), store.pageById(store.readProject('shop'), pageId));
const answer = (pageId, id) => progress(pageId).answers.find(item => item.id === id);

store.createProject({ id: 'shop', name: 'Shop', url: 'https://example.com' });
store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'reserve', name: 'Reserve a class' }] });

test('a blocked check reads Blocked with its reason, and does not complete the page', () => {
  store.recordVerdicts('shop', 'home', { checks: { design: { status: 'blocked', note: waiting } } }, 'agent:proof');
  assert.deepEqual([answer('home', 'design').status, answer('home', 'design').summary], ['blocked', waiting]);
  const design = progress('home').requirements.find(item => item.id === 'design');
  assert.equal(design.met, false);
  assert.equal(design.missing, waiting);
  assert.equal(progress('home').complete, false);
});

test('Needs work outranks Blocked, and Blocked outranks the rest', () => {
  store.recordVerdicts('shop', 'home', {
    checks: { purpose: { status: 'blocked', note: waiting } },
    features: [{ id: 'reserve', status: 'blocked', note: waiting }],
    audit: { security: [{ id: 'inputs', status: 'blocked', note: waiting }] },
  }, 'agent:proof');
  assert.equal(answer('home', 'purpose').status, 'blocked');
  assert.equal(answer('home', 'works').summary, 'Reserve a class is blocked.');
  assert.equal(answer('home', 'safety').summary, 'Blocked: Does the server check everything people type before it saves it?');
  store.recordVerdicts('shop', 'home', {
    checks: { design: { status: 'needs_work', note: 'The headline overlaps the photo on a phone.' } },
    audit: { scraping: [{ id: 'bulk', status: 'needs_work', note: 'Anyone can download the whole catalog.' }] },
  }, 'agent:proof');
  assert.equal(answer('home', 'design').status, 'needs_work');
  assert.equal(answer('home', 'safety').status, 'needs_work');
});

test('a blocked verdict needs a reason like any other verdict', () => {
  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { ease: { status: 'blocked', note: 'Too short' } } }, 'agent:proof'), /12/);
  assert.throws(() => store.recordVerdicts('shop', 'home', { checks: { ease: { status: 'waiting', note: waiting } } }, 'agent:proof'), /invalid status/);
});

test('the report names Blocked answers with their reason', () => {
  const report = projectReport('shop');
  assert.match(report, /\| Blocked \|/);
  assert.ok(report.includes(`Home, Clear purpose: ${waiting}`));
});
