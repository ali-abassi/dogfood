import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
const data = mkdtempSync(join(tmpdir(), 'dogfood-native-test-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const { checkoutRevision } = await import('../lib/revision.mjs');
const { visualContract, reviewContractStale } = await import('../lib/visual-contract.mjs');
after(() => rmSync(data, { recursive: true, force: true }));
const note = 'Observed directly in the owned test fixture; explicit synthetic evidence only.';
function chunk(type, body) {
  const length = Buffer.alloc(4); length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, crc]);
}
function fixturePng(seed = 0) {
  const header = Buffer.alloc(13); header.writeUInt32BE(40, 0); header.writeUInt32BE(80, 4); header.set([8, 2], 8);
  const pixels = Array.from({ length: 80 }, (_, y) => Buffer.from([0, ...Array.from({ length: 120 }, (_, x) => (x + y + seed) % 37 * 6)]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(pixels))), chunk('IEND', Buffer.alloc(0))]);
}
const file = join(data, 'fixture.png'); writeFileSync(file, fixturePng());
const artifactFile = join(data, 'app-executable'); writeFileSync(artifactFile, 'owned synthetic compiled artifact');
const artifactSha256 = createHash('sha256').update(readFileSync(artifactFile)).digest('hex');
function checkout(id) {
  const directory = join(data, `${id}-checkout`); mkdirSync(directory);
  execFileSync('git', ['init', '-q', directory]); writeFileSync(join(directory, 'source.swift'), 'struct App {}');
  execFileSync('git', ['-C', directory, 'add', '.']);
  execFileSync('git', ['-C', directory, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture']);
  return directory;
}
function setup(id, source = { platform: 'ios', bundleId: 'com.example.Native' }) {
  const directory = checkout(id);
  store.createProject({ id, name: id, checkout: directory, ...source });
  store.registerPage(id, { id: 'home', name: 'Home', route: '/home', group: 'Core', features: [{ id: 'open', name: 'Open screen' }] });
  return directory;
}
function inputFor(directory) {
  const sourceFingerprint = checkoutRevision(directory).fingerprint;
  return { file, sourceUrl: 'ios://com.example.Native/home', actor: 'Synthetic fixture operator', sourceFingerprint,
    app: { bundleId: 'com.example.Native', version: '1.0', build: '7' }, device: { simulatorUDID: '12345678-1234-1234-1234-123456789012', name: 'iPhone test fixture', os: 'iOS test fixture' },
    build: { sourceProof: 'matched', sourceFingerprint, artifactFile, artifactSha256, note },
    checks: { launch: { status: 'pass', note, milliseconds: 120 }, accessibility: { status: 'pass', note }, logs: { status: 'pass', note } } };
}
function page(id) { return store.projectView(store.readProject(id)).pages[0]; }
function verdicts(id) {
  const current = page(id);
  const audit = Object.fromEntries(Object.entries(current.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))]));
  store.recordVerdicts(id, 'home', { checks: { design: { status: 'pass', note }, purpose: { status: 'pass', note }, ease: { status: 'pass', note } }, features: [{ id: 'open', status: 'pass', note }], audit }, 'Synthetic fixture operator');
}
function requirement(id, key) { return page(id).progress.requirements.find(item => item.id === key); }

