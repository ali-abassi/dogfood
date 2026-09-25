import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { latestVisualReview, runVisualReview } from './visual-review.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(root, process.env.QA_DATA || 'data');
const projectsDir = join(dataDir, 'projects');
const publicDir = join(root, 'public');
const captureDir = join(dataDir, 'captures');
const runsDir = join(dataDir, 'runs');
const execFileAsync = promisify(execFile);
const runningPages = new Set();
const reviewingPages = new Set();
const caseLists = new Map();
const assets = new Map([
  ['/', { path: join(publicDir, 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/app.js', { path: join(publicDir, 'app.js'), type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { path: join(publicDir, 'styles.css'), type: 'text/css; charset=utf-8' }],
  ['/favicon.svg', { path: join(publicDir, 'favicon.svg'), type: 'image/svg+xml' }],
  ['/logo.svg', { path: join(publicDir, 'logo.svg'), type: 'image/svg+xml' }],
]);
const statusValues = new Set(['untested', 'pass', 'needs_work']);
const checkKeys = ['functionality', 'optimization', 'design', 'excess', 'clarity'];
const auditKeys = ['security', 'scraping', 'seo'];
const connectionMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const provenanceValues = new Set(['source', 'observed', 'manual']);
const caseStatuses = new Set(['passed', 'failed', 'skipped', 'pending', 'todo']);
const port = Number(process.env.QA_PORT || 4321);
const localHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const localOrigins = new Set([...localHosts].map(host => `http://${host}`));

function projectFile(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid project ID');
  return join(projectsDir, `${id}.json`);
}

function readProject(id) {
  return JSON.parse(readFileSync(projectFile(id), 'utf8'));
}

function writeProject(project) {
  const file = projectFile(project.id);
  const temporaryFile = `${file}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(project, null, 2)}\n`);
  renameSync(temporaryFile, file);
  return project;
}

function listProjects() {
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => readProject(name.slice(0, -5)))
    .map(({ id, name, description, pages }) => ({ id, name, description, pageCount: pages.length }));
}

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function isReviewEntry(value) {
  return value && typeof value === 'object' && statusValues.has(value.status) && typeof value.note === 'string';
}

function reviewEntry(value, label) {
  if (!isReviewEntry(value)) throw validationError(`${label}: invalid status or evidence note.`);
  if (value.status === 'untested') return { status: value.status, note: '' };
  const note = value.note.trim();
  if (note.length < 12 || note.length > 1200) throw validationError(`${label}: describe the check or observation in 12–1200 characters.`);
  return { status: value.status, note };
}

function checkedDimensions(input) {
  if (!input || typeof input !== 'object') throw validationError('Review checks are missing.');
  return Object.fromEntries(checkKeys.map(key => [key, reviewEntry(input[key], key)]));
}

function checkedFeatures(input, current) {
  if (!Array.isArray(input) || input.length !== current.length) throw validationError('Feature list does not match this page.');
  return current.map(feature => {
    const update = input.find(item => item?.id === feature.id);
    if (!update) throw validationError(`Feature ${feature.name} is missing.`);
    return { ...feature, ...reviewEntry(update, feature.name) };
  });
}

function saveReview(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  page.checks = checkedDimensions(input?.checks);
  page.features = checkedFeatures(input?.features, page.features);
  return writeProject(project);
}

function auditText(value, label, maximum) {
  if (typeof value !== 'string') throw validationError(`${label} is required.`);
  const result = value.trim();
  if (!result || result.length > maximum) throw validationError(`${label} must be 1–${maximum} characters.`);
  return result;
}

function uniqueRows(input, label, maximum) {
  if (!Array.isArray(input)) throw validationError(`${label} must have 1–${maximum} entries.`);
  if (input.length < 1 || input.length > maximum) throw validationError(`${label} must have 1–${maximum} entries.`);
  const ids = input.map(row => row?.id);
  if (ids.some(id => !validRowId(id))) throw validationError(`${label} has invalid IDs.`);
  if (new Set(ids).size !== ids.length) throw validationError(`${label} has duplicate IDs.`);
  return input;
}

function validRowId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
}

