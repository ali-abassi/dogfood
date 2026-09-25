import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, relative } from 'node:path';
import { capturesDir, dataDir, root } from './lib/paths.mjs';
import { capturePathPattern } from './lib/schema.mjs';
import { createFinding, listProjects, pageById, projectView, readProject, saveAudit, saveReview, updateFinding, validationError } from './lib/store.mjs';
import { runTests, testOverview } from './lib/test-runs.mjs';
import { latestVisualReview, runVisualReview } from './lib/visual-review.mjs';

const publicDir = join(root, 'public');
const port = Number(process.env.DOGFOOD_PORT || 4321);
const localHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const localOrigins = new Set([...localHosts].map(host => `http://${host}`));
// Edits made in the app are attributed to the person using it; agents write through the MCP server.
const person = 'person';
const reviewingPages = new Set();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
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

function visibleVisualReview(result) {
  if (!result.review) return result;
  const { model, analyzedAt, latencyMs, capture, analysis, usage, promptVersion } = result.review;
  return { review: { model, analyzedAt, latencyMs, capture, analysis, usage, promptVersion }, stale: result.stale };
}

function getVisualReview(projectId, pageId) {
  const page = pageById(readProject(projectId), pageId);
  return visibleVisualReview(latestVisualReview(dataDir, projectId, pageId, page.capture));
}

function reviewablePage(project, pageId) {
  const page = pageById(project, pageId);
  if (page.capture.state !== 'rendered' || !page.capture.fullPage) throw validationError('Capture the full page before running visual analysis.');
  return page;
}

async function startVisualReview(projectId, pageId) {
  const project = readProject(projectId);
  const page = reviewablePage(project, pageId);
  const key = `${projectId}/${pageId}`;
  if (reviewingPages.has(key)) throw validationError('Visual analysis is already running for this page.');
  reviewingPages.add(key);
  try { return visibleVisualReview(await runVisualReview(dataDir, project, page)); }
  catch (error) { error.status ??= 502; throw error; }
  finally { reviewingPages.delete(key); }
}

async function startTests(projectId, pageId) {
  const { run, project } = await runTests(projectId, pageId);
  return { run, project: projectView(project) };
}

const pagePath = '/api/projects/([a-z0-9-]+)/pages/([a-z0-9-]+)';
const withBody = handler => async (params, request) => projectView(handler(...params, await requestJson(request), person));
const routes = [
  ['GET', '/api/projects', () => listProjects()],
  ['GET', '/api/projects/([a-z0-9-]+)', ([id]) => projectView(readProject(id))],
  ['GET', `${pagePath}/visual-review`, params => getVisualReview(...params)],
  ['POST', `${pagePath}/visual-review`, params => startVisualReview(...params)],
  ['GET', `${pagePath}/qa-runs`, params => testOverview(...params)],
  ['POST', `${pagePath}/qa-runs`, params => startTests(...params)],
  ['PUT', `${pagePath}/review`, withBody(saveReview)],
  ['PUT', `${pagePath}/audit`, withBody(saveAudit)],
  ['POST', `${pagePath}/findings`, withBody(createFinding)],
  ['PUT', `${pagePath}/findings/([A-Za-z0-9-]+)`, withBody(updateFinding)],
].map(([method, pattern, handler]) => ({ method, pattern: new RegExp(`^${pattern}$`), handler }));

function apiResponse(request, pathname) {
  for (const route of routes) {
    const match = request.method === route.method && pathname.match(route.pattern);
    if (match) return route.handler(match.slice(1), request);
  }
  return null;
}

function staticFile(pathname) {
  if (assets.has(pathname)) {
    const [file, type] = assets.get(pathname);
    return { path: join(publicDir, file), type };
  }
  if (capturePathPattern.test(pathname)) return { path: join(capturesDir, pathname.slice('/captures/'.length)), type: 'image/png' };
  return null;
}

function rejectedRequest(request) {
  if (!localHosts.has(request.headers.host)) return 'Local host required.';
  if (!['PUT', 'POST'].includes(request.method)) return null;
  if (!localOrigins.has(request.headers.origin)) return 'Local origin required.';
  return null;
}

async function handleRequest(request, response) {
  const rejection = rejectedRequest(request);
  if (rejection) return send(response, 403, { error: rejection });
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const data = await apiResponse(request, pathname);
  if (data) return send(response, 200, data);
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
