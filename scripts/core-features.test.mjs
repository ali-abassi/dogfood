import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { runInNewContext } from 'node:vm';

const data = mkdtempSync(join(tmpdir(), 'dogfood-core-'));
const checkout = join(data, 'repo');
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { designGuide, projectDocs } = await import('../lib/project-docs.mjs');
const { markdownMarkup, escapeHtml } = await import('../public/js/format.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

store.createProject({ id: 'shop', name: 'Shop', url: 'https://example.com' });
store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'reserve', name: 'Reserve a class' }] });
store.registerPage('shop', { id: 'cart', name: 'Cart', group: 'Public', route: '/cart', features: [{ id: 'pay', name: 'Pay' }] });

const booking = { id: 'booking', name: 'Booking', summary: 'Reserve and pay for a class.', pageIds: ['home', 'cart'] };
const view = () => store.projectView(store.readProject('shop'));

test('core features are saved in order and start not checked', () => {
  store.setCoreFeatures('shop', [booking, { id: 'browse', name: 'Browse classes', pageIds: ['home'] }], 'agent:proof');
  assert.deepEqual(view().coreFeatures.map(({ id, status }) => [id, status]), [['booking', 'untested'], ['browse', 'untested']]);
});

test('a page needing work makes every core feature on it need work', () => {
  store.recordVerdicts('shop', 'cart', { checks: { design: { status: 'needs_work', note: 'The pay button overlaps the total.' } } }, 'agent:proof');
  const status = Object.fromEntries(view().coreFeatures.map(({ id, status: value }) => [id, value]));
  assert.equal(status.booking, 'needs_work');
  assert.notEqual(status.browse, 'needs_work');
});

test('core features must name real pages, at least one, with unique ids', () => {
  assert.throws(() => store.setCoreFeatures('shop', [{ ...booking, pageIds: ['nope'] }], 'agent:proof'), /page nope/);
  assert.throws(() => store.setCoreFeatures('shop', [{ ...booking, pageIds: [] }], 'agent:proof'), /at least one page/);
  assert.throws(() => store.setCoreFeatures('shop', [booking, booking], 'agent:proof'), /unique/);
});

test('docs read vision, design and plan from the checkout, case-insensitively, and say when one is missing', () => {
  mkdirSync(checkout, { recursive: true });
  writeFileSync(join(checkout, 'vision.md'), '# Vision\n');
  writeFileSync(join(checkout, 'DESIGN.md'), '# Design\n');
  store.createProject({ id: 'docs', name: 'Docs', url: 'https://example.com', checkout });
  const docs = projectDocs(store.readProject('docs'));
  assert.equal(docs.checkout, true);
  assert.equal(docs.intent, null);
  assert.deepEqual([docs.vision.file, docs.design.file, docs.plan], ['vision.md', 'DESIGN.md', null]);
  writeFileSync(join(checkout, 'plans.md'), '# Plan\n');
  assert.equal(projectDocs(store.readProject('docs')).plan.file, 'plans.md');
  assert.equal(projectDocs(store.readProject('shop')).checkout, false);
  assert.equal(projectDocs(store.readProject('shop')).intent, null);
});

test('markdown renders structure and escapes everything else', () => {
  const html = markdownMarkup('# Title\n\n- **one** item\n- [site](https://example.com)\n\n<script>alert(1)</script> [bad](javascript:alert(1))');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<li class="depth-0"><strong>one<\/strong> item<\/li>/);
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.doesNotMatch(html, /<script>|href="javascript/);
  assert.match(html, /&lt;script&gt;/);
});

test('the design.html brand guide wins over design.md and is served as its own page', () => {
  writeFileSync(join(checkout, 'design.html'), '<h1>Guide</h1>');
  const docs = projectDocs(store.readProject('docs'));
  assert.deepEqual([docs.design.file, docs.design.html], ['design.html', '<h1>Guide</h1>']);
  assert.equal(designGuide(store.readProject('docs')), '<h1>Guide</h1>');
  assert.throws(() => designGuide(store.readProject('shop')), /no design.html/);
});

