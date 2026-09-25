import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { join, relative } from 'node:path';
import { capturesDir, dataDir, root } from './lib/paths.mjs';
import { servedImagePattern } from './lib/schema.mjs';
import { onboard, onboardingPlan } from './lib/onboard.mjs';
import { currentReview, startReview } from './lib/reviews.mjs';
import { scanPage, scanProject } from './lib/scanner.mjs';
import { projectReport } from './lib/report.mjs';
import { pendingSuggestions } from './lib/suggestions.mjs';
import { addFeatures, addFeaturesToPages, createFinding, listProjects, projectView, readProject, recordVerdicts, removePage, updateFinding, validationError } from './lib/store.mjs';
import { runTests, testOverview } from './lib/test-runs.mjs';

const publicDir = join(root, 'public');
const port = Number(process.env.DOGFOOD_PORT || 4321);
const localHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const localOrigins = new Set([...localHosts].map(host => `http://${host}`));
// Edits made in the app are attributed to the person using it; agents write through the MCP server.
const person = 'person';
const jobs = new Map();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/logo.svg', ['logo.svg', 'image/svg+xml']],
]);

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function requestJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw validationError('Request is too large.');
  }
  try { return JSON.parse(body); }
  catch { throw validationError('Request body is not valid JSON.'); }
}

async function startTests(projectId, pageId) {
  const { run, project } = await runTests(projectId, pageId);
  return { run, project: projectView(project) };
}

async function scanProjectPage(projectId, pageId) {
  await scanPage(projectId, pageId);
  return projectView(readProject(projectId));
}

function backgroundJob(id) {
  const job = jobs.get(id);
  if (!job) throw Object.assign(new Error('Job not found.'), { status: 404 });
  return job;
}

// Onboarding scans every page, so it runs in the background and the app polls its progress.
// Pages that fail are reported in `failed`; the job still finishes with its project.
function startOnboarding(input) {
  const plan = onboardingPlan(input);
  const id = randomUUID();
  const job = { status: 'running', total: null, scanned: 0, current: '', projectId: null, failed: [], error: '' };
  jobs.set(id, job);
  onboard(plan, progress => Object.assign(job, progress)).then(
    result => Object.assign(job, { status: 'done', total: result.pageCount, scanned: result.scanned, current: '', projectId: result.project, failed: result.failed, reviewed: result.reviewed, reviewFailed: result.reviewFailed }),
    error => Object.assign(job, { status: 'failed', error: error.message }),
  );
  return { job: id };
}

function runningProjectScan(projectId) {
  return [...jobs].find(([, job]) => job.kind === 'scan' && job.projectId === projectId && job.status === 'running')?.[0];
}

// Rescanning every page also runs in the background; the job lists what changed visually.
// A second request while one runs joins it, so two tabs cannot scan the same pages at once.
function startProjectScan(projectId) {
  readProject(projectId);
  const running = runningProjectScan(projectId);
  if (running) return { job: running };
  const id = randomUUID();
  const job = { kind: 'scan', status: 'running', total: null, scanned: 0, current: '', projectId, failed: [], changed: [], error: '' };
  jobs.set(id, job);
  scanProject(projectId, progress => Object.assign(job, progress)).then(
    result => Object.assign(job, { status: 'done', total: result.scanned + result.failed.length, scanned: result.scanned, current: '', projectId, failed: result.failed, changed: result.changed }),
    error => Object.assign(job, { status: 'failed', error: error.message }),
  );
  return { job: id };
}

const pagePath = '/api/projects/([a-z0-9-]+)/pages/([a-z0-9-]+)';
const withBody = handler => async (params, request) => projectView(handler(...params, await requestJson(request), person));