test('native workflow needs one mobile capture and verified native check, with no fabricated web facts', () => {
  const directory = setup('native'); store.recordNativeCheck('native', 'home', inputFor(directory)); verdicts('native');
  const current = page('native');
  assert.deepEqual(current.requiredDevices, ['mobile']); assert.equal(current.captures.desktop.state, 'blocked');
  assert.equal(current.scan, null); assert.deepEqual(current.measuredAnswers, []);
  assert.equal(current.progress.complete, true); assert.equal(current.progress.accepted, true);
  assert.deepEqual(visualContract(store.readProject('native'), current).coverage, { reviewedDevices: ['mobile'], notReviewedDevices: [], complete: true });
  assert.equal(current.progress.answers.find(answer => answer.id === 'speed').name, 'Launch timing');
  const checked = execFileSync(process.execPath, ['scripts/check-projects.mjs'], { env: { ...process.env, DOGFOOD_DATA: data }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(checked, /native: 1 pages, 1 with complete QA/);
});
test('unknown installed build source cannot pass the native check or acceptance', () => {
  const directory = setup('unknown'); const input = inputFor(directory); input.build = { sourceProof: 'unknown', note };
  store.recordNativeCheck('unknown', 'home', input); verdicts('unknown');
  assert.equal(requirement('unknown', 'capture').met, true); assert.equal(requirement('unknown', 'scan').met, false);
  assert.equal(page('unknown').progress.accepted, false);
});
test('native missing manual timing, accessibility and logs remain untested', () => {
  const directory = setup('missing-checks'); const input = inputFor(directory); delete input.checks;
  store.recordNativeCheck('missing-checks', 'home', input); verdicts('missing-checks');
  const answers = page('missing-checks').progress.answers;
  assert.equal(answers.find(answer => answer.id === 'speed').status, 'untested');
  assert.notEqual(answers.find(answer => answer.id === 'ease').status, 'pass');
  assert.notEqual(answers.find(answer => answer.id === 'works').status, 'pass');
});
test('native rejects another bundle, screen, source fingerprint or executable bytes', () => {
  const directory = setup('mismatches'); const input = inputFor(directory);
  assert.throws(() => store.recordNativeCheck('mismatches', 'home', { ...input, sourceUrl: 'ios://com.other.Native/home' }), /declared iOS bundle/);
  assert.throws(() => store.recordNativeCheck('mismatches', 'home', { ...input, sourceUrl: 'ios://com.example.Native/other' }), /screen identity/);
  assert.throws(() => store.recordNativeCheck('mismatches', 'home', { ...input, sourceFingerprint: 'a'.repeat(64) }), /checkout changed/);
  assert.throws(() => store.recordNativeCheck('mismatches', 'home', { ...input, build: { ...input.build, artifactSha256: 'b'.repeat(64) } }), /executable bytes/);
});
function tamperedNative(id, change) {
  const project = store.readProject(id); change(project.pages[0]); store.writeProject(project);
  assert.equal(page(id).progress.accepted, false);
}
test('native device, screenshot receipt and actual PNG bytes are bound to the check', () => {
  const directory = setup('tamper'); const input = inputFor(directory);
  store.recordNativeCheck('tamper', 'home', input); verdicts('tamper');
  tamperedNative('tamper', current => { current.captures.mobile.native.device.name = 'Wrong phone'; });
  store.recordNativeCheck('tamper', 'home', input); verdicts('tamper');
  tamperedNative('tamper', current => { current.captures.mobile.sha256 = 'a'.repeat(64); });
  store.recordNativeCheck('tamper', 'home', input); verdicts('tamper');
  const target = join(data, page('tamper').captures.mobile.path); writeFileSync(target, 'tampered');
  assert.equal(page('tamper').progress.accepted, false);
});
test('native rejects HTTP captures and scans and bundle profile changes stale proof', () => {
  const directory = setup('profile'); store.recordNativeCheck('profile', 'home', inputFor(directory)); verdicts('profile');
  assert.throws(() => store.recordCapture('profile', 'home', {}), /Device|recordNativeCheck/);
  assert.throws(() => store.recordScan('profile', 'home', {}), /native check/);
  store.configureProject('profile', { source: { bundleId: 'com.example.ChangedNative' } }, 'Fixture operator');
  assert.equal(requirement('profile', 'scan').met, false); assert.equal(page('profile').progress.accepted, false);
});
function facts() { return { loadMs: 100, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false, seo: { title: 'Fixture', description: 'Fixture', canonical: null, robots: null, lang: 'en', h1Count: 1 }, accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {} }; }
function desktopScan() { return { sourceUrl: 'http://127.0.0.1:9999/home', actor: 'Fixture browser', tier: 'automated', desktop: { file, viewport: '1440 × 900', facts: facts() } }; }
test('default responsive web still needs both; explicit desktop web measures only desktop', () => {
  setup('responsive', { url: 'http://127.0.0.1:9999' });
  assert.throws(() => store.recordScan('responsive', 'home', desktopScan()), /facts|viewport|load time/i);
  setup('desktop', { platform: 'web', captureDevices: ['desktop'], url: 'http://127.0.0.1:9999' });
  store.recordScan('desktop', 'home', desktopScan()); verdicts('desktop');
  const current = page('desktop'); assert.equal(current.progress.accepted, true);
  assert.deepEqual(Object.keys(current.scan.viewports), ['desktop']); assert.equal(current.captures.mobile.state, 'blocked');
  assert.match(current.progress.answers.find(answer => answer.id === 'speed').summary, /computer/);
  assert.doesNotMatch(current.progress.answers.find(answer => answer.id === 'speed').summary, /phone/);
  store.configureProject('desktop', { source: { captureDevices: ['desktop', 'mobile'] } }, 'Fixture operator');
  assert.equal(requirement('desktop', 'capture').met, false); assert.equal(requirement('desktop', 'scan').met, false);
});
test('configure validates strictly and preserves unrelated metadata and all QA history', () => {
  const before = store.readProject('native'); before.external = { preserved: true }; store.writeProject(before);
  store.configureProject('native', { name: 'Native project', description: 'Updated context' }, 'Fixture operator');
  const after = store.readProject('native'); assert.deepEqual(after.external, before.external); assert.deepEqual(after.pages, before.pages);
  assert.throws(() => store.configureProject('native', { source: { captureDevices: ['desktop'] } }, 'Fixture operator'), /iOS requires/);
  assert.throws(() => store.configureProject('native', { source: { captureDevices: ['mobile', 'mobile'] } }, 'Fixture operator'), /duplicate/);
  assert.throws(() => store.configureProject('native', { source: { platform: 'android' } }, 'Fixture operator'), /Platform/);
  assert.throws(() => store.configureProject('native', { source: { checkout: join(data, 'missing-checkout') } }, 'Fixture operator'), /existing directory/);
  assert.throws(() => store.configureProject('native', { unknown: true }, 'Fixture operator'), /unsupported/);
});

test('native findings and pins retain the actual mobile screenshot through replacement history', () => {
  const directory = setup('native-pins'); const input = inputFor(directory);
  store.recordNativeCheck('native-pins', 'home', input);
  const original = page('native-pins').captures.mobile;
  store.createFinding('native-pins', 'home', { severity: 'P2', title: 'Native fixture feedback', detail: note, attachCapture: true, annotation: { device: 'mobile', x: 0.3, y: 0.4, captureSha256: original.sha256 } }, 'person');
  const finding = page('native-pins').findings[0];
  assert.equal(finding.evidence, original.path.slice(1));
  const snapshot = readFileSync(join(data, finding.annotation.capture.path));
  assert.deepEqual(snapshot, readFileSync(file));
  const replacement = join(data, 'replacement.png'); writeFileSync(replacement, fixturePng(3));
  store.recordNativeCheck('native-pins', 'home', { ...input, file: replacement });
  assert.notEqual(page('native-pins').captures.mobile.sha256, original.sha256);
  assert.deepEqual(readFileSync(join(data, finding.annotation.capture.path)), snapshot);
});
function nativeAnalysis() {
  return { pagePurpose: 'Owned native fixture screen', primaryAction: 'Open the fixture screen', dimensions: Object.fromEntries(['design', 'purpose', 'ease'].map(key => [key, { score: 8, reason: 'The mobile screen has clear readable hierarchy.' }])), evidence: [{ location: 'mobile top', observation: 'Visible screen title.' }, { location: 'mobile middle', observation: 'Visible primary action.' }], improvements: ['Give the title more breathing room.'], suggestedFeatures: [] };
}
test('optional native AI review sends only its mobile frame and app/device context using a stub provider', async () => {
  const directory = setup('native-visual'); store.recordNativeCheck('native-visual', 'home', inputFor(directory));
  const { runVisualReview } = await import('../lib/visual-review.mjs');
  const previous = { fetch: globalThis.fetch, key: process.env.DEEPSEEK_API_KEY }; let outbound;
  process.env.DEEPSEEK_API_KEY = 'owned-fixture-key';
  globalThis.fetch = async (_url, options) => { outbound = JSON.parse(options.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(nativeAnalysis()) } }] }), { status: 200 }); };
  try {
    const project = store.readProject('native-visual'); const result = await runVisualReview(data, project, project.pages[0]);
    assert.equal(result.review.coverage.complete, true); assert.equal(result.review.captures.desktop, null);
    const content = outbound.messages[0].content; assert.equal(content.length, 3);
    assert.match(content[0].text, /com.example.Native/); assert.match(content[0].text, /iPhone test fixture/);
    assert.equal(content[1].text, 'Native iOS device screenshot:');
  } finally { globalThis.fetch = previous.fetch; restoreProviderKey(previous.key); }
});
function restoreProviderKey(key) {
  if (key === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = key;
}

test('web capture input cannot smuggle an iOS source URL through internal native fields', () => {
  store.createProject({ id: 'web-url-boundary', name: 'Web URL boundary', url: 'https://example.com' });
  store.registerPage('web-url-boundary', { id: 'home', name: 'Home', group: 'Core', route: '/' });
  const input = { file, device: 'desktop', viewport: '1440 x 900', actor: 'Synthetic fixture', fullPage: true, tier: 'real', sourceUrl: 'ios://com.example.Native/home', nativeSourceUrl: 'ios://com.example.Native/home' };
  assert.throws(() => store.recordCapture('web-url-boundary', 'home', input), /HTTP/);
});

test('configure refuses recognized native worker context without changing the source contract', () => {
  const before = store.readProject('native'); const previous = process.env.DOGFOOD_NATIVE_REQUEST;
  process.env.DOGFOOD_NATIVE_REQUEST = 'owned-fixture-native-worker';
  try { assert.throws(() => store.configureProject('native', { source: { captureDevices: ['desktop'] } }, 'agent:worker'), error => error.status === 403); }
  finally { restoreNativeRequest(previous); }
  assert.deepEqual(store.readProject('native'), before);
});
function restoreNativeRequest(value) {
  if (value === undefined) delete process.env.DOGFOOD_NATIVE_REQUEST;
  else process.env.DOGFOOD_NATIVE_REQUEST = value;
}
test('malformed historical native build receipts remain unaccepted without crashing page views', () => {
  const project = store.readProject('native'); const original = project.pages[0].nativeCheck.build;
  project.pages[0].nativeCheck.build = null; store.writeProject(project);
  assert.equal(page('native').progress.accepted, false);
  const restored = store.readProject('native'); restored.pages[0].nativeCheck.build = original; store.writeProject(restored);
});
test('configure also refuses a registered native request checkout with no forwarded worker flag', () => {
  const workerCheckout = join(data, 'registered-worker'); mkdirSync(workerCheckout);
  mkdirSync(join(data, 'agent-board'), { recursive: true });
  writeFileSync(join(data, 'agent-board', 'native.json'), JSON.stringify({ projectId: 'native', cards: [{ checkout: workerCheckout }] }));
  const moduleUrl = new URL('../lib/store.mjs', import.meta.url).href;
  const script = `import {configureProject} from ${JSON.stringify(moduleUrl)};try{configureProject('native',{name:'Unauthorized rename'},'agent:worker');process.stdout.write('allowed')}catch(error){process.stdout.write(String(error.status))}`;
  const env = { ...process.env, DOGFOOD_DATA: data }; delete env.DOGFOOD_NATIVE_REQUEST;
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: workerCheckout, env, encoding: 'utf8' });
  assert.equal(result, '403'); assert.equal(store.readProject('native').name, 'Native project');
});

