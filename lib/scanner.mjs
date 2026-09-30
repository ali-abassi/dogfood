import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { defaultSignedOutMarkers, devices } from './schema.mjs';
import { duplicateCaptureGroups, signedOutMarker } from './scans.mjs';
import { checkoutRevision } from './revision.mjs';
import { configuredPageUrl, effectiveProfile, runLocalFixtures, scanTarget, verifyRole } from './scan-target.mjs';
import { pageById, projectCheckout, readProject, recordCapture, recordScan, recordScanAttempt } from './store.mjs';

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

// A saved browser state (DOGFOOD_BROWSER_STATE) signs a scan in where the profile's cookies would not. agent-browser
// refuses it alongside a profile, and a state passed on every command resets the viewport, so it replaces the
// project's profile and is loaded once, when the scan's browser launches.
const savedState = () => process.env.DOGFOOD_BROWSER_STATE;

function profileArguments(profile, useState) {
  if (useState && savedState()) return [];
  return profile ? ['--profile', profile] : [];
}

function explicitProfile(project, pages, options) {
  return Boolean(options.browserProfile || options.requiredRole || pages.some(page => page.requiredRole));
}

function scannerAction(project, pages, onProgress, options) {
  return withScanner(effectiveProfile(project, options), browser => scanPages(browser, project, pages, onProgress, options), { explicitProfile: explicitProfile(project, pages, options) });
}

async function browserCommand(session, profile, command, useState = true) {
  const args = ['--session', session, ...profileArguments(profile, useState), '--json', ...command];
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
  // Reopening an identical hash URL is a same-document navigation in Chrome. Start fresh so each
  // viewport captures current document traffic and role state rather than a previous scan's DOM.
  await browser.command(['open', 'about:blank']);
  await browser.command(['network', 'requests', '--clear']);
  await browser.command(['console', '--clear']);
  await browser.command(['errors', '--clear']);
  await browser.command(['open', url]);
  await waitForPage(browser.command);
}

