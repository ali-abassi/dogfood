// Acceptance: onboarding can also run the AI review so every page arrives with suggested
// features, only when asked, in-process with a fake model provider (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'dogfood-onboard-ai-'));
process.env.DOGFOOD_DATA = data;
process.env.OPENROUTER_API_KEY = 'fixture-key';
const { onboardProject } = await import(join(repo, 'lib/onboard.mjs'));
let passed = 0;
function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

const html = title => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="margin:0;font:16px system-ui"><nav aria-label="Main"><a href="/">Home</a> <a href="/pricing">Pricing</a></nav><main style="padding:24px"><h1>${title}</h1><p>${'Copy. '.repeat(80)}</p><button>Start</button></main></body></html>`;
const fixture = createServer((request, response) => {
  const titles = { '/': 'Home', '/pricing': 'Pricing' };
  const title = titles[new URL(request.url, 'http://fixture').pathname];
  if (!title) return response.writeHead(404).end('Not found');
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html(title));
});
await new Promise(done => fixture.listen(0, '127.0.0.1', done));
const site = `http://127.0.0.1:${fixture.address().port}`;

const analysis = {
  pagePurpose: 'A fixture page.', primaryAction: 'Start.',
  dimensions: Object.fromEntries(['purpose', 'nextAction', 'hierarchy', 'copy'].map(name => [name, { score: 7, reason: 'Visible on both screens.' }])),
  evidence: [{ location: 'desktop top', observation: 'A heading.' }, { location: 'mobile middle', observation: 'A button.' }],
  improvements: [],
  suggestedFeatures: [{ name: 'Start button', expected: 'Pressing Start begins the flow.' }],
};
const modelRequests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://openrouter.ai/')) return realFetch(url, options);
  modelRequests.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ id: 'fixture', model: 'google/gemini-3.8-flash', choices: [{ message: { content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 900, completion_tokens: 200, cost: 0.004 } }), { status: 200 });
};

const session = `dogfood-onboard-ai-proof-${process.pid}`;
const browser = (...args) => execFileSync('agent-browser', ['--session', session, ...args], { encoding: 'utf8', timeout: 60_000 });
function evaluate(expression) {
  const value = JSON.parse(browser('eval', `JSON.stringify(${expression})`).trim());
  return typeof value === 'string' ? JSON.parse(value) : value;
}
let server;
try {
  const asked = await onboardProject({ url: `${site}/`, name: 'With AI', aiReview: true });
  check('onboarding with the AI review reviews every scanned page', () => {
    assert.equal(asked.pageCount, 2);
    assert.equal(asked.reviewed, 2);
    assert.deepEqual(asked.reviewFailed, []);
    assert.equal(modelRequests.length, 2);
    assert.ok(modelRequests.every(body => body.messages[0].content.filter(part => part.type === 'image_url').length === 2), 'desktop and mobile');
  });
  check('each onboarded page has a saved review with suggested features', () => {
    for (const page of ['home', 'pricing']) {
      const directory = join(data, 'visual-reviews/with-ai', page);
      assert.ok(existsSync(directory), page);
      const review = JSON.parse(readFileSync(join(directory, readdirSync(directory).find(name => name.endsWith('.json'))), 'utf8'));
      assert.equal(review.analysis.suggestedFeatures[0].name, 'Start button');
    }
  });
  const quiet = await onboardProject({ url: `${site}/`, name: 'Without AI' });
  check('without the opt-in, onboarding never calls the model provider', () => {
    assert.equal(quiet.reviewed, 0);
    assert.equal(modelRequests.length, 2);
    assert.equal(existsSync(join(data, 'visual-reviews/without-ai')), false);
  });

  const port = await new Promise(done => { const probe = createNetServer(); probe.listen(0, '127.0.0.1', () => { const { port: free } = probe.address(); probe.close(() => done(free)); }); });
  const url = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: data }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await realFetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
    await new Promise(done => setTimeout(done, 100));
  }
  browser('open', url);
  browser('set', 'viewport', '1440', '900');
  browser('wait', '700');
  evaluate(`(document.querySelector('[data-action="add-project"]').click(), true)`);
  browser('wait', '400');
  check('Add project offers the AI review as an unchecked, priced opt-in', () => {
    assert.equal(evaluate(`document.querySelector('#add-project-form input[name="aiReview"]')?.checked`), false);
    assert.match(evaluate(`document.querySelector('#add-project-form input[name="aiReview"]').closest('label').textContent`), /half a cent|cost|\\$/i);
  });
  evaluate(`(() => {
    window.__calls = [];
    const polls = [{ status: 'running', phase: 'review', total: 2, scanned: 0, current: 'Home', projectId: null }, { status: 'done', total: 2, scanned: 2, current: null, projectId: 'with-ai', failed: [], reviewed: 2, reviewFailed: [] }];
    const real = window.fetch.bind(window);
    window.fetch = (input, options = {}) => {
      const path = new URL(String(input), location.href).pathname;
      const key = (options.method || 'GET') + ' ' + path;
      if (key === 'POST /api/onboard') { window.__calls.push(JSON.parse(options.body)); return Promise.resolve(new Response(JSON.stringify({ job: 'job-ai' }), { status: 202 })); }
      if (key === 'GET /api/jobs/job-ai') { window.__progress = document.querySelector('.onboarding-progress')?.textContent; return Promise.resolve(new Response(JSON.stringify(polls.shift()), { status: 200 })); }
      return real(input, options);
    };
    const form = document.querySelector('#add-project-form');
    form.querySelector('input[type="url"]').value = 'https://site.example/';
    form.querySelector('input[name="aiReview"]').checked = true;
    form.requestSubmit();
    return true;
  })()`);
  browser('wait', '1400');
  check('checking it sends aiReview to onboarding', () => assert.deepEqual(evaluate('window.__calls[0]'), { url: 'https://site.example/', aiReview: true }));
  check('progress says when the AI is reviewing pages', () => assert.match(evaluate('window.__progress') ?? '', /Asking AI about 1 of 2 · Home/));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.message);
  process.exitCode = 1;
} finally {
  try { browser('close'); } catch { /* closed */ }
  server?.kill();
  fixture.close();
  rmSync(data, { recursive: true, force: true });
}