test('historical companion web pages in iOS projects stay inspectable and unaccepted without rewriting their identity', () => {
  const directory = setup('hybrid-history', { platform: 'web', url: 'https://example.com' });
  const url = 'https://example.com/v/2/153?edition=english_rwwad&c=verse';
  store.setPageUrl('hybrid-history', 'home', url);
  store.recordCapture('hybrid-history', 'home', { file, device: 'desktop', sourceUrl: url, viewport: '1440 x 900', actor: 'Synthetic web fixture', tier: 'real', fullPage: true });
  store.createFinding('hybrid-history', 'home', { severity: 'P2', title: 'Historical web finding', detail: note, attachCapture: true }, 'person');
  const before = store.readProject('hybrid-history').pages[0];
  store.configureProject('hybrid-history', { source: { platform: 'ios', bundleId: 'com.example.Native', captureDevices: ['mobile'], url: null } }, 'person');
  const current = page('hybrid-history');
  assert.equal(current.platformSupport.supported, false); assert.equal(current.platformSupport.kind, 'historical-outside-profile');
  assert.equal(current.progress.accepted, false); assert.equal(current.progress.acceptanceRequirements.find(item => item.id === 'environment').met, false);
  assert.match(current.progress.acceptanceRequirements.find(item => item.id === 'environment').missing, /historical page.*outside the iOS/);
  assert.deepEqual(store.readProject('hybrid-history').pages[0], before);
  checkHistoricalManifest('hybrid-history');
  assert.throws(() => store.recordNativeCheck('hybrid-history', 'home', inputFor(directory)), /declared iOS bundle/);
});