export function documentFactsScript() {
  return `(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    // checkVisibility also hides what a closed <details> or content-visibility skips; those still have client rects.
    const visible = element => element.getClientRects().length > 0 && element.checkVisibility({ visibilityProperty: true });
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
    const h1 = document.querySelector('h1')?.innerText.trim().slice(0, 200) || null;
    const navigationTiming = navigation ? (navigation.loadEventEnd || navigation.duration) : null;
    // Every distinct link on the page, in page order, with the words a person sees on it.
    const links = [];
    const seen = new Set();
    for (const anchor of document.querySelectorAll('a[href]')) {
      if (!/^(https?|mailto|tel):/.test(anchor.href) || seen.has(anchor.href)) continue;
      seen.add(anchor.href);
      const label = anchor.innerText || anchor.getAttribute('aria-label') || anchor.title || anchor.querySelector('img[alt]')?.alt || '';
      links.push({ href: anchor.href, text: label.replace(/\\s+/g, ' ').trim().slice(0, 120) });
    }
    return {
      url: location.href,
      loadMs: Number.isFinite(navigationTiming) && navigationTiming > 0 ? navigationTiming : null,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      links,
      seo: { title: document.title, h1, description, canonical, robots, lang: document.documentElement.lang || null, h1Count: document.querySelectorAll('h1').length },
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

function requestUrl(url) {
  return String(url).split('#')[0];
}

function responseHeader(requests, documentUrl, name) {
  const documentRequest = [...requests].reverse().find(request => request.url === requestUrl(documentUrl) && String(request.resourceType).toLowerCase() === 'document');
  const key = Object.keys(documentRequest?.responseHeaders || {}).find(header => header.toLowerCase() === name);
  return key ? documentRequest.responseHeaders[key] : null;
}

// Chrome requests /favicon.ico on its own when a page declares no icon; that is not the page's request.
function isAutomaticFavicon(url) {
  return URL.canParse(url) && new URL(url).pathname === '/favicon.ico';
}

// The page's own document answering its registered expected status (a 404 page) is the page working, not a failure.
function isExpectedDocument(request, page, expectedStatus) {
  return expectedStatus !== undefined && request.url === requestUrl(page.url) && Number(request.status) === expectedStatus;
}

export function viewportFacts(page, requests, consoleMessages, pageErrors, expectedStatus) {
  const headers = Object.fromEntries(headerNames.map(name => [name, responseHeader(requests, page.url, name)]));
  return {
    loadMs: page.loadMs,
    consoleErrors: consoleMessages.filter(message => message.type === 'error').map(message => String(message.text || '')),
    pageErrors: pageErrors.map(error => String(error.message || error.text || error)),
    failedRequests: requests.filter(request => Number(request.status) >= 400 && !isAutomaticFavicon(request.url) && !isExpectedDocument(request, page, expectedStatus)).map(requestFact),
    requests: requests.filter(request => ['xhr', 'fetch'].includes(String(request.resourceType).toLowerCase())).map(requestFact),
    horizontalOverflow: page.horizontalOverflow,
    links: page.links,
    seo: page.seo,
    accessibility: page.accessibility,
    headers,
  };
}

async function collectViewportFacts(browser, expectedStatus) {
  const requestData = await browser.command(['network', 'requests']);
  const consoleData = await browser.command(['console']);
  const errorData = await browser.command(['errors']);
  const page = await browser.evaluate(documentFactsScript());
  return viewportFacts(page, rows(requestData, 'requests', 'network requests'), rows(consoleData, 'messages', 'console messages'), rows(errorData, 'errors', 'page errors'), expectedStatus);
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

function recordFailure(project, page, error, options) {
  const current = pageById(readProject(project.id), page.id);
  if (current.captures.desktop.state === 'rendered') return;
  const blockedReason = error.code === 'SETUP_MISSING' ? errorMessage(error) : plainFailure(errorMessage(error));
  for (const device of ['desktop', 'mobile']) recordCapture(project.id, page.id, { device, sourceUrl: failureUrl(project, page, options), blockedReason });
}

function failureUrl(project, page, options) {
  try { return scanTarget(project, page, options).sourceUrl; }
  catch { return configuredPageUrl(project, page); }
}

// A scan that captured the wrong state fails instead of passing: a signed-in page showing a
// signed-out screen, or the same desktop bytes at different routes, is wrong evidence.
function signedOutReason(page, marker) {
  return `dogfood opened a signed-out screen (“${marker}”) instead of ${page.name}. Scan again while signed in, then check the page again.`;
}

function duplicateReason(entry, group) {
  const others = group.filter(item => item.id !== entry.id).map(item => item.route).join(', ');
  return `This screenshot is identical to the one for ${others}, so it shows the wrong page. Check that each address serves its own page, then check again.`;
}

function signedOutDevices(page, markers) {
  return devices.filter(device => signedOutMarker(page.scan.viewports[device].seo, markers));
}

function rejectSignedOutScan(project, page, sourceUrl) {
  if (page.signedIn !== true) return;
  const markers = project.signedOutMarkers ?? defaultSignedOutMarkers;
  const fresh = pageById(readProject(project.id), page.id);
  const wrong = signedOutDevices(fresh, markers);
  if (!wrong.length) return;
  const reason = signedOutReason(page, signedOutMarker(fresh.scan.viewports[wrong[0]].seo, markers));
  for (const device of wrong) recordCapture(project.id, page.id, { device, sourceUrl, blockedReason: reason });
  throw Object.assign(new Error(reason), { code: 'WRONG_STATE' });
}

function scannedEntries(projectId, pages, failedIds) {
  const fresh = new Map(readProject(projectId).pages.map(page => [page.id, page]));
  return pages.filter(page => !failedIds.has(page.id) && fresh.has(page.id)).map(page => {
    const current = fresh.get(page.id);
    return { id: page.id, route: current.route, sourceUrl: current.scan?.sourceUrl, sha256: current.captures.desktop.state === 'rendered' ? current.captures.desktop.sha256 : null };
  });
}

function rejectDuplicateCaptures(projectId, pages, outcome) {
  const failedIds = new Set(outcome.failed.map(failure => failure.page));
  for (const group of duplicateCaptureGroups(scannedEntries(projectId, pages, failedIds))) {
    for (const entry of group) {
      const reason = duplicateReason(entry, group);
      recordCapture(projectId, entry.id, { device: 'desktop', sourceUrl: entry.sourceUrl, blockedReason: reason });
      recordScanAttempt(projectId, entry.id, 'failed', reason);
      outcome.failed.push({ page: entry.id, error: reason, code: 'WRONG_STATE' });
      outcome.scanned -= 1;
    }
  }
  return outcome;
}

function scanActor(target, options) {
  if (savedState() && !options.browserProfile && !target.requiredRole) return 'Saved browser state';
  return target.browserProfile ? `Chrome profile ${target.browserProfile}` : 'Signed-out visitor';
}

function scanFingerprint(project) {
  return project.source.checkout ? checkoutRevision(projectCheckout(project)).fingerprint : null;
}

function assertScanSource(project, page, target, fingerprint, options) {
  const latest = readProject(project.id);
  const currentTarget = scanTarget(latest, pageById(latest, page.id), options);
  if (currentTarget.sourceUrl !== target.sourceUrl) throw new Error('The page URL changed during its check. Check it again.');
  if (JSON.stringify(currentTarget) !== JSON.stringify(target)) throw new Error('The page scan setup changed during its check. Check it again.');
  if (scanFingerprint(latest) !== fingerprint) throw new Error('The checkout changed during its page check. Check it again.');
}

function prepareFixtures(project, target, setup) {
  setup.promise ??= runLocalFixtures(project, target, project.source.checkout ? projectCheckout(project) : null);
  return setup.promise;
}

async function scanOnePage(browser, project, page, options, setup) {
  const target = scanTarget(project, page, options);
  await prepareFixtures(project, target, setup);
  const directory = mkdtempSync(join(tmpdir(), 'dogfood-scan-'));
  const { sourceUrl } = target;
  const checkoutFingerprint = scanFingerprint(project);
  const actor = scanActor(target, options);
  const captures = {};
  try {
    for (const [device, viewport] of Object.entries(viewports)) {
      const file = join(directory, `${device}.png`);
      await openPage(browser, sourceUrl, viewport);
      await verifyRole(browser, target);
      await browser.command(['screenshot', '--full', file]);
      captures[device] = { file, viewport: viewport.label, facts: await collectViewportFacts(browser, page.expectedStatus) };
    }
    assertScanSource(project, page, target, checkoutFingerprint, options);
    recordScan(project.id, page.id, { ...target, verifiedRole: target.requiredRole, sourceUrl, actor, tier: 'automated', ...(target.environment === 'local' ? { checkoutFingerprint } : {}), ...captures });
    rejectSignedOutScan(project, page, sourceUrl);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

// A wrong-state scan already recorded its failed captures with their plain reason.
function recordPageFailure(project, page, failed, error, options) {
  if (error.code !== 'WRONG_STATE') recordFailure(project, page, error, options);
  const failure = { page: page.id, error: errorMessage(error) };
  if (['WRONG_STATE', 'SETUP_MISSING'].includes(error.code)) failure.code = error.code;
  failed.push(failure);
}

export async function scanPages(browser, project, pages, onProgress = () => {}, options = {}) {
  let scanned = 0;
  const failed = [];
  const setup = {};
  // `scanned` in progress is how many pages are done (opened or not), so the count keeps moving.
  for (const page of pages) {
    onProgress({ total: pages.length, scanned: scanned + failed.length, current: page.name });
    recordScanAttempt(project.id, page.id, 'started');
    try { await scanOnePage(browser, project, page, options, setup); scanned += 1; }
    catch (error) {
      recordScanAttempt(project.id, page.id, 'failed', errorMessage(error));
      recordPageFailure(project, page, failed, error, options);
    }
    onProgress({ total: pages.length, scanned: scanned + failed.length, current: '' });
  }
  return rejectDuplicateCaptures(project.id, pages, { scanned, failed });
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

export async function withScanner(browserProfile, action, { explicitProfile = false } = {}) {
  await ensureBrowser();
  const session = `dogfood-scan-${randomBytes(4).toString('hex')}`;
  const command = args => browserCommand(session, browserProfile, args, !explicitProfile);
  const browser = { session, command, evaluate: script => evaluate(command, script) };
  trackSession(session);
  try {
    if (savedState() && !explicitProfile) await command(['--state', savedState(), 'open', 'about:blank']);
    return await action(browser);
  }
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

function failProjectAttempts(project, error) {
  for (const page of project.pages) recordScanAttempt(project.id, page.id, 'failed', errorMessage(error));
}

// Scans every page with one browser session and lists what changed since the previous scan.
export async function scanProject(projectId, onProgress = () => {}, options = {}) {
  const project = readProject(projectId);
  if (!project.pages.length) return { scanned: 0, failed: [], changed: [] };
  let result;
  try { result = await scannerAction(project, project.pages, onProgress, options); }
  catch (error) {
    failProjectAttempts(project, error);
    throw error;
  }
  return { ...result, changed: changedPageIds(projectId, result.failed) };
}

// Scans one registered page and fails loudly, for callers that report a single result.
// A wrong-state failure already reads plain, so it passes through; anything else is wrapped.
export async function scanPage(projectId, pageId, options = {}) {
  const project = readProject(projectId);
  let failed;
  try { ({ failed } = await scannerAction(project, [pageById(project, pageId)], undefined, options)); }
  catch (error) {
    recordScanAttempt(projectId, pageId, 'failed', errorMessage(error));
    throw error;
  }
  if (!failed.length) return;
  throw singlePageFailure(failed[0]);
}

function singlePageFailure(first) {
  const message = ['WRONG_STATE', 'SETUP_MISSING'].includes(first.code) ? first.error : plainFailure(first.error);
  return Object.assign(new Error(message), { status: first.code === 'SETUP_MISSING' ? 409 : 502, code: first.code });
}

export { openPage, rejectDuplicateCaptures, rejectSignedOutScan, viewports };
