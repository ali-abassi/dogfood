// Acceptance: onboarding and scanning a fixture site with known defects through the CLI, the
// HTTP API, and the MCP server, with a real headless browser (needs agent-browser).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const scanSessions = list => new Set(list.match(/dogfood-scan-[a-f0-9]+/g) ?? []);
const sessionsBefore = scanSessions(execFileSync('agent-browser', ['session', 'list'], { encoding: 'utf8' }));
const data = mkdtempSync(join(tmpdir(), 'dogfood-scan-proof-'));
let passed = 0;

const layout = (title, body, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><meta name="description" content="${title} at Fixture Shop."></head><body style="margin:0;font:16px system-ui">
<nav aria-label="Main"><a href="/">Home</a> <a href="/index.html">Start</a> <a href="/pricing">Pricing</a> <a href="/about">About</a> <a href="https://elsewhere.example/">Elsewhere</a></nav>
<main style="padding:24px"><h1>${title}</h1>${body}<p>${'Fixture copy. '.repeat(40)}</p></main>${extra}</body></html>`;

const pages = {
  '/': layout('Home', '<img src="/logo.png" width="40" height="40"><label>Email <input name="email"></label><input name="coupon"><button>Go</button>',
    `<script>fetch('/api/data').then(r => r.json()); fetch('/api/broken'); console.error('boom');</script>`),
  '/pricing': layout('Pricing', '<div style="width:900px;height:40px;background:#ccd">Wide table</div>'),
  '/about': layout('About', '<p>About us.</p>', `<script>setTimeout(() => { throw new Error('about exploded'); }, 10);</script>`),
  '/hidden': layout('Hidden', '<p>Only in the sitemap.</p>'),
};

const assets = {
  '/api/data': [200, 'application/json', () => '{"ok":true}'],
  '/api/broken': [500, 'application/json', () => '{"ok":false}'],
  '/logo.png': [200, 'image/svg+xml', () => '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#246"/></svg>'],
  '/sitemap.xml': [200, 'application/xml', () => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(pages).map(p => `<url><loc>${site}${p}</loc></url>`).join('')}</urlset>`],
};

function fixtureResponse(request, response) {
  const path = new URL(request.url, 'http://fixture').pathname;
  const asset = assets[path];
  if (asset) return response.writeHead(asset[0], { 'Content-Type': asset[1] }).end(asset[2]());
  const headers = { 'X-Frame-Options': 'DENY', 'Content-Type': 'text/html; charset=utf-8' };
  if (pages[path]) return response.writeHead(200, headers).end(pages[path]);
  return response.writeHead(404, headers).end(layout('Not found', ''));
}

const fixture = createServer(fixtureResponse);
await new Promise(done => fixture.listen(0, '127.0.0.1', done));
const site = `http://127.0.0.1:${fixture.address().port}`;

function check(name, body) {
  body();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// Asynchronous on purpose: the fixture site is served from this process, so blocking here would stall it.
function run(script, args) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [join(repo, script), ...args], { cwd: repo, env: { ...process.env, DOGFOOD_DATA: data } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', text => { stdout += text; });
    child.stderr.on('data', text => { stderr += text; });
    const timer = setTimeout(() => child.kill(), 300_000);
    child.on('close', code => { clearTimeout(timer); if (code === 0) done(stdout); else fail(Object.assign(new Error(`${script} exited ${code}`), { stderr })); });
  });
}

const manifest = id => JSON.parse(readFileSync(join(data, 'projects', `${id}.json`), 'utf8'));
const page = (project, id) => project.pages.find(item => item.id === id);

async function freePort() {
  return new Promise(done => { const probe = createNetServer(); probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); }); });
}

