import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { devices } from './schema.mjs';
import { pageById, readProject, recordCapture, recordScan } from './store.mjs';

const execFileAsync = promisify(execFile);
const installMessage = 'Install agent-browser (npm i -g agent-browser) to scan pages.';
const viewports = {
  desktop: { width: 1440, height: 900, label: '1440 × 900' },
  mobile: { width: 390, height: 844, label: '390 × 844' },
};
const headerNames = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function reportedError(stdout) {
  try { return JSON.parse(stdout).error || ''; }
  catch { return ''; }
}

function commandError(error) {
  if (error?.code === 'ENOENT') return installMessage;
  return reportedError(error.stdout) || String(error.stderr || error.message).trim();
}

function responseData(stdout) {
  let response;
  try { response = JSON.parse(stdout); }
  catch { throw new Error('agent-browser returned invalid JSON.'); }
  if (!response.success) throw new Error(response.error || 'agent-browser command failed.');
  return response.data;
}

async function browserCommand(session, profile, command) {
  const args = ['--session', session, ...(profile ? ['--profile', profile] : []), '--json', ...command];
  try {
    const { stdout } = await execFileAsync('agent-browser', args, { encoding: 'utf8', maxBuffer: 5_000_000, timeout: 65_000 });
    return responseData(stdout);
  } catch (error) {
    throw new Error(commandError(error));
  }
}

async function ensureBrowser() {
  try { await execFileAsync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 5000 }); }
  catch (error) { throw new Error(commandError(error)); }
}

async function waitForPage(command) {
  try { await command(['wait', '--load', 'networkidle']); }
  catch (error) {
    if (!/timeout|timed out/i.test(errorMessage(error))) throw error;
    await command(['wait', '--load', 'load']);
  }
  await command(['wait', '1500']);
}

async function openPage(browser, url, viewport = viewports.desktop) {
  await browser.command(['set', 'viewport', String(viewport.width), String(viewport.height), '1']);
  await browser.command(['network', 'requests', '--clear']);
  await browser.command(['console', '--clear']);
  await browser.command(['errors', '--clear']);
  await browser.command(['open', url]);
  await waitForPage(browser.command);
}

function documentFactsScript() {
  return `(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const visible = element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const hasName = element => [element.innerText, element.value, element.getAttribute('aria-label'), element.getAttribute('title')]
      .some(value => typeof value === 'string' && value.trim().length > 0)
      || element.hasAttribute('aria-labelledby');
    const fields = [...document.querySelectorAll('input,select,textarea')].filter(element => {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return visible(element) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(type);
    });
    const buttons = [...document.querySelectorAll('button,[role="button"],input[type="button"],input[type="submit"]')]
      .filter(element => visible(element) && !hasName(element));
    const description = document.querySelector('meta[name="description"]')?.content ?? null;
    const canonical = document.querySelector('link[rel~="canonical"]')?.href ?? null;
    const robots = document.querySelector('meta[name="robots"]')?.content ?? null;
    const navigationTiming = navigation ? (navigation.loadEventEnd || navigation.duration) : null;
    return {
      url: location.href,
      loadMs: Number.isFinite(navigationTiming) && navigationTiming > 0 ? navigationTiming : null,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      seo: { title: document.title, description, canonical, robots, lang: document.documentElement.lang || null, h1Count: document.querySelectorAll('h1').length },
      accessibility: {
        imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length,
        unlabeledFields: fields.filter(element => !element.labels?.length && !element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') && !element.hasAttribute('title')).length,
        unnamedButtons: buttons.length,
      },
    };
  })()`;
}

function rows(data, key, label) {
  if (!Array.isArray(data?.[key])) throw new Error(`agent-browser did not return ${label}.`);
  return data[key];
}

function requestFact(request) {
  const status = Number(request.status);
  return {
    method: String(request.method || '').toUpperCase(),
    url: String(request.url || ''),
    status: Number.isInteger(status) && status >= 0 ? status : 0,
  };
}

function responseHeader(requests, documentUrl, name) {
  const documentRequest = [...requests].reverse().find(request => request.url === documentUrl && String(request.resourceType).toLowerCase() === 'document');
  const key = Object.keys(documentRequest?.responseHeaders || {}).find(header => header.toLowerCase() === name);
  return key ? documentRequest.responseHeaders[key] : null;
}

// Chrome requests /favicon.ico on its own when a page declares no icon; that is not the page's request.
function isAutomaticFavicon(url) {
  return URL.canParse(url) && new URL(url).pathname === '/favicon.ico';
}

function viewportFacts(page, requests, consoleMessages, pageErrors) {
  const headers = Object.fromEntries(headerNames.map(name => [name, responseHeader(requests, page.url, name)]));
  return {
    loadMs: page.loadMs,
    consoleErrors: consoleMessages.filter(message => message.type === 'error').map(message => String(message.text || '')),
    pageErrors: pageErrors.map(error => String(error.message || error.text || error)),
    failedRequests: requests.filter(request => Number(request.status) >= 400 && !isAutomaticFavicon(request.url)).map(requestFact),
    requests: requests.filter(request => ['xhr', 'fetch'].includes(String(request.resourceType).toLowerCase())).map(requestFact),
    horizontalOverflow: page.horizontalOverflow,
    seo: page.seo,
    accessibility: page.accessibility,
    headers,
  };
}

async function collectViewportFacts(browser) {
  const requestData = await browser.command(['network', 'requests']);
  const consoleData = await browser.command(['console']);
  const errorData = await browser.command(['errors']);
  const page = await browser.evaluate(documentFactsScript());
  return viewportFacts(page, rows(requestData, 'requests', 'network requests'), rows(consoleData, 'messages', 'console messages'), rows(errorData, 'errors', 'page errors'));
}