function checkedAuditList(input, label) {
  return uniqueRows(input, label, 30).map(row => ({
    id: row.id,
    question: auditText(row.question, `${label} question`, 220),
    ...reviewEntry(row, row.question || label),
  }));
}

function checkedConnection(row) {
  if (!connectionMethods.has(row.method)) throw validationError('Connection method is invalid.');
  if (!provenanceValues.has(row.provenance)) throw validationError('Connection provenance is invalid.');
  return {
    id: row.id,
    name: auditText(row.name, 'Connection name', 100),
    method: row.method,
    endpoint: auditText(row.endpoint, 'Connection endpoint', 300),
    sends: auditText(row.sends, 'Sent information', 400),
    receives: auditText(row.receives, 'Returned information', 400),
    source: auditText(row.source, 'Connection evidence', 400),
    provenance: row.provenance,
  };
}

function saveAudit(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const audit = Object.fromEntries(auditKeys.map(key => [key, checkedAuditList(input?.audit?.[key], key)]));
  const connections = uniqueRows(input?.connections, 'Connections', 80).map(checkedConnection);
  page.audit = audit;
  page.connections = connections;
  return writeProject(project);
}

function configuredTests(project, page) {
  const checkout = resolve(root, auditText(project.source.checkout, 'Project checkout', 500));
  if (!existsSync(checkout)) throw validationError('Project checkout is unavailable.');
  const rootPath = realpathSync(checkout);
  const tests = page.qa?.tests;
  if (!Array.isArray(tests) || !tests.length) throw validationError('No focused tests are configured for this page.');
  for (const test of tests) validateTestFile(rootPath, test);
  return { checkout: rootPath, tests };
}

function validateTestFile(checkout, test) {
  if (!/^src\/[a-zA-Z0-9/_-]+\.test\.tsx?$/.test(test.file)) throw validationError('Configured test path is invalid.');
  if (typeof test.reason !== 'string' || test.reason.trim().length < 12) throw validationError('Configured test needs a reason.');
  const file = join(checkout, test.file);
  if (!existsSync(file)) throw validationError(`Configured test is missing: ${test.file}`);
  if (!realpathSync(file).startsWith(`${checkout}${sep}`)) throw validationError('Configured test leaves the project checkout.');
}

function qaRunFiles(projectId, pageId) {
  return join(runsDir, projectId, pageId);
}

function latestQaRuns(projectId, pageId) {
  pageById(readProject(projectId), pageId);
  const directory = qaRunFiles(projectId, pageId);
  if (!existsSync(directory)) return { runs: [] };
  const ids = readdirSync(directory).filter(id => /^[0-9]+-[a-f0-9-]+$/.test(id)).sort().reverse().slice(0, 5);
  return { runs: ids.filter(id => existsSync(join(directory, id, 'run.json'))).map(id => JSON.parse(readFileSync(join(directory, id, 'run.json'), 'utf8'))) };
}

async function qaOverview(projectId, pageId) {
  const { runs } = latestQaRuns(projectId, pageId);
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  if (!page.qa.tests.length) return { runs, plan: [], planError: '' };
  try {
    const { checkout, tests } = configuredTests(project, page);
    return { runs, plan: await cachedCases(checkout, tests), planError: '' };
  }
  catch (error) { return { runs, plan: [], planError: String(error.message).slice(0, 500) }; }
}

function listedCase(item, checkout, tests) {
  if (typeof item?.file !== 'string' || typeof item.name !== 'string') throw validationError('Vitest case list is invalid.');
  const file = relative(checkout, item.file);
  if (!tests.some(test => test.file === file)) throw validationError('Vitest listed an unexpected case.');
  return { name: item.name, file };
}