// Newline-delimited JSON-RPC over stdio.
async function mcpCall(name, args) {
  const child = spawn(process.execPath, [join(repo, 'mcp.mjs')], { env: { ...process.env, DOGFOOD_DATA: data }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', text => { output += text; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'proof', version: '1' } } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })}\n`);
  for (let waited = 0; waited < 300_000 && !output.includes('"id":2'); waited += 250) await new Promise(done => setTimeout(done, 250));
  child.kill();
  const line = output.split('\n').find(item => item.includes('"id":2'));
  assert.ok(line, `${name} did not answer`);
  return JSON.parse(line).result;
}

try {
  const cli = await run('scripts/onboard.mjs', [`${site}/`, '--name', 'Fixture Shop']);
  const shop = manifest('fixture-shop');
  check('onboarding from a URL creates the project, named and identified from --name', () => {
    assert.equal(shop.name, 'Fixture Shop');
    assert.equal(shop.source.url, `${site}/`);
    assert.match(cli, /fixture-shop/);
  });
  check('onboarding finds pages from the rendered navigation and the sitemap, same-site only, with /index.html as /', () => {
    const routes = shop.pages.map(item => item.route).sort();
    assert.deepEqual(routes, ['/', '/about', '/hidden', '/pricing']);
    assert.equal(page(shop, 'home')?.route, '/');
    assert.ok(shop.pages.every(item => item.name && item.group && /^[a-z0-9-]+$/.test(item.id)));
  });
  check('every discovered page has validated desktop and mobile screenshots and a matching scan', () => {
    for (const item of shop.pages) {
      assert.equal(item.captures.desktop.state, 'rendered', item.id);
      assert.equal(item.captures.mobile.state, 'rendered', item.id);
      assert.match(item.captures.mobile.path, /-mobile\.png$/);
      assert.ok(item.captures.desktop.pixelWidth > item.captures.mobile.pixelWidth, `${item.id}: mobile is narrower than desktop`);
      assert.equal(item.scan.captureSha256.desktop, item.captures.desktop.sha256);
      assert.equal(item.scan.captureSha256.mobile, item.captures.mobile.sha256);
    }
  });
  const home = page(shop, 'home');
  const facts = home.scan.viewports.desktop;
  check('the scan records console errors, failed requests, and API calls', () => {
    assert.ok(facts.consoleErrors.some(text => text.includes('boom')), JSON.stringify(facts.consoleErrors));
    assert.ok(facts.failedRequests.some(item => item.url.endsWith('/api/broken') && item.status === 500), JSON.stringify(facts.failedRequests));
    assert.ok(facts.requests.some(item => item.url.endsWith('/api/data') && item.status === 200), JSON.stringify(facts.requests));
    assert.ok(Number.isFinite(facts.loadMs) && facts.loadMs >= 0);
  });
  check('the scan records search tags, security headers, and accessibility counts', () => {
    assert.equal(facts.seo.title, 'Home');
    assert.equal(facts.seo.description, 'Home at Fixture Shop.');
    assert.equal(facts.seo.lang, 'en');
    assert.equal(facts.seo.h1Count, 1);
    assert.equal(facts.headers['x-frame-options'], 'DENY');
    assert.ok(facts.accessibility.imagesWithoutAlt >= 1);
    assert.ok(facts.accessibility.unlabeledFields >= 1, 'the coupon input has no label');
  });
  check('observed API calls are added to the connection map', () => {
    const endpoints = home.connections.map(row => `${row.method} ${row.endpoint} ${row.provenance}`);
    assert.ok(endpoints.includes('GET /api/data observed'), JSON.stringify(endpoints));
    assert.ok(endpoints.includes('GET /api/broken observed'), JSON.stringify(endpoints));
  });
  check('sideways scrolling is measured per device', () => {
    const pricing = page(shop, 'pricing').scan.viewports;
    assert.equal(pricing.mobile.horizontalOverflow, true);
    assert.equal(pricing.desktop.horizontalOverflow, false);
  });
  check('uncaught page errors are recorded', () => {
    assert.ok(page(shop, 'about').scan.viewports.desktop.pageErrors.some(text => text.includes('about exploded')));
  });

  const before = page(shop, 'pricing').scan.scannedAt;
  await run('scripts/scan.mjs', ['fixture-shop', 'pricing']);
  check('scan.mjs rescans chosen pages of an existing project', () => {
    assert.ok(page(manifest('fixture-shop'), 'pricing').scan.scannedAt > before);
    assert.equal(page(manifest('fixture-shop'), 'about').scan.scannedAt, page(shop, 'about').scan.scannedAt);
  });

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [join(repo, 'server.mjs')], { env: { ...process.env, DOGFOOD_DATA: data, DOGFOOD_PORT: String(port) }, stdio: 'ignore' });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await fetch(`${url}/api/projects`)).ok) break; } catch { /* starting */ }
      await new Promise(done => setTimeout(done, 100));
    }
    const post = (path, body) => fetch(`${url}${path}`, { method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const rejected = await fetch(`${url}/api/onboard`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ url: `${site}/` }) });
    check('the onboarding API refuses cross-origin requests', () => assert.equal(rejected.status, 403));
    const invalid = await post('/api/onboard', { url: 'not a url' });
    check('the onboarding API refuses an invalid URL before starting', () => assert.equal(invalid.status, 400));
    const started = await post('/api/onboard', { url: `${site}/`, name: 'Fixture Web' });
    const { job } = await started.json();
    let status;
    for (let waited = 0; waited < 300_000; waited += 1000) {
      status = await (await fetch(`${url}/api/jobs/${job}`)).json();
      if (status.status !== 'running') break;
      await new Promise(done => setTimeout(done, 1000));
    }
    check('the onboarding API runs as a job with progress and finishes with the project ID', () => {
      assert.equal(started.status, 202);
      assert.equal(status.status, 'done', JSON.stringify(status));
      assert.equal(status.projectId, 'fixture-web');
      assert.equal(status.total, 4);
      assert.equal(status.scanned, 4);
    });
    const rescan = await post('/api/projects/fixture-web/pages/pricing/scan', {});
    const rescanned = await rescan.json();
    check('the page scan API rescans one page and returns the project with progress', () => {
      assert.equal(rescan.status, 200, JSON.stringify(rescanned));
      assert.ok(page(rescanned, 'pricing').progress.requirements.some(item => item.id === 'scan' && item.met));
    });
  } finally { server.kill(); }

  const mcpScan = await mcpCall('dogfood_scan_page', { project: 'fixture-shop', page: 'about' });
  check('dogfood_scan_page rescans a page and returns its outcome', () => {
    assert.notEqual(mcpScan.isError, true, mcpScan.content?.[0]?.text);
    const outcome = JSON.parse(mcpScan.content[0].text);
    assert.equal(outcome.page, 'about');
    assert.equal(outcome.status, 'needs_work');
  });
  const mcpOnboard = await mcpCall('dogfood_onboard_project', { url: `${site}/`, name: 'Fixture Agent' });
  check('dogfood_onboard_project onboards a site in one call and summarises it compactly', () => {
    assert.notEqual(mcpOnboard.isError, true, mcpOnboard.content?.[0]?.text);
    const summary = JSON.parse(mcpOnboard.content[0].text);
    assert.equal(summary.project, 'fixture-agent');
    assert.equal(summary.pageCount, 4);
    assert.equal(summary.pages, undefined, 'the summary must not include every page manifest');
  });
  // agent-browser drops a closed session from its list shortly after close returns.
  let sessions = '';
  for (let waited = 0; waited <= 5000; waited += 500) {
    sessions = execFileSync('agent-browser', ['session', 'list'], { encoding: 'utf8' });
    if (![...scanSessions(sessions)].some(name => !sessionsBefore.has(name))) break;
    await new Promise(done => setTimeout(done, 500));
  }
  check('scans close every browser session they opened', () => assert.deepEqual([...scanSessions(sessions)].filter(name => !sessionsBefore.has(name)), []));
  console.log(`\n${passed} checks passed`);
} catch (error) {
  console.error(`FAILED after ${passed} passing checks:`, error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  fixture.close();
  rmSync(data, { recursive: true, force: true });
}
