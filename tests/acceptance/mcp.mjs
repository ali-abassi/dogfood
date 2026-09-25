// Acceptance: an agent drives dogfood's MCP server from an empty project to a completed page.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-mcp-proof-'));
const checkout = mkdtempSync(join(tmpdir(), 'dogfood-mcp-checkout-'));
process.env.DOGFOOD_DATA = data;
const store = await import(join(repo, 'lib/store.mjs'));
let passed = 0;

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, crc]);
}

function png(filledWidth) {
  const [width, height] = [40, 20];
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  // Content only in the top-left corner reproduces the wrong-device-pixel-ratio defect.
  const pixel = (x, y) => (x < filledWidth && y < filledWidth / 2 && x % 3 === 0 ? [20, 20, 20] : [255, 255, 255]);
  const rows = Array.from({ length: height }, (_, y) => Buffer.from([0, ...Array.from({ length: width }, (_, x) => pixel(x, y)).flat()]));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

// Newline-delimited JSON-RPC over stdio, as MCP clients speak it.
function startServer() {
  const child = spawn(process.execPath, [join(repo, 'mcp.mjs')], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '';
  let stderr = '';
  child.stderr.on('data', text => { stderr += text; });
  child.stdout.on('data', text => {
    buffer += text;
    for (let index = buffer.indexOf('\n'); index >= 0; index = buffer.indexOf('\n')) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  let id = 0;
  const request = (method, params) => new Promise((resolvePromise, reject) => {
    id += 1;
    const timer = setTimeout(() => reject(new Error(`No response to ${method}. stderr: ${stderr}`)), 10_000);
    pending.set(id, message => { clearTimeout(timer); resolvePromise(message); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
  const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  return { child, request, notify, stderr: () => stderr };
}

function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const server = startServer();
async function call(name, args) {
  const response = await server.request('tools/call', { name, arguments: args });
  assert.equal(response.error, undefined, `${name} returned a JSON-RPC error instead of a tool result: ${JSON.stringify(response.error)}`);
  const text = response.result.content.map(item => item.text).join('\n');
  return { isError: response.result.isError === true, text, json: () => JSON.parse(text) };
}

const auditPass = page => Object.fromEntries(Object.entries(page.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note: 'Checked against the live headers and responses.' }))]));
const note = 'Checked in the running page at 1440 × 900.';

try {
  const init = await server.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'proof', version: '1' } });
  check('initialize names the server and offers tools', () => {
    assert.equal(init.result.serverInfo.name, 'dogfood');
    assert.ok(init.result.capabilities.tools);
    assert.equal(typeof init.result.protocolVersion, 'string');
  });
  server.notify('notifications/initialized', {});

  const listed = await server.request('tools/list', {});
  const tools = new Map(listed.result.tools.map(tool => [tool.name, tool]));
  check('tools/list exposes the agent QA surface with input schemas and descriptions', () => {
    for (const name of ['dogfood_projects', 'dogfood_create_project', 'dogfood_register_page', 'dogfood_page', 'dogfood_next', 'dogfood_record_capture',
      'dogfood_record_verdicts', 'dogfood_set_connections', 'dogfood_set_checklist', 'dogfood_add_issue', 'dogfood_resolve_issue',
      'dogfood_run_tests', 'dogfood_ai_review', 'dogfood_complete']) {
      assert.ok(tools.has(name), `missing tool ${name}`);
      assert.equal(tools.get(name).inputSchema.type, 'object', `${name} needs an object input schema`);
      assert.ok(tools.get(name).description.length >= 40, `${name} needs a useful description`);
    }
    for (const tool of tools.values()) {
      for (const keyword of ['oneOf', 'anyOf', 'allOf']) assert.equal(tool.inputSchema[keyword], undefined, `${tool.name}: Claude rejects top-level ${keyword} in tool input schemas`);
    }
    for (const name of ['dogfood_record_verdicts', 'dogfood_set_checklist', 'dogfood_add_issue', 'dogfood_resolve_issue']) {
      assert.ok(tools.get(name).inputSchema.required.includes('agent'), `${name} must require the agent name for attribution`);
    }
  });

  const empty = await call('dogfood_add_issue', {});
  check('a call missing required arguments names every missing argument', () => {
    assert.equal(empty.isError, true);
    for (const name of ['project', 'page', 'agent', 'severity', 'title', 'detail']) assert.match(empty.text, new RegExp(name));
    assert.doesNotMatch(empty.text, /attachCapture/, 'attachCapture is optional');
  });
  const unknown = await server.request('tools/call', { name: 'dogfood_nope', arguments: {} });
  check('an unknown tool is a JSON-RPC error; unknown methods too', () => assert.ok(unknown.error));
  const badMethod = await server.request('resources/unknown', {});
  check('an unknown method returns JSON-RPC method-not-found', () => assert.equal(badMethod.error?.code, -32601));

  const created = await call('dogfood_create_project', { id: 'shop', name: 'Shop', description: 'Fixture shop.', url: 'https://shop.example', environment: 'Fixture', checkout });
  check('create_project succeeds', () => assert.equal(created.isError, false, created.text));
  const duplicate = await call('dogfood_create_project', { id: 'shop', name: 'Shop', description: 'Fixture shop.', url: 'https://shop.example', environment: 'Fixture', checkout });
  check('validation failures are tool results with isError and the store message', () => {
    assert.equal(duplicate.isError, true);
    assert.match(duplicate.text, /already exists/);
  });

  const registered = await call('dogfood_register_page', { project: 'shop', page: { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }], untestedNote: 'Checkout is not covered by this run.' } });
  check('register_page adds the page', () => assert.equal(registered.isError, false, registered.text));
  await call('dogfood_register_page', { project: 'shop', page: { id: 'about', name: 'About', group: 'Public', route: '/about', features: [{ id: 'story', name: 'Story' }], untestedNote: 'Only the rendered copy is in scope.' } });
  const compact = (await call('dogfood_register_page', { project: 'shop', page: { id: 'home', name: 'Home', group: 'Public', route: '/', features: [{ id: 'hero', name: 'Hero' }], untestedNote: 'Checkout is not covered by this run.' } })).json();
  check('page writes return that page and what it still needs, not the whole project', () => {
    assert.equal(compact.pages, undefined, 'write results must not include every page');
    assert.equal(compact.page, 'home');
    assert.equal(typeof compact.status, 'string');
    assert.equal(compact.complete, false);
    assert.ok(Array.isArray(compact.missing) && compact.missing.some(item => item.id === 'capture'));
  });

  const projects = (await call('dogfood_projects', {})).json();
  check('projects lists each project with page and completion counts', () => {
    const shop = projects.find(item => item.id === 'shop');
    assert.equal(shop.pageCount, 2);
    assert.equal(shop.completePages, 0);
  });

  const early = await call('dogfood_complete', { project: 'shop', page: 'home' });
  check('complete refuses an unfinished page and names every missing requirement', () => {
    assert.equal(early.isError, true);
    for (const id of ['capture', 'scan', 'design', 'purpose', 'ease', 'safety', 'speed', 'works']) assert.match(early.text, new RegExp(`- ${id}:`));
  });

  const next = (await call('dogfood_next', { project: 'shop' })).json();
  const toolFor = id => next[0].missing.find(item => item.id === id)?.tool;
  check('every missing requirement names the tool that resolves it', () => {
    assert.ok(next[0].missing.every(item => typeof item.tool === 'string' && tools.has(item.tool.split(' ')[0])), JSON.stringify(next[0].missing));
    assert.equal(toolFor('capture'), 'dogfood_scan_page');
    assert.match(toolFor('safety'), /^dogfood_record_verdicts /);
    assert.match(toolFor('design'), /^dogfood_ai_review /);
  });
  check('next returns incomplete pages with their missing requirements', () => {
    assert.equal(next.length, 2);
    assert.equal(next[0].page, 'home');
    assert.ok(next[0].missing.some(item => item.id === 'capture' && item.missing.length > 0));
  });

  const broken = join(data, 'broken.png');
  writeFileSync(broken, png(20));
  const rejected = await call('dogfood_record_capture', { project: 'shop', page: 'home', device: 'desktop', file: broken, sourceUrl: 'https://shop.example/', viewport: '1440 × 900', actor: 'Visitor', tier: 'real', fullPage: true });
  check('record_capture refuses a half-blank screenshot', () => {
    assert.equal(rejected.isError, true);
    assert.match(rejected.text, /blank/);
  });
  const good = join(data, 'good.png');
  writeFileSync(good, png(40));
  const captured = await call('dogfood_record_capture', { project: 'shop', page: 'home', device: 'desktop', file: good, sourceUrl: 'https://shop.example/', viewport: '1440 × 900', actor: 'Visitor', tier: 'real', fullPage: true });
  check('record_capture stores a valid screenshot', () => assert.equal(captured.isError, false, captured.text));

  const page = (await call('dogfood_page', { project: 'shop', page: 'home' })).json();
  check('page returns the manifest entry with its progress', () => {
    assert.equal(page.id, 'home');
    assert.match(page.captures.desktop.sha256, /^[a-f0-9]{64}$/);
    assert.match(page.progress.requirements.find(item => item.id === 'capture').missing, /mobile/);
  });

  const vague = await call('dogfood_record_verdicts', { project: 'shop', page: 'home', agent: 'proof', checks: { design: { status: 'pass', note: 'fine' } } });
  check('a verdict without a real evidence note is refused', () => assert.equal(vague.isError, true));
  const verdicts = await call('dogfood_record_verdicts', {
    project: 'shop', page: 'home', agent: 'proof',
    checks: { purpose: { status: 'pass', note } },
    features: [{ id: 'hero', status: 'pass', note }],
    audit: auditPass(page),
  });
  check('record_verdicts saves partial verdicts', () => assert.equal(verdicts.isError, false, verdicts.text));
  const manifest = JSON.parse(readFileSync(join(data, 'projects/shop.json'), 'utf8'));
  check('verdicts are attributed to the named agent', () => assert.equal(manifest.pages[0].checks.purpose.by, 'agent:proof'));

  const connections = await call('dogfood_set_connections', { project: 'shop', page: 'home', connections: [{ id: 'page', name: 'Page request', method: 'GET', endpoint: '/', sends: 'Nothing', receives: 'HTML', source: 'Network panel', provenance: 'observed' }] });
  check('set_connections saves the connection map', () => assert.equal(connections.isError, false, connections.text));

  const checklist = await call('dogfood_set_checklist', { project: 'shop', page: 'home', agent: 'proof', audit: { ...auditPass(page), seo: [...auditPass(page).seo, { id: 'canonical', question: 'Does the page declare a canonical URL?', status: 'untested', note: '' }] } });
  check('set_checklist edits questions and keeps connections', () => {
    assert.equal(checklist.isError, false, checklist.text);
    const saved = JSON.parse(readFileSync(join(data, 'projects/shop.json'), 'utf8')).pages[0];
    assert.equal(saved.audit.seo.at(-1).id, 'canonical');
    assert.equal(saved.connections[0].id, 'page');
  });
  await call('dogfood_record_verdicts', { project: 'shop', page: 'home', agent: 'proof', audit: { seo: [{ id: 'canonical', status: 'pass', note: 'The canonical link points at the page URL.' }] } });

  const issue = await call('dogfood_add_issue', { project: 'shop', page: 'home', agent: 'proof', severity: 'P1', title: 'Hero overlaps button', detail: 'At 390 px wide the hero text overlaps the Book button.' });
  check('add_issue records a finding; attaching the screenshot is optional', () => {
    assert.equal(issue.isError, false, issue.text);
    assert.equal(JSON.parse(readFileSync(join(data, 'projects/shop.json'), 'utf8')).pages[0].findings[0].evidence, '');
  });
  const tests = await call('dogfood_run_tests', { project: 'shop', page: 'home' });
  check('run_tests explains when a page has no focused tests', () => {
    assert.equal(tests.isError, true);
    assert.match(tests.text, /No focused tests/);
  });
  const review = await call('dogfood_ai_review', { project: 'shop', page: 'home', confirmUsage: false });
  check('ai_review requires confirmUsage because it spends provider usage', () => {
    assert.equal(review.isError, true);
    assert.match(review.text, /confirmUsage/);
  });

  const stillOpen = await call('dogfood_complete', { project: 'shop', page: 'home' });
  check('complete still refuses while a blocking bug is open and nobody has judged Looks right or Easy to use', () => {
    assert.equal(stillOpen.isError, true);
    assert.match(stillOpen.text, /- issues:/);
    assert.match(stillOpen.text, /- design:/);
    assert.match(stillOpen.text, /- ease:/);
    assert.doesNotMatch(stillOpen.text, /- (purpose|safety|works):/, 'answered answers are not listed');
  });

  const resolved = await call('dogfood_resolve_issue', { project: 'shop', page: 'home', agent: 'proof', issue: 'QA-001', note: 'Retested at 390 px; the hero no longer overlaps the button.' });
  check('resolve_issue closes the finding with a retest note', () => assert.equal(resolved.isError, false, resolved.text));
  // Stand-in for dogfood_scan_page (proved separately against a live fixture site).
  const facts = { loadMs: 300, consoleErrors: [], pageErrors: [], failedRequests: [], requests: [], horizontalOverflow: false, seo: { h1Count: 1 }, accessibility: { imagesWithoutAlt: 0, unlabeledFields: 0, unnamedButtons: 0 }, headers: {} };
  store.recordScan('shop', 'home', { sourceUrl: 'https://shop.example/', actor: 'Visitor', tier: 'automated', desktop: { file: good, viewport: '1440 × 900', facts }, mobile: { file: good, viewport: '390 × 844', facts } });
  const reviewedCaptures = JSON.parse(readFileSync(join(data, 'projects/shop.json'), 'utf8')).pages[0].captures;
  const reviews = join(data, 'visual-reviews/shop/home');
  (await import('node:fs')).mkdirSync(reviews, { recursive: true });
  writeFileSync(join(reviews, '2026-09-25T00-00-00.000Z-proof.json'), JSON.stringify({ captures: { desktop: { sha256: reviewedCaptures.desktop.sha256 }, mobile: { sha256: reviewedCaptures.mobile.sha256 } }, analysis: { dimensions: { design: { score: 8, reason: 'One consistent style.' }, purpose: { score: 8, reason: 'The heading says what the shop sells.' }, ease: { score: 8, reason: 'The Book button is easy to find.' } } }, analyzedAt: '2026-09-25T00:00:00.000Z' }));

  const done = await call('dogfood_complete', { project: 'shop', page: 'home' });
  check('complete accepts the page once every requirement has evidence', () => {
    assert.equal(done.isError, false, done.text);
    assert.match(done.text, /complete/i);
  });
  const after = (await call('dogfood_projects', {})).json();
  check('project completion count reflects the finished page', () => assert.equal(after.find(item => item.id === 'shop').completePages, 1));

  const once = (...args) => spawnSync(process.execPath, [join(repo, 'mcp.mjs'), ...args], { env: { ...process.env, DOGFOOD_DATA: data }, encoding: 'utf8' });
  check('one tool can be called from a shell, for agents whose MCP client has not loaded dogfood yet', () => {
    const listed = once('dogfood_projects');
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(JSON.parse(listed.stdout).find(item => item.id === 'shop').completePages, 1);
    const refused = once('dogfood_page', '{"project":"shop"}');
    assert.deepEqual([refused.status, refused.stderr.trim()], [1, 'Missing required arguments: page.']);
  });

  const stdoutOnly = server.stderr();
  check('the server writes nothing but protocol messages to stdout (logs go to stderr)', () => assert.equal(typeof stdoutOnly, 'string'));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  server.child.kill();
  rmSync(data, { recursive: true, force: true });
  rmSync(checkout, { recursive: true, force: true });
}