test('docs include current working drafts even when origin/main has older documents', () => {
  const repo = join(data, 'gitrepo');
  mkdirSync(repo, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
  git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'Test');
  writeFileSync(join(repo, 'vision.md'), '# Shipped vision\n');
  git('add', 'vision.md'); git('commit', '-qm', 'vision'); git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  writeFileSync(join(repo, 'vision.md'), '# Local edit\n');
  store.createProject({ id: 'gitdocs', name: 'Git docs', url: 'https://example.com', checkout: repo });
  assert.equal(projectDocs(store.readProject('gitdocs')).vision.markdown, '# Local edit\n');
});

test('without plan.md, the plan is the newest dated file in docs/plans', () => {
  const repo = join(data, 'plansrepo');
  mkdirSync(join(repo, 'docs', 'plans'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'plans', '2026-09-01-first.md'), '# First\n');
  writeFileSync(join(repo, 'docs', 'plans', '2026-09-28-production-ready.md'), '# Production ready\n');
  store.createProject({ id: 'plans', name: 'Plans', url: 'https://example.com', checkout: repo });
  assert.deepEqual(projectDocs(store.readProject('plans')).plan, { file: 'docs/plans/2026-09-28-production-ready.md', markdown: '# Production ready\n' });
  writeFileSync(join(repo, 'plan.md'), '# Plan\n');
  assert.equal(projectDocs(store.readProject('plans')).plan.file, 'plan.md');
});

test('a project\'s scans can move to another signed-in Chrome profile', () => {
  assert.equal(store.setBrowserProfile('shop', 'Default').source.browserProfile, 'Default');
  assert.equal(store.readProject('shop').source.browserProfile, 'Default');
  assert.throws(() => store.setBrowserProfile('shop', ''), /Browser profile/);
});


test('optional intent is read case-insensitively from the working checkout', () => {
  writeFileSync(join(checkout, 'INTENT.md'), '# Working intent\nPreserve this current boundary.\n');
  assert.deepEqual(projectDocs(store.readProject('docs')).intent, { file: 'INTENT.md', markdown: '# Working intent\nPreserve this current boundary.\n' });
});

function documentView(data) {
  const state = { project: { id: 'docs', name: 'Docs' }, view: 'vision', docs: { data: { checkout: true, ref: 'checkout', ...data }, loading: false, error: '' } };
  const context = { state, markdownMarkup, escapeHtml };
  // Run the view without the application's DOM startup; use the real renderer and view source.
  const source = readFileSync(new URL('../public/js/views/docs.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  runInNewContext(source, context);
  return context.docsMarkup();
}

test('Vision presents optional intent openly with its filename and unique section anchors', () => {
  const html = documentView({ vision: { file: 'vision.md', markdown: '# Vision\n## Outcome\nPurpose.' }, intent: { file: 'INTENT.md', markdown: '# Intent\n## Outcome\nCurrent work.\n## Limits\nBoundary.\n## Proof\nEvidence.' } });
  assert.match(html, /href="#working-intent"/);
  assert.match(html, /<h2 id="working-intent-heading">Working intent<\/h2>/);
  assert.match(html, /Working checkout · <span>INTENT.md<\/span>/);
  assert.match(html, /id="doc-vision-section-1"/);
  assert.match(html, /<h3 id="doc-intent-section-1">Outcome/);
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  assert.doesNotMatch(html, /<details/);
});

test('documents render local file references plainly while preserving safe web links and escaping', () => {
  const html = documentView({ vision: { file: 'vision.md', markdown: '# Vision\nRead [current outcome](intent.md), [plan.md](plan.md), [evidence](docs/proof.md#checks), and [vendor](https://example.com/docs).\n\n<img src=x onerror=alert(1)> [bad](javascript:alert(1))' } });
  assert.match(html, /current outcome \(<code>intent.md<\/code>\)/);
  assert.match(html, /evidence \(<code>docs\/proof.md#checks<\/code>\)/);
  assert.match(html, /href="https:\/\/example.com\/docs"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /href="(?:intent|plan|docs|javascript)|<img|working-intent/);
  const example = documentView({ vision: { file: 'vision.md', markdown: '# Vision\n```md\n[example](intent.md)\n```' } });
  assert.match(example, /<pre><code>\[example\]\(intent.md\)<\/code><\/pre>/);
});