test('native current check reports stale source instead of relying only on acceptance provenance', () => {
  const directory = setup('native-stale-source'); store.recordNativeCheck('native-stale-source', 'home', inputFor(directory)); verdicts('native-stale-source');
  assert.equal(requirement('native-stale-source', 'scan').met, true);
  writeFileSync(join(directory, 'source.swift'), 'struct ChangedApp {}');
  assert.equal(requirement('native-stale-source', 'scan').met, false); assert.equal(page('native-stale-source').progress.accepted, false);
});

function checkHistoricalManifest(id) {
  const isolated = mkdtempSync(join(tmpdir(), 'dogfood-historical-check-'));
  const project = store.readProject(id);
  mkdirSync(join(isolated, 'projects')); mkdirSync(join(isolated, 'captures', id), { recursive: true });
  writeFileSync(join(isolated, 'projects', `${id}.json`), JSON.stringify(project));
  const capture = project.pages[0].captures.desktop; writeFileSync(join(isolated, capture.path), readFileSync(join(data, capture.path)));
  try {
    const checked = execFileSync(process.execPath, ['scripts/check-projects.mjs'], { env: { ...process.env, DOGFOOD_DATA: isolated }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(checked, /1 pages, 0 with complete QA/);
  } finally { rmSync(isolated, { recursive: true, force: true }); }
}

test('iOS root routes without a real screen identity are rejected before any manifest write', () => {
  const before = store.readProject('native');
  assert.throws(() => store.registerPage('native', { id: 'invalid-root', name: 'Root', group: 'Core', route: '/' }), /screen identity/);
  assert.deepEqual(store.readProject('native'), before);
});
test('changing only a legacy environment label preserves accepted web evidence and source defaults', () => {
  setup('legacy-config', { url: 'http://127.0.0.1:9999' });
  store.recordScan('legacy-config', 'home', { ...desktopScan(), mobile: { file, viewport: '390 x 844', facts: facts() } }); verdicts('legacy-config');
  const legacy = store.readProject('legacy-config'); const current = legacy.pages[0];
  delete legacy.source.platform; delete legacy.source.captureDevices; delete current.scan.profileHash; delete current.scan.captureDevices;
  Object.values(current.audit).flat().forEach(row => { delete row.evidence.context.profileHash; });
  store.writeProject(legacy); assert.equal(page('legacy-config').progress.accepted, true);
  store.configureProject('legacy-config', { source: { environment: 'Local dev server' } }, 'person');
  assert.equal(page('legacy-config').progress.accepted, true);
  assert.equal(Object.hasOwn(store.readProject('legacy-config').source, 'captureDevices'), false);
});
test('changing web to iOS defaults to mobile without inheriting the old responsive profile', () => {
  const directory = setup('switch-default', { platform: 'web', captureDevices: ['desktop', 'mobile'], url: 'https://example.com' });
  store.configureProject('switch-default', { source: { platform: 'ios', bundleId: 'com.example.Native' } }, 'person');
  assert.deepEqual(page('switch-default').requiredDevices, ['mobile']);
  store.recordNativeCheck('switch-default', 'home', inputFor(directory));
  assert.equal(requirement('switch-default', 'scan').met, true);
});
test('missing matched-build executable returns a useful validation error', () => {
  const directory = setup('missing-artifact'); const input = inputFor(directory); input.build.artifactFile = join(data, 'not-an-executable');
  assert.throws(() => store.recordNativeCheck('missing-artifact', 'home', input), error => error.status === 400 && /existing readable file/.test(error.message));
});
test('legacy and default web visual contracts retain the v6 body and saved review hash', () => {
  const project = { id: 'legacy-visual', guidelines: ['Calm and clear.'], source: { url: 'https://example.com' } };
  const capture = { state: 'rendered', fullPage: true, sourceUrl: 'https://example.com/', environment: 'local', viewport: 'fixture viewport' };
  const current = { name: 'Home', route: '/', captures: { desktop: { ...capture }, mobile: { ...capture } } };
  const expected = historicalVisualContract();
  assert.equal(visualContract(project, current).hash, expected);
  assert.equal(reviewContractStale({ promptVersion: 'page-answers-v6', contract: { hash: expected } }, { project, page: current }), false);
  project.source.platform = 'web'; project.source.captureDevices = ['desktop', 'mobile'];
  assert.equal(visualContract(project, current).hash, expected);
});
function historicalVisualContract() {
  const device = { sourceUrl: 'https://example.com/', environment: 'local', viewport: 'fixture viewport' };
  const body = { promptVersion: 'page-answers-v6', schemaVersion: 2, guidelines: ['Calm and clear.'], brand: { status: 'not_supplied', reference: null },
    page: { name: 'Home', route: '/', audience: 'Audience not supplied.', question: 'Infer only what the screenshot shows; the intended screen question was not supplied.', primaryAction: 'Intended primary action not supplied.', features: [] },
    coverage: { reviewedDevices: ['desktop', 'mobile'], notReviewedDevices: [], complete: true }, captureContext: { desktop: device, mobile: device } };
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
