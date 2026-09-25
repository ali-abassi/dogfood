// Acceptance: the AI review reads both screenshots and suggests features, which people add from
// the app and agents add over MCP. Uses a fake model provider; never calls the real one.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
let passed = 0;
function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const suggestions = [
  { name: 'Pick a swimmer age group', expected: 'Choosing a class filters the times to that age group.' },
  { name: 'class picker', expected: 'Duplicate of an existing feature and must not be offered.' },
  { name: 'Reserve a time slot', expected: 'Choosing a time and pressing Reserve confirms the booking.' },
];
const analysis = {
  pagePurpose: 'Book a swimming lesson.',
  primaryAction: 'Reserve lesson.',
  dimensions: {
    purpose: { score: 8, reason: 'The heading names the task on both screens.' },
    nextAction: { score: 7.5, reason: 'Reserve is visible on desktop; on mobile it sits below the fold.' },
    hierarchy: { score: 7, reason: 'The slot grid dominates.' },
    copy: { score: 9, reason: 'Labels are specific.' },
  },
  evidence: [
    { location: 'desktop top', observation: 'The heading says Book a lesson.' },
    { location: 'mobile middle', observation: 'The navigation is cut off at the right edge.' },
  ],
  improvements: ['Keep the navigation inside the phone width.'],
  suggestedFeatures: suggestions,
};