// ponytail: keyed by selected test-file mtimes; restart the server if a helper outside those files renames cases.
async function cachedCases(checkout, tests) {
  const key = [checkout, ...tests.map(test => `${test.file}@${statSync(join(checkout, test.file)).mtimeMs}`)].join('|');
  if (!caseLists.has(key)) caseLists.set(key, await listedCases(checkout, tests));
  return caseLists.get(key);
}

async function listedCases(checkout, tests) {
  const directory = mkdtempSync(join(tmpdir(), 'qa-list-'));
  const output = join(directory, 'cases.json');
  const bin = join(checkout, 'node_modules', '.bin', 'vitest');
  const args = ['list', ...tests.map(test => test.file), `--json=${output}`, '--maxWorkers=1', '--no-file-parallelism'];
  try {
    await execFileAsync(bin, args, { cwd: checkout, env: vitestEnvironment(), timeout: 30_000, maxBuffer: 200_000 });
    const items = JSON.parse(readFileSync(output, 'utf8'));
    if (!Array.isArray(items)) throw validationError('Vitest case list is invalid.');
    return items.map(item => listedCase(item, checkout, tests));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

async function checkoutSource(checkout) {
  try {
    const [revision, status] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: checkout }),
      execFileAsync('git', ['status', '--porcelain'], { cwd: checkout }),
    ]);
    return { revision: revision.stdout.trim(), dirty: Boolean(status.stdout.trim()) };
  } catch { return { revision: null, dirty: null }; }
}

async function executeTests(checkout, tests, reportFile) {
  const bin = join(checkout, 'node_modules', '.bin', 'vitest');
  if (!existsSync(bin)) throw validationError('Vitest is not installed in the project checkout.');
  const args = ['run', ...tests.map(test => test.file), '--reporter=json', `--outputFile=${reportFile}`, '--maxWorkers=1', '--no-file-parallelism'];
  try { await execFileAsync(bin, args, { cwd: checkout, env: vitestEnvironment(), timeout: 90_000, maxBuffer: 200_000 }); return { completed: true, error: '' }; }
  catch (error) { return { completed: false, error: String(error.stderr || error.message).slice(0, 2000) }; }
}

function vitestEnvironment() {
  return { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: '1', NODE_ENV: 'test' };
}

function readTestReport(reportFile) {
  if (!existsSync(reportFile)) return { error: 'Vitest did not write a report.' };
  try { return { report: JSON.parse(readFileSync(reportFile, 'utf8')) }; }
  catch { return { error: 'Vitest report is invalid JSON.' }; }
}

function emptyTestResult(error) {
  return { status: 'error', total: 0, passed: 0, failed: 0, cases: [], failures: [], error };
}

function testResult(reportFile, execution, checkout) {
  const { report, error: readError } = readTestReport(reportFile);
  if (readError) return emptyTestResult(execution.error || readError);
  if (!validTestReport(report)) return emptyTestResult('Vitest report has no valid test cases.');
  const cases = report.testResults.flatMap(file => file.assertionResults.map(item => ({ name: item.fullName, status: item.status, file: relative(checkout, file.name), detail: item.failureMessages.join('\n').slice(0, 1200) })));
  const failures = cases.filter(item => item.status === 'failed').map(({ name, detail }) => ({ name, detail }));
  const status = testStatus(report, execution);
  const error = status === 'error' ? execution.error || 'The test run did not complete all cases.' : '';
  return { status, total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, cases, failures, error };
}

function validTestReport(report) {
  if (!validTestCounts(report) || !Array.isArray(report.testResults)) return false;
  if (!report.testResults.every(validTestFileResult)) return false;
  const cases = report.testResults.flatMap(file => file.assertionResults);
  return cases.length === report.numTotalTests && cases.filter(item => item.status === 'passed').length === report.numPassedTests && cases.filter(item => item.status === 'failed').length === report.numFailedTests;
}