function addPageFeatures(projectId, pageId, input, by) {
  return addFeatures(projectId, pageId, input.features, by);
}
const routes = [
  ['POST', '/api/onboard', (params, request) => requestJson(request).then(startOnboarding), 202],
  ['GET', '/api/jobs/([a-f0-9-]+)', ([id]) => backgroundJob(id)],
  ['GET', '/api/projects', () => listProjects()],
  ['GET', '/api/projects/([a-z0-9-]+)', ([id]) => projectView(readProject(id))],
  ['POST', '/api/projects/([a-z0-9-]+)/scan', ([id]) => startProjectScan(id), 202],
  ['GET', '/api/projects/([a-z0-9-]+)/report', ([id]) => projectReport(id), 200, 'text/markdown; charset=utf-8'],
  ['GET', '/api/projects/([a-z0-9-]+)/suggestions', ([id]) => pendingSuggestions(id)],
  ['POST', '/api/projects/([a-z0-9-]+)/features', async ([id], request) => projectView(addFeaturesToPages(id, (await requestJson(request)).pages, person))],
  ['POST', `${pagePath}/remove`, withBody((projectId, pageId, input, by) => removePage(projectId, pageId, input.reason, by))],
  ['GET', `${pagePath}/visual-review`, params => currentReview(...params)],
  ['POST', `${pagePath}/visual-review`, params => startReview(...params)],
  ['GET', `${pagePath}/qa-runs`, params => testOverview(...params)],
  ['POST', `${pagePath}/qa-runs`, params => startTests(...params)],
  ['POST', `${pagePath}/scan`, params => scanProjectPage(...params)],
  ['POST', `${pagePath}/features`, withBody(addPageFeatures)],
  ['PATCH', `${pagePath}/verdicts`, withBody(recordVerdicts)],
  ['POST', `${pagePath}/findings`, withBody(createFinding)],
  ['PUT', `${pagePath}/findings/([A-Za-z0-9-]+)`, withBody(updateFinding)],
].map(([method, pattern, handler, status = 200, type = 'application/json; charset=utf-8']) => ({ method, pattern: new RegExp(`^${pattern}$`), handler, status, type }));

async function apiResponse(request, pathname) {
  for (const route of routes) {
    const match = request.method === route.method && pathname.match(route.pattern);
    if (match) return { status: route.status, type: route.type, body: await route.handler(match.slice(1), request) };
  }
  return null;
}

const jsModulePattern = /^\/js\/(?:views\/)?[a-z0-9-]+\.mjs$/;

function staticFile(pathname) {
  if (assets.has(pathname)) {
    const [file, type] = assets.get(pathname);
    return { path: join(publicDir, file), type };
  }
  if (jsModulePattern.test(pathname)) return { path: join(publicDir, pathname.slice(1)), type: 'text/javascript; charset=utf-8' };
  if (servedImagePattern.test(pathname)) return { path: join(capturesDir, pathname.slice('/captures/'.length)), type: 'image/png' };
  return null;
}

function rejectedRequest(request) {
  if (!localHosts.has(request.headers.host)) return 'Local host required.';
  // Only reads skip the origin check, so a new write method can never slip past it.
  if (['GET', 'HEAD'].includes(request.method)) return null;
  if (!localOrigins.has(request.headers.origin)) return 'Local origin required.';
  return null;
}

async function handleRequest(request, response) {
  const rejection = rejectedRequest(request);
  if (rejection) return send(response, 403, { error: rejection });
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const api = await apiResponse(request, pathname);
  if (api) return send(response, api.status, api.body, api.type);
  const asset = request.method === 'GET' && staticFile(pathname);
  if (asset) return send(response, 200, readFileSync(asset.path), asset.type);
  return send(response, 404, { error: 'Not found' });
}

function errorResponse(error) {
  if (error.code === 'ENOENT') return [404, 'Not found'];
  if (error.status) return [error.status, error.message];
  console.error(error);
  return [500, 'dogfood could not complete the request.'];
}

function handle(request, response) {
  handleRequest(request, response).catch(error => {
    const [status, message] = errorResponse(error);
    send(response, status, { error: message });
  });
}

createServer(handle).listen(port, '127.0.0.1', () => {
  console.log(`dogfood: http://127.0.0.1:${port} · data: ${relative(root, dataDir) || '.'}`);
});