const data = mkdtempSync(join(tmpdir(), 'dogfood-ai2-'));
cpSync(join(repo, 'demo'), data, { recursive: true });
// The suite seeds its own AI reviews; the demo's real ones would otherwise be newer.
rmSync(join(data, 'visual-reviews'), { recursive: true, force: true });
const manifestFile = join(data, 'projects/tidepool.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
const book = manifest.pages.find(item => item.id === 'book');
const home = manifest.pages.find(item => item.id === 'home');
home.captures.mobile = { state: 'blocked', reason: 'Not captured yet.' };
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

try {
  const { latestVisualReview, runVisualReview, validateAnalysis } = await import(join(repo, 'lib/visual-review.mjs'));
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'fixture-key';
  const outbound = [];
  globalThis.fetch = async (_url, options) => {
    outbound.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: 'fixture', model: 'google/gemini-3.8-flash', choices: [{ message: { content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 900, completion_tokens: 300, cost: 0.002 } }), { status: 200 });
  };
  let bothResult;
  let desktopOnly;
  try {
    bothResult = await runVisualReview(data, manifest, book);
    desktopOnly = await runVisualReview(data, manifest, home);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
  }
  const images = body => body.messages[0].content.filter(part => part.type === 'image_url');
  check('the review sends the desktop and the mobile screenshot', () => {
    assert.equal(images(outbound[0]).length, 2);
    assert.match(JSON.stringify(outbound[0].messages[0].content.filter(part => part.type === 'text')), /mobile/i);
  });
  check('a page without a mobile screenshot is reviewed from desktop alone', () => assert.equal(images(outbound[1]).length, 1));
  check('the review asks for suggested features in its response schema', () => {
    const schema = outbound[0].response_format.json_schema.schema;
    assert.ok(schema.properties.suggestedFeatures, 'suggestedFeatures in schema');
    assert.ok(schema.required.includes('suggestedFeatures'));
  });
  check('the saved review records both screenshots and the v2 prompt', () => {
    const { review } = bothResult;
    assert.equal(review.promptVersion, 'visual-clarity-v2');
    assert.equal(review.captures.desktop.sha256, book.captures.desktop.sha256);
    assert.equal(review.captures.mobile.sha256, book.captures.mobile.sha256);
    assert.equal(desktopOnly.review.captures.mobile, null);
    assert.equal(review.analysis.suggestedFeatures.length, 3);
    assert.deepEqual(review.analysis.suggestedFeatures[0], suggestions[0]);
  });
  check('a review is current only while both screenshots are unchanged', () => {
    assert.equal(latestVisualReview(data, 'tidepool', 'book', book.captures).stale, false);
    const changedMobile = { ...book.captures, mobile: { ...book.captures.mobile, sha256: 'f'.repeat(64) } };
    assert.equal(latestVisualReview(data, 'tidepool', 'book', changedMobile).stale, true);
    assert.equal(latestVisualReview(data, 'tidepool', 'home', home.captures).stale, false);
  });
  check('suggested features are validated', () => {
    assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: Array.from({ length: 9 }, (_, index) => ({ name: `F${index}`, expected: 'Works.' })) }));
    assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: [{ name: '', expected: 'Works.' }] }));
  });
  const legacy = join(data, 'visual-reviews/tidepool/classes');
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, '2026-09-24T00-00-00.000Z-old.json'), JSON.stringify({ promptVersion: 'visual-clarity-v1', capture: { sha256: 'a'.repeat(64) }, analysis }));
  check('a review saved before mobile screenshots existed does not count', () => {
    const classes = manifest.pages.find(item => item.id === 'classes');
    assert.equal(latestVisualReview(data, 'tidepool', 'classes', classes.captures).review, null);
  });

  const port = await new Promise(done => { const probe = createServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => done(free)); }); });
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });
  const session = `dogfood-ai2-proof-${process.pid}`;
  const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
  const page = expression => { const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim()); return typeof value === 'string' ? JSON.parse(value) : value; };
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
      await new Promise(done => setTimeout(done, 100));
    }
    const current = await (await fetch(`${url}/api/projects/tidepool/pages/book/visual-review`)).json();
    check('the review API returns the suggestions for current screenshots', () => {
      assert.equal(current.stale, false);
      assert.equal(current.review.analysis.suggestedFeatures.length, 3);
    });
    const project = await (await fetch(`${url}/api/projects/tidepool`)).json();
    check('a current v2 review meets the AI review requirement', () => {
      assert.equal(project.pages.find(item => item.id === 'book').progress.requirements.find(item => item.id === 'ai-review').met, true);
    });
    const foreign = await fetch(`${url}/api/projects/tidepool/pages/book/features`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ features: [suggestions[2]] }) });
    check('the add-features API refuses cross-origin requests', () => assert.equal(foreign.status, 403));

    browser('open', url);
    browser('set', 'viewport', '1440', '900');
    browser('wait', '700');
    page(`(document.querySelector('[data-page="book"]').click(), true)`);
    browser('wait', '500');
    page(`(document.querySelector('[data-view="capture"]').click(), true)`);
    browser('wait', '1200');
    const offered = page(`[...document.querySelectorAll('section[aria-label="Suggested features"] input[name="suggested-feature"]')].map(input => ({ checked: input.checked, text: input.closest('label').textContent }))`);
    check('See page offers the suggested features that are not listed yet, checked by default', () => {
      assert.equal(offered.length, 2, JSON.stringify(offered));
      assert.ok(offered.every(item => item.checked));
      assert.ok(offered[0].text.includes('Pick a swimmer age group'));
      assert.ok(offered[0].text.includes('filters the times'), 'shows the expected behavior');
      assert.ok(!offered.some(item => /class picker/i.test(item.text)));
    });
    page(`(() => { const boxes = document.querySelectorAll('section[aria-label="Suggested features"] input[name="suggested-feature"]'); boxes[1].checked = false; document.querySelector('button[data-action="add-suggested-features"]').click(); return true; })()`);
    browser('wait', '1000');
    const saved = JSON.parse(readFileSync(manifestFile, 'utf8')).pages.find(item => item.id === 'book').features;
    check('adding keeps only the checked suggestions, with expected behavior, attributed to you', () => {
      const added = saved.find(item => item.name === 'Pick a swimmer age group');
      assert.ok(added);
      assert.equal(added.expected, suggestions[0].expected);
      assert.equal(added.addedBy, 'person');
      assert.ok(!saved.some(item => item.name === 'Reserve a time slot'));
    });
    page(`(document.querySelector('[data-view="review"]').click(), true)`);
    browser('wait', '500');
    check('the added feature appears in My review', () => {
      assert.ok(page(`document.querySelector('section[aria-label="Page review"]').textContent`).includes('Pick a swimmer age group'));
    });
    const errors = browser('errors').trim();
    check('no page errors were thrown', () => assert.ok(!/error/i.test(errors) || /no errors/i.test(errors), errors));
  } finally {
    try { browser('close'); } catch { /* closed */ }
    server.kill();
  }

  const child = spawn(process.execPath, [join(repo, 'mcp.mjs')], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', text => { output += text; });
  const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'dogfood_add_features', arguments: { project: 'tidepool', page: 'book', agent: 'proof', features: [suggestions[2]] } } });
  for (let waited = 0; waited < 10_000 && !output.includes('"id":3'); waited += 100) await new Promise(done => setTimeout(done, 100));
  child.kill();
  const replies = Object.fromEntries(output.trim().split('\n').map(line => JSON.parse(line)).map(message => [message.id, message]));
  check('agents can add features with dogfood_add_features, attributed to them', () => {
    const tool = replies[2].result.tools.find(item => item.name === 'dogfood_add_features');
    assert.ok(tool?.inputSchema.required.includes('agent'));
    assert.notEqual(replies[3].result.isError, true, replies[3].result.content?.[0]?.text);
    assert.equal(JSON.parse(replies[3].result.content[0].text).page, 'book');
    const added = JSON.parse(readFileSync(manifestFile, 'utf8')).pages.find(item => item.id === 'book').features.find(item => item.name === 'Reserve a time slot');
    assert.equal(added.addedBy, 'agent:proof');
  });
  check('the AI review tool tells agents it returns suggested features', () => {
    assert.match(replies[2].result.tools.find(item => item.name === 'dogfood_ai_review').description, /suggest/i);
  });
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  rmSync(data, { recursive: true, force: true });
}