function validTestCounts(report) {
  const counts = [report?.numTotalTests, report?.numPassedTests, report?.numFailedTests];
  if (!counts.every(Number.isInteger)) return false;
  if (counts[0] < 1 || counts.slice(1).some(count => count < 0)) return false;
  return counts[1] + counts[2] <= counts[0];
}

function validTestFileResult(file) {
  if (typeof file?.name !== 'string' || !Array.isArray(file.assertionResults)) return false;
  return file.assertionResults.every(validCaseResult);
}

function validCaseResult(item) {
  return item && typeof item.fullName === 'string' && caseStatuses.has(item.status) && Array.isArray(item.failureMessages);
}

function testStatus(report, execution) {
  if (report.numFailedTests > 0) return 'failed';
  if (execution.completed && report.success && report.numPassedTests === report.numTotalTests) return 'passed';
  return 'error';
}

async function startQaRun(projectId, pageId) {
  const key = `${projectId}/${pageId}`;
  if (runningPages.has(key)) throw validationError('QA is already running for this page.');
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const { checkout, tests } = configuredTests(project, page);
  runningPages.add(key);
  try { return await finishQaRun(projectId, pageId, checkout, tests); }
  finally { runningPages.delete(key); }
}

async function finishQaRun(projectId, pageId, checkout, tests) {
  const id = `${Date.now()}-${randomUUID()}`;
  const directory = join(qaRunFiles(projectId, pageId), id);
  mkdirSync(directory, { recursive: true });
  const startedAt = new Date().toISOString();
  const source = await checkoutSource(checkout);
  const reportFile = join(directory, 'vitest.json');
  const execution = await executeTests(checkout, tests, reportFile);
  const result = testResult(reportFile, execution, checkout);
  const run = { id, projectId, pageId, startedAt, finishedAt: new Date().toISOString(), environment: 'local test fixtures', checkout, ...source, tests, ...result, score: null, scoreReason: 'Independent page review has not been calibrated.' };
  writeFileSync(join(directory, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
  const project = readProject(projectId);
  pageById(project, pageId).qa.latest = { id, status: run.status, finishedAt: run.finishedAt, total: run.total, passed: run.passed, failed: run.failed };
  return { run, project: writeProject(project) };
}

function pageById(project, pageId) {
  const page = project.pages.find(item => item.id === pageId);
  if (!page) throw validationError('Page no longer exists in this project.');
  return page;
}

function findingText(value, label, minimum, maximum) {
  if (typeof value !== 'string') throw validationError(`${label} is required.`);
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) throw validationError(`${label} must be ${minimum}–${maximum} characters.`);
  return text;
}

function nextFindingId(project) {
  const numbers = project.pages.flatMap(page => page.findings.map(finding => Number(finding.id.match(/^QA-(\d+)$/)?.[1] || 0)));
  return `QA-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

function captureEvidence(page, input) {
  if (Object.hasOwn(input, 'evidence')) throw validationError('Capture evidence must be selected from this page.');
  if (typeof input.attachCapture !== 'boolean') throw validationError('Choose whether to attach the current capture.');
  if (!input.attachCapture) return '';
  if (page.capture.state !== 'rendered') throw validationError('This page has no rendered capture to attach.');
  return page.capture.path.slice(1);
}

function createFinding(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  if (!['P0', 'P1', 'P2', 'P3'].includes(input?.severity)) throw validationError('Choose a valid priority.');
  page.findings.push({
    id: nextFindingId(project),
    severity: input.severity,
    title: findingText(input.title, 'Title', 8, 120),
    detail: findingText(input.detail, 'Observation and reproduction', 20, 1200),
    status: 'open',
    evidence: captureEvidence(page, input),
  });
  return writeProject(project);
}

function updateFinding(projectId, pageId, findingId, input) {
  const project = readProject(projectId);
  const finding = pageById(project, pageId).findings.find(item => item.id === findingId);
  if (!finding) throw validationError('Finding no longer exists on this page.');
  if (input?.status === 'resolved' && finding.status === 'open') {
    finding.resolution = findingText(input.note, 'Retest note', 20, 1200);
    finding.resolvedAt = new Date().toISOString();
    finding.status = 'resolved';
    return writeProject(project);
  }
  if (input?.status === 'open' && finding.status === 'resolved') {
    finding.status = 'open';
    return writeProject(project);
  }
  throw validationError('Finding status has changed. Reload the page and try again.');
}

async function requestJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw validationError('Review is too large.');
  }
  try { return JSON.parse(body); }
  catch { throw validationError('Invalid JSON review.'); }
}

function staticFile(pathname) {
  if (assets.has(pathname)) return assets.get(pathname);
  if (/^\/captures\/[a-z0-9-]+\/[a-z0-9-]+(?:-mobile)?\.png$/.test(pathname)) {
    return { path: join(captureDir, pathname.slice('/captures/'.length)), type: 'image/png' };
  }
  return null;
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

async function startVisualReview(projectId, pageId) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  if (page.capture.state !== 'rendered' || !page.capture.fullPage) throw validationError('Capture the full page before running visual analysis.');
  const key = `${projectId}/${pageId}`;
  if (reviewingPages.has(key)) throw validationError('Visual analysis is already running for this page.');
  reviewingPages.add(key);
  try { return visibleVisualReview(await runVisualReview(dataDir, project, page)); }
  catch (error) { error.status ??= 502; throw error; }
  finally { reviewingPages.delete(key); }
}

function getApiResponse(pathname) {
  if (pathname === '/api/projects') return listProjects();
  const visualMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/visual-review$/);
  if (visualMatch) return getVisualReview(visualMatch[1], visualMatch[2]);
  const runsMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/qa-runs$/);
  if (runsMatch) return qaOverview(runsMatch[1], runsMatch[2]);
  const projectMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
  if (projectMatch) return readProject(projectMatch[1]);
  return null;
}

async function putApiResponse(request, pathname) {
  const auditMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/audit$/);
  if (auditMatch) return saveAudit(auditMatch[1], auditMatch[2], await requestJson(request));
  const reviewMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/review$/);
  if (reviewMatch) return saveReview(reviewMatch[1], reviewMatch[2], await requestJson(request));
  const findingMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/findings\/([A-Za-z0-9-]+)$/);
  if (findingMatch) return updateFinding(findingMatch[1], findingMatch[2], findingMatch[3], await requestJson(request));
  return null;
}

async function postApiResponse(request, pathname) {
  const visualMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/visual-review$/);
  if (visualMatch) return startVisualReview(visualMatch[1], visualMatch[2]);
  const runsMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/qa-runs$/);
  if (runsMatch) return startQaRun(runsMatch[1], runsMatch[2]);
  const findingMatch = pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/pages\/([a-z0-9-]+)\/findings$/);
  if (findingMatch) return createFinding(findingMatch[1], findingMatch[2], await requestJson(request));
  return null;
}

async function apiResponse(request, pathname) {
  if (request.method === 'GET') return getApiResponse(pathname);
  if (request.method === 'PUT') return putApiResponse(request, pathname);
  if (request.method === 'POST') return postApiResponse(request, pathname);
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
  if (request.method !== 'GET') return send(response, 404, { error: 'Not found' });
  const asset = staticFile(pathname);
  if (asset) return send(response, 200, readFileSync(asset.path), asset.type);
  return send(response, 404, { error: 'Not found' });
}

function handle(request, response) {
  handleRequest(request, response).catch(error => {
    const status = error.status || (error.code === 'ENOENT' ? 404 : 500);
    if (status === 500) console.error(error);
    send(response, status, { error: status === 500 ? 'QA could not complete the request.' : error.message });
  });
}

createServer(handle).listen(port, '127.0.0.1', () => {
  console.log(`QA: http://127.0.0.1:${port} · data: ${relative(root, dataDir) || '.'}`);
});
