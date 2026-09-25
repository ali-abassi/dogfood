import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import { runsDir } from './paths.mjs';
import { caseStatuses } from './schema.mjs';
import { checkedTest, pageById, projectCheckout, readProject, validationError, writeProject } from './store.mjs';

const execFileAsync = promisify(execFile);
const runningPages = new Set();
const caseLists = new Map();

function configuredTests(project, page) {
  const checkout = projectCheckout(project);
  const tests = page.qa?.tests;
  if (!Array.isArray(tests) || !tests.length) throw validationError('No focused tests are configured for this page.');
  for (const test of tests) checkedTest(checkout, test);
  return { checkout, tests };
}

function pageRunsDir(projectId, pageId) {
  return join(runsDir, projectId, pageId);
}

function latestRuns(projectId, pageId) {
  const directory = pageRunsDir(projectId, pageId);
  if (!existsSync(directory)) return [];
  const ids = readdirSync(directory).filter(id => /^[0-9]+-[a-f0-9-]+$/.test(id)).sort().reverse().slice(0, 5);
  return ids.filter(id => existsSync(join(directory, id, 'run.json'))).map(id => JSON.parse(readFileSync(join(directory, id, 'run.json'), 'utf8')));
}

export async function testOverview(projectId, pageId) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const runs = latestRuns(projectId, pageId);
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
  const directory = mkdtempSync(join(tmpdir(), 'dogfood-list-'));
  const output = join(directory, 'cases.json');
  const args = ['list', ...tests.map(test => test.file), `--json=${output}`, '--maxWorkers=1', '--no-file-parallelism'];
  try {
    await execFileAsync(vitestBin(checkout), args, { cwd: checkout, env: vitestEnvironment(), timeout: 30_000, maxBuffer: 200_000 });
    const items = JSON.parse(readFileSync(output, 'utf8'));
    if (!Array.isArray(items)) throw validationError('Vitest case list is invalid.');
    return items.map(item => listedCase(item, checkout, tests));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

function vitestBin(checkout) {
  return join(checkout, 'node_modules', '.bin', 'vitest');
}

function vitestEnvironment() {
  return { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CI: '1', NODE_ENV: 'test' };
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
  if (!existsSync(vitestBin(checkout))) throw validationError('Vitest is not installed in the project checkout.');
  const args = ['run', ...tests.map(test => test.file), '--reporter=json', `--outputFile=${reportFile}`, '--maxWorkers=1', '--no-file-parallelism'];
  try { await execFileAsync(vitestBin(checkout), args, { cwd: checkout, env: vitestEnvironment(), timeout: 90_000, maxBuffer: 200_000 }); return { completed: true, error: '' }; }
  catch (error) { return { completed: false, error: String(error.stderr || error.message).slice(0, 2000) }; }
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
  return { status, total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests, cases, failures, error: runError(status, execution) };
}

function runError(status, execution) {
  if (status !== 'error') return '';
  return execution.error || 'The test run did not complete all cases.';
}

function validTestReport(report) {
  if (!validTestCounts(report) || !Array.isArray(report.testResults)) return false;
  if (!report.testResults.every(validTestFileResult)) return false;
  const statuses = report.testResults.flatMap(file => file.assertionResults.map(item => item.status));
  const count = status => statuses.filter(item => item === status).length;
  return [statuses.length, count('passed'), count('failed')].join() === [report.numTotalTests, report.numPassedTests, report.numFailedTests].join();
}

function validTestCounts(report) {
  const counts = [report?.numTotalTests, report?.numPassedTests, report?.numFailedTests];
  if (!counts.every(Number.isInteger)) return false;
  const [total, passed, failed] = counts;
  return Math.min(total - 1, passed, failed, total - passed - failed) >= 0;
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

export async function runTests(projectId, pageId) {
  const key = `${projectId}/${pageId}`;
  if (runningPages.has(key)) throw validationError('Tests are already running for this page.');
  const project = readProject(projectId);
  const { checkout, tests } = configuredTests(project, pageById(project, pageId));
  runningPages.add(key);
  try { return await finishRun(projectId, pageId, checkout, tests); }
  finally { runningPages.delete(key); }
}

async function finishRun(projectId, pageId, checkout, tests) {
  const id = `${Date.now()}-${randomUUID()}`;
  const directory = join(pageRunsDir(projectId, pageId), id);
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
