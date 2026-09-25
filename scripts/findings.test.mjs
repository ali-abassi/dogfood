import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const source = join(fileURLToPath(new URL('..', import.meta.url)));
const fixture = mkdtempSync(join(tmpdir(), 'dogfood-findings-'));
const projects = join(fixture, 'projects');
mkdirSync(projects);
copyFileSync(join(source, 'demo/projects/tidepool.json'), join(projects, 'tidepool.json'));
const checkout = join(fixture, 'checkout');
mkdirSync(join(checkout, 'node_modules/.bin'), { recursive: true });
mkdirSync(join(checkout, 'src'));
writeFileSync(join(checkout, 'src/home.test.ts'), '');
const fakeVitest = join(checkout, 'node_modules/.bin/vitest');
writeFileSync(fakeVitest, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'list') {
  const output = process.argv.find(arg => arg.startsWith('--json=')).slice(7);
  fs.writeFileSync(output, JSON.stringify([
    { name: 'home sign-in > accepts its owner', file: process.cwd() + '/src/home.test.ts' },
    { name: 'home sign-in > rejects invalid access', file: process.cwd() + '/src/home.test.ts' },
  ]));
  process.exit(0);
}
const output = process.argv.find(arg => arg.startsWith('--outputFile=')).slice(13);
const assertionResults = [
  { fullName: 'home sign-in accepts its owner', status: 'passed', failureMessages: [] },
  { fullName: 'home sign-in rejects invalid access', status: 'failed', failureMessages: ['Expected 403 but got 200'] },
];
fs.writeFileSync(output, JSON.stringify({ success: false, numTotalTests: 2, numPassedTests: 1, numFailedTests: 1, testResults: [{ name: process.cwd() + '/src/home.test.ts', assertionResults }], argv: process.argv.slice(2) }));
process.exit(1);
`);
chmodSync(fakeVitest, 0o755);
const seeded = JSON.parse(readFileSync(join(projects, 'tidepool.json'), 'utf8'));
seeded.source.checkout = checkout;
seeded.pages[0].captures.desktop.fullPage = false;
seeded.pages[0].qa.tests = [{ id: 'home', label: 'Home sign-in boundary', file: 'src/home.test.ts', reason: 'The sign-in route must admit the owner and refuse invalid access.' }];
writeFileSync(join(projects, 'tidepool.json'), `${JSON.stringify(seeded, null, 2)}\n`);
let child;

after(() => {
  child?.kill();
  rmSync(fixture, { recursive: true, force: true });
});

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { if ((await fetch(`${url}/api/projects`)).ok) return; }
    catch { /* Process may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Test server did not start.');
}

async function request(url, path, method, body, origin = url) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('page findings and checklists persist with page-scoped validation', async () => {
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(source, 'server.mjs')], {
    env: { ...process.env, DOGFOOD_PORT: String(port), DOGFOOD_DATA: fixture }, stdio: 'ignore',
  });
  await waitForServer(url);
  const home = '/api/projects/tidepool/pages/home/findings';
  const visualHome = '/api/projects/tidepool/pages/home/visual-review';
  const emptyVisual = await request(url, visualHome, 'GET');
  assert.deepEqual(emptyVisual.body, { review: null, stale: false });
  const blockedVisual = await request(url, visualHome, 'POST');
  assert.equal(blockedVisual.status, 400);
  const valid = { severity: 'P2', title: 'Test finding', detail: 'On the homepage, the main action does not respond after a click.', attachCapture: true };
  const created = await request(url, home, 'POST', valid);
  assert.equal(created.status, 200);
  const finding = created.body.pages[0].findings.at(-1);
  assert.equal(finding.id, 'QA-001');
  assert.equal(finding.evidence, 'captures/tidepool/home.png');
  assert.equal(finding.status, 'open');

  const badEvidence = await request(url, home, 'POST', { ...valid, evidence: 'captures/tidepool/book.png' });
  assert.equal(badEvidence.status, 400);
  const missingDetail = await request(url, home, 'POST', { ...valid, detail: '' });
  assert.equal(missingDetail.status, 400);
  const noCapture = await request(url, '/api/projects/tidepool/pages/classes/findings', 'POST', { ...valid, attachCapture: false });
  assert.equal(noCapture.body.pages[1].findings.at(-1).evidence, '');
  const wrongPage = await request(url, `/api/projects/tidepool/pages/classes/findings/${finding.id}`, 'PUT', { status: 'open' });
  assert.equal(wrongPage.status, 400);

  const path = `${home}/${finding.id}`;
  const badResolution = await request(url, path, 'PUT', { status: 'resolved', note: 'Fixed.' });
  assert.equal(badResolution.status, 400);
  const resolved = await request(url, path, 'PUT', { status: 'resolved', note: 'Retested the homepage action in the local browser; it now opens the next page.' });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.pages[0].findings.at(-1).status, 'resolved');
  assert.ok(resolved.body.pages[0].findings.at(-1).resolvedAt);
  const reopened = await request(url, path, 'PUT', { status: 'open' });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.pages[0].findings.at(-1).status, 'open');
  assert.match(reopened.body.pages[0].findings.at(-1).resolution, /^Retested/);

  const foreignOrigin = await request(url, home, 'POST', valid, 'https://example.com');
  assert.equal(foreignOrigin.status, 403);
  const verdictsPath = '/api/projects/tidepool/pages/home/verdicts';
  const initial = (await (await fetch(`${url}/api/projects/tidepool`)).json()).pages[0];
  const answer = { checks: { purpose: { status: 'needs_work', note: 'Nothing on the page says what Tidepool teaches or for which ages.' } }, audit: { security: [{ id: initial.audit.security[0].id, status: 'pass', note: 'Inputs are validated by the booking API in the fixture.' }] } };
  const answered = await request(url, verdictsPath, 'PATCH', answer);
  assert.equal(answered.status, 200);
  const answeredHome = answered.body.pages[0];
  assert.deepEqual([answeredHome.checks.purpose.status, answeredHome.checks.purpose.by], ['needs_work', 'person']);
  assert.equal(answeredHome.audit.security[0].status, 'pass');
  assert.equal(answeredHome.checks.design.status, initial.checks.design.status, 'a partial answer leaves the other answers alone');
  assert.equal(answeredHome.progress.answers.find(item => item.id === 'purpose').status, 'needs_work');
  assert.equal((await request(url, verdictsPath, 'PATCH', { checks: { purpose: { status: 'pass', note: 'Vague' } } })).status, 400);
  assert.equal((await request(url, verdictsPath, 'PATCH', { checks: { clarity: { status: 'pass', note: 'Checked in the fixture at 1440 × 900.' } } })).status, 400);
  assert.equal((await request(url, '/api/projects/tidepool/pages/missing/verdicts', 'PATCH', answer)).status, 400);
  assert.equal((await request(url, verdictsPath, 'PATCH', answer, 'https://example.com')).status, 403);
  const qaPath = '/api/projects/tidepool/pages/home/qa-runs';
  const plan = await (await fetch(`${url}${qaPath}`)).json();
  assert.equal(plan.planError, '');
  assert.deepEqual(plan.plan.map(item => [item.name, item.file]), [
    ['home sign-in > accepts its owner', 'src/home.test.ts'],
    ['home sign-in > rejects invalid access', 'src/home.test.ts'],
  ]);
  const run = await request(url, qaPath, 'POST', { file: '/tmp/untrusted.test.ts' });
  assert.equal(run.status, 200);
  assert.equal(run.body.run.status, 'failed');
  assert.equal(run.body.run.score, null);
  assert.equal(run.body.run.total, 2);
  assert.deepEqual(run.body.run.cases.map(item => [item.name, item.status, item.file]), [
    ['home sign-in accepts its owner', 'passed', 'src/home.test.ts'],
    ['home sign-in rejects invalid access', 'failed', 'src/home.test.ts'],
  ]);
  assert.equal(run.body.run.failures[0].name, 'home sign-in rejects invalid access');
  assert.equal(run.body.project.pages[0].qa.latest.failed, 1);
  assert.equal((await (await fetch(`${url}${qaPath}`)).json()).runs[0].id, run.body.run.id);
  assert.equal((await request(url, qaPath, 'POST', {}, 'https://example.com')).status, 403);
  assert.equal((await request(url, '/api/projects/tidepool/pages/account/qa-runs', 'POST', {})).status, 400);
  assert.deepEqual((await (await fetch(`${url}/api/projects/tidepool/pages/account/qa-runs`)).json()).plan, []);
  const report = JSON.parse(readFileSync(join(fixture, 'runs/tidepool/home', run.body.run.id, 'vitest.json'), 'utf8'));
  assert.equal(report.numFailedTests, 1);
  assert.ok(report.argv.includes('src/home.test.ts'));
  assert.ok(!report.argv.includes('/tmp/untrusted.test.ts'));
  const saved = JSON.parse(readFileSync(join(projects, 'tidepool.json'), 'utf8'));
  assert.equal(saved.pages[0].findings.at(-1).id, finding.id);
  assert.equal(saved.pages[0].findings.at(-1).status, 'open');
  assert.equal(saved.pages.find(page => page.id === 'book').findings[0].id, 'TP-001');
  assert.equal(saved.pages[0].checks.purpose.status, 'needs_work');
  assert.equal(saved.pages[0].qa.latest.status, 'failed');
});