// A page's address: its registered URL, else where it was last scanned or captured, else its route on the site.
function pageUrl(project, page) {
  const known = [page.url, page.scan?.sourceUrl, page.captures?.desktop.sourceUrl].find(Boolean);
  return known ?? new URL(page.route, project.source.url).href;
}

// A page that has never been captured records why; a failed rescan keeps the evidence it already has.
// Browser errors mean nothing to an app's owner, so the common ones get a plain cause and a next
// step; the browser's own words stay at the end for their coding agent.
const plainCauses = [
  [/ERR_CONNECTION_REFUSED|ECONNREFUSED/, 'nothing answered at its address. Check that the app is running, then check again.'],
  [/ERR_NAME_NOT_RESOLVED|ENOTFOUND/, 'its address does not exist. Check the address, then check again.'],
  [/timed? ?out|TIMEOUT/i, 'it took too long to load. Check again; if it keeps happening, the page may be stuck.'],
  [/ERR_CERT|SSL/i, 'its security certificate is not valid.'],
];

export function plainFailure(message, subject = 'this page') {
  const cause = plainCauses.find(([pattern]) => pattern.test(message))?.[1] ?? 'the browser could not load it. Check that the app is running, then check again.';
  return `dogfood could not open ${subject}: ${cause} (${message})`.slice(0, 600);
}

function recordFailure(project, page, error) {
  const current = pageById(readProject(project.id), page.id);
  if (current.captures.desktop.state === 'rendered') return;
  const blockedReason = plainFailure(errorMessage(error));
  for (const device of ['desktop', 'mobile']) recordCapture(project.id, page.id, { device, sourceUrl: pageUrl(project, page), blockedReason });
}

async function scanOnePage(browser, project, page) {
  const directory = mkdtempSync(join(tmpdir(), 'dogfood-scan-'));
  const sourceUrl = pageUrl(project, page);
  const actor = project.source.browserProfile ? `Signed-in Chrome profile ${project.source.browserProfile}` : 'Signed-out visitor';
  const captures = {};
  try {
    for (const [device, viewport] of Object.entries(viewports)) {
      const file = join(directory, `${device}.png`);
      await openPage(browser, sourceUrl, viewport);
      await browser.command(['screenshot', '--full', file]);
      captures[device] = { file, viewport: viewport.label, facts: await collectViewportFacts(browser) };
    }
    recordScan(project.id, page.id, { sourceUrl, actor, tier: 'automated', ...captures });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

export async function scanPages(browser, project, pages, onProgress = () => {}) {
  let scanned = 0;
  const failed = [];
  // `scanned` in progress is how many pages are done (opened or not), so the count keeps moving.
  for (const page of pages) {
    onProgress({ total: pages.length, scanned: scanned + failed.length, current: page.name });
    try { await scanOnePage(browser, project, page); scanned += 1; }
    catch (error) {
      recordFailure(project, page, error);
      failed.push({ page: page.id, error: errorMessage(error) });
    }
    onProgress({ total: pages.length, scanned: scanned + failed.length, current: '' });
  }
  return { scanned, failed };
}

const openSessions = new Set();

// A scan interrupted by Ctrl-C or a kill signal would otherwise leave its browser running.
function closeOpenSessions(signal) {
  for (const session of openSessions) {
    try { execFileSync('agent-browser', ['--session', session, 'close'], { stdio: 'ignore', timeout: 10_000 }); }
    catch (error) { process.stderr.write(`Could not close browser session ${session}: ${error.message}\n`); }
  }
  process.kill(process.pid, signal);
}

function trackSession(session) {
  if (!openSessions.size) ['SIGINT', 'SIGTERM'].forEach(signal => process.once(signal, closeOpenSessions));
  openSessions.add(session);
}

function untrackSession(session) {
  openSessions.delete(session);
  if (!openSessions.size) ['SIGINT', 'SIGTERM'].forEach(signal => process.removeListener(signal, closeOpenSessions));
}

export async function withScanner(browserProfile, action) {
  await ensureBrowser();
  const session = `dogfood-scan-${randomBytes(4).toString('hex')}`;
  const command = args => browserCommand(session, browserProfile, args);
  const browser = { command, evaluate: script => evaluate(command, script) };
  trackSession(session);
  try { return await action(browser); }
  finally {
    await command(['close']);
    untrackSession(session);
  }
}

async function evaluate(command, script) {
  const result = await command(['eval', '-b', Buffer.from(script).toString('base64')]);
  if (!Object.hasOwn(result, 'result')) throw new Error('agent-browser returned no page evaluation.');
  return result.result;
}

function pageVisuallyChanged(page) {
  return devices.some(device => page.scan?.changes?.[device]?.changed === true);
}

function changedPageIds(projectId, failed) {
  const failedIds = new Set(failed.map(failure => failure.page));
  return readProject(projectId).pages.filter(page => !failedIds.has(page.id) && pageVisuallyChanged(page)).map(page => page.id);
}

// Scans every page with one browser session and lists what changed since the previous scan.
export async function scanProject(projectId, onProgress = () => {}) {
  const project = readProject(projectId);
  if (!project.pages.length) return { scanned: 0, failed: [], changed: [] };
  const result = await withScanner(project.source.browserProfile, browser => scanPages(browser, project, project.pages, onProgress));
  return { ...result, changed: changedPageIds(projectId, result.failed) };
}

// Scans one registered page and fails loudly, for callers that report a single result.
export async function scanPage(projectId, pageId) {
  const project = readProject(projectId);
  const { failed } = await withScanner(project.source.browserProfile, browser => scanPages(browser, project, [pageById(project, pageId)]));
  if (failed.length) throw Object.assign(new Error(plainFailure(failed[0].error)), { status: 502 });
}

export { openPage };
