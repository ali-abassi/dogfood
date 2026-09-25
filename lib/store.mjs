import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { captureProblem, readPng } from './capture.mjs';
import { pageCompletion, pageStatus, scanProblems } from './completion.mjs';
import { capturesDir, dataDir, projectsDir, root } from './paths.mjs';
import { checkedViewportFacts, mergedConnections } from './scans.mjs';
import {
  auditKeys, captureTiers, checkKeys, connectionProvenance, devices, evidenceNote, findingIdPattern,
  httpMethods, idPattern, manifestVersion, rowIdPattern, severities, testFilePattern, verdicts,
} from './schema.mjs';
import { latestVisualReview } from './visual-review.mjs';

const defaultAudit = {
  security: [
    ['inputs', 'Are inputs validated on the server?'],
    ['private-data', 'Does the page avoid exposing other people’s data?'],
    ['headers', 'Are security headers and third-party scripts appropriate?'],
  ],
  scraping: [
    ['bulk', 'Are data endpoints rate-limited against bulk copying?'],
    ['public-copy', 'Is only intentionally public content exposed to crawlers?'],
  ],
  seo: [
    ['title', 'Does the page have a specific title and description?'],
    ['indexing', 'Is the page indexed only if it should be public?'],
  ],
  accessibility: [
    ['keyboard', 'Can every control be reached and used with the keyboard alone, with a visible focus?'],
    ['names', 'Do images, fields, and buttons have accessible names?'],
    ['contrast', 'Does text meet WCAG AA contrast in light and dark themes?'],
    ['reflow', 'Does the page stay usable at 200% zoom and on a narrow phone screen?'],
  ],
};

export function defaultAuditRows(key) {
  return defaultAudit[key].map(([id, question]) => ({ id, question, status: 'untested', note: '' }));
}

export function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function projectFile(id) {
  if (!idPattern.test(id)) throw validationError('Invalid project ID.');
  return join(projectsDir, `${id}.json`);
}

export function readProject(id) {
  const file = projectFile(id);
  if (!existsSync(file)) throw Object.assign(new Error(`Project ${id} does not exist.`), { status: 404 });
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeProject(project) {
  const file = projectFile(project.id);
  const temporaryFile = `${file}.${process.pid}.tmp`;
  mkdirSync(projectsDir, { recursive: true });
  writeFileSync(temporaryFile, `${JSON.stringify(project, null, 2)}\n`);
  renameSync(temporaryFile, file);
  return project;
}

export function listProjects() {
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => readProject(name.slice(0, -5)))
    .map(({ id, name, description, pages }) => ({ id, name, description, pageCount: pages.length }));
}

export function pageById(project, pageId) {
  const page = project.pages.find(item => item.id === pageId);
  if (!page) throw validationError(`Page ${pageId} does not exist in ${project.id}.`);
  return page;
}

// Derived fields the app and agents read; never stored in the manifest.
export function pageProgress(project, page) {
  const { review, stale } = latestVisualReview(dataDir, project.id, page.id, page.captures.desktop);
  const completion = pageCompletion(page, { visualReview: { exists: Boolean(review), stale } });
  return { status: pageStatus(page, completion), ...completion, scanProblems: scanProblems(page.scan) };
}

export function projectView(project) {
  return { ...project, pages: project.pages.map(page => ({ ...page, progress: pageProgress(project, page) })) };
}

export function text(value, label, minimum, maximum) {
  if (typeof value !== 'string') throw validationError(`${label} is required.`);
  const result = value.trim();
  if (result.length < minimum || result.length > maximum) throw validationError(`${label} must be ${minimum}–${maximum} characters.`);
  return result;
}

function isVerdict(value) {
  return verdicts.has(value?.status) && typeof value.note === 'string';
}

function verdict(value, label) {
  if (!isVerdict(value)) throw validationError(`${label}: invalid status or evidence note.`);
  if (value.status === 'untested') return { status: 'untested', note: '' };
  return { status: value.status, note: text(value.note, `${label}: the evidence note`, evidenceNote.minimum, evidenceNote.maximum) };
}

// Records who changed a verdict and when; unchanged verdicts keep their history.
function stampedVerdict(previous, value, label, by) {
  const next = verdict(value, label);
  if (previous.status === next.status && previous.note === next.note) return previous;
  return { ...previous, ...next, by, at: new Date().toISOString() };
}

function updatePage(projectId, pageId, change) {
  const project = readProject(projectId);
  change(pageById(project, pageId), project);
  return writeProject(project);
}

export function saveReview(projectId, pageId, input, by) {
  if (!input?.checks || typeof input.checks !== 'object') throw validationError('Review checks are missing.');
  return updatePage(projectId, pageId, page => {
    if (!Array.isArray(input.features) || input.features.length !== page.features.length) throw validationError('Feature list does not match this page.');
    page.checks = Object.fromEntries(checkKeys.map(key => [key, stampedVerdict(page.checks[key], input.checks[key], key, by)]));
    page.features = page.features.map(feature => stampedVerdict(feature, matchingRow(input.features, feature.id, feature.name), feature.name, by));
  });
}

function matchingRow(rows, id, label) {
  const row = rows.find(item => item?.id === id);
  if (!row) throw validationError(`${label} is missing.`);
  return row;
}

// Partial verdict updates for agents: only the entries named in the input change.
export function recordVerdicts(projectId, pageId, input, by) {
  return updatePage(projectId, pageId, page => {
    recordChecks(page, input.checks ?? {}, by);
    page.features = updatedRows(page.features, input.features ?? [], 'Feature', by);
    recordAudit(page, input.audit ?? {}, by);
  });
}

function recordChecks(page, checks, by) {
  for (const [key, value] of Object.entries(checks)) {
    if (!checkKeys.includes(key)) throw validationError(`Unknown quality check: ${key}.`);
    page.checks[key] = stampedVerdict(page.checks[key], value, key, by);
  }
}

function recordAudit(page, audit, by) {
  for (const [key, rows] of Object.entries(audit)) {
    if (!auditKeys.includes(key)) throw validationError(`Unknown checklist: ${key}.`);
    page.audit[key] = updatedRows(page.audit[key], rows, `${key} question`, by);
  }
}

function assertKnownRows(current, updates, label) {
  if (!Array.isArray(updates)) throw validationError(`${label} updates must be a list.`);
  const unknown = updates.find(update => !current.some(row => row.id === update?.id));
  if (unknown) throw validationError(`${label} ${unknown.id} does not exist on this page.`);
}

function updatedRows(current, updates, label, by) {
  assertKnownRows(current, updates, label);
  return current.map(row => {
    const update = updates.find(item => item.id === row.id);
    return update ? stampedVerdict(row, update, row.name ?? row.question, by) : row;
  });
}

function assertCount(input, label, minimum, maximum) {
  if (!Array.isArray(input) || input.length < minimum || input.length > maximum) throw validationError(`${label} must have ${minimum}–${maximum} entries.`);
}

function uniqueRows(input, label, minimum, maximum) {
  assertCount(input, label, minimum, maximum);
  const ids = input.map(row => row?.id);
  if (ids.some(id => typeof id !== 'string' || !rowIdPattern.test(id))) throw validationError(`${label} has invalid IDs.`);
  if (new Set(ids).size !== ids.length) throw validationError(`${label} has duplicate IDs.`);
  return input;
}

function checkedAuditList(input, current, label, by) {
  return uniqueRows(input, label, 1, 30).map(row => {
    const previous = current.find(item => item.id === row.id) ?? { status: 'untested', note: '' };
    return { ...stampedVerdict(previous, row, row.question || label, by), id: row.id, question: text(row.question, `${label} question`, 1, 220) };
  });
}

function checkedConnection(row) {
  if (!httpMethods.has(row.method)) throw validationError('Connection method is invalid.');
  if (!connectionProvenance.has(row.provenance)) throw validationError('Connection provenance is invalid.');
  return {
    id: row.id,
    name: text(row.name, 'Connection name', 1, 100),
    method: row.method,
    endpoint: text(row.endpoint, 'Connection endpoint', 1, 300),
    sends: text(row.sends, 'Sent information', 1, 400),
    receives: text(row.receives, 'Returned information', 1, 400),
    source: text(row.source, 'Connection evidence', 1, 400),
    provenance: row.provenance,
  };
}

export function setConnections(projectId, pageId, connections) {
  return updatePage(projectId, pageId, page => {
    page.connections = uniqueRows(connections, 'Connections', 1, 80).map(checkedConnection);
  });
}

export function saveAudit(projectId, pageId, input, by) {
  return updatePage(projectId, pageId, page => {
    page.audit = Object.fromEntries(auditKeys.map(key => [key, checkedAuditList(input?.audit?.[key], page.audit[key], key, by)]));
    page.connections = uniqueRows(input?.connections, 'Connections', 1, 80).map(checkedConnection);
  });
}

function nextFindingId(project) {
  const numbers = project.pages.flatMap(page => page.findings.map(finding => Number(finding.id.match(findingIdPattern)?.[1] || 0)));
  return `QA-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

function findingEvidence(page, input) {
  if (Object.hasOwn(input, 'evidence')) throw validationError('Capture evidence must be selected from this page.');
  if (typeof input.attachCapture !== 'boolean') throw validationError('Choose whether to attach the current capture.');
  if (!input.attachCapture) return '';
  if (page.captures.desktop.state !== 'rendered') throw validationError('This page has no desktop screenshot to attach.');
  return page.captures.desktop.path.slice(1);
}

export function createFinding(projectId, pageId, input, by) {
  if (!severities.includes(input?.severity)) throw validationError('Choose a valid priority.');
  return updatePage(projectId, pageId, (page, project) => {
    page.findings.push({
      id: nextFindingId(project),
      severity: input.severity,
      title: text(input.title, 'Title', 8, 120),
      detail: text(input.detail, 'Observation and reproduction', 20, 1200),
      status: 'open',
      evidence: findingEvidence(page, input),
      by,
      at: new Date().toISOString(),
    });
  });
}

function changeFindingStatus(finding, input, by) {
  const transition = `${finding.status}->${input?.status}`;
  if (transition === 'open->resolved') {
    return Object.assign(finding, { status: 'resolved', resolution: text(input.note, 'Retest note', 20, 1200), resolvedAt: new Date().toISOString(), resolvedBy: by });
  }
  if (transition === 'resolved->open') return Object.assign(finding, { status: 'open' });
  throw validationError('Finding status has changed. Reload the page and try again.');
}

export function updateFinding(projectId, pageId, findingId, input, by) {
  return updatePage(projectId, pageId, page => {
    const finding = page.findings.find(item => item.id === findingId);
    if (!finding) throw validationError('Finding no longer exists on this page.');
    changeFindingStatus(finding, input, by);
  });
}

function httpUrl(value, label) {
  const url = text(value, label, 1, 2000);
  if (!URL.canParse(url) || !['http:', 'https:'].includes(new URL(url).protocol)) throw validationError(`${label} must be an HTTP(S) URL.`);
  return url;
}

// Only the product URL is required: a checkout enables focused tests, and a Chrome
// profile name lets scans see signed-in pages.
function projectSource(input) {
  const source = { url: httpUrl(input.url, 'Product URL'), environment: text(input.environment ?? 'Live site', 'Environment', 1, 200) };
  if (input.checkout) source.checkout = text(input.checkout, 'Local checkout', 1, 500);
  if (input.browserProfile) source.browserProfile = text(input.browserProfile, 'Browser profile', 1, 100);
  return source;
}

function newProjectId(value) {
  const id = text(value, 'Project ID', 1, 80);
  if (!idPattern.test(id)) throw validationError('Project ID uses lowercase letters, numbers, and hyphens.');
  if (existsSync(projectFile(id))) throw validationError(`Project ${id} already exists.`);
  return id;
}

export function createProject(input) {
  const id = newProjectId(input?.id);
  return writeProject({
    version: manifestVersion,
    id,
    name: text(input.name, 'Project name', 1, 100),
    description: text(input.description ?? `Page-by-page QA for ${input.url}.`, 'Project description', 1, 400),
    source: projectSource(input),
    guidelines: (input.guidelines ?? []).map(item => text(item, 'Guideline', 1, 300)),
    pages: [],
  });
}

export function projectCheckout(project) {
  if (!project.source.checkout) throw validationError('This project has no local checkout, so it cannot run focused tests.');
  const checkout = resolve(root, project.source.checkout);
  if (!existsSync(checkout)) throw validationError('Project checkout is unavailable.');
  return realpathSync(checkout);
}

export function checkedTest(checkout, test) {
  if (!testFilePattern.test(String(test?.file))) throw validationError('Configured test path is invalid.');
  const file = join(checkout, test.file);
  if (!existsSync(file)) throw validationError(`Configured test is missing: ${test.file}`);
  if (!realpathSync(file).startsWith(`${checkout}${sep}`)) throw validationError('Configured test leaves the project checkout.');
  return { id: text(test.id, 'Test ID', 1, 80), label: text(test.label, 'Test label', 1, 120), file: test.file, reason: text(test.reason, 'Test reason', 12, 400) };
}

// What "works" means for a feature, in one line; optional so onboarding can list features first.
function expectedBehavior(value) {
  return value === undefined || value === '' ? {} : { expected: text(value, 'Expected behavior', 1, 300) };
}

function registeredFeatures(input, current) {
  return uniqueRows(input ?? [], 'Features', 0, 60).map(row => {
    const previous = current.find(item => item.id === row.id) ?? { status: 'untested', note: '' };
    const { expected, ...rest } = previous;
    return { ...rest, id: row.id, name: text(row.name, 'Feature name', 1, 120), ...expectedBehavior(row.expected ?? expected) };
  });
}

const notCaptured = { state: 'blocked', reason: 'Not captured yet.' };

function newPage(id) {
  return {
    id,
    captures: { desktop: notCaptured, mobile: notCaptured },
    scan: null,
    features: [],
    checks: Object.fromEntries(checkKeys.map(key => [key, { status: 'untested', note: '' }])),
    findings: [],
    audit: Object.fromEntries(auditKeys.map(key => [key, defaultAuditRows(key)])),
    connections: [],
    qa: { tests: [], note: '' },
  };
}

// Adds a page or updates its identity, feature inventory, and test plan. Verdicts,
// captures, findings, and runs on existing entries are preserved.
// The page's full address, when its route alone does not locate it (for example a hash-routed app).
function pageUrl(value, current) {
  if (value === undefined) return current ? { url: current } : {};
  return { url: httpUrl(value, 'Page URL') };
}

function registeredPlan(project, page, input) {
  const tests = (input.tests ?? []).map(test => checkedTest(projectCheckout(project), test));
  const note = input.untestedNote === undefined ? page.qa.note || 'Nothing beyond the scan and screenshots has been checked yet.' : text(input.untestedNote, 'Untested boundary note', 12, 600);
  return { ...page.qa, tests, note };
}

export function registerPage(projectId, input) {
  const project = readProject(projectId);
  const id = text(input?.id, 'Page ID', 1, 80);
  if (!idPattern.test(id)) throw validationError('Page ID uses lowercase letters, numbers, and hyphens.');
  const existing = project.pages.find(item => item.id === id);
  const page = existing ?? newPage(id);
  Object.assign(page, {
    name: text(input.name, 'Page name', 1, 100),
    group: text(input.group, 'Page group', 1, 60),
    route: text(input.route, 'Route', 1, 300),
    ...pageUrl(input.url, page.url),
    features: registeredFeatures(input.features, page.features),
    qa: registeredPlan(project, page, input),
  });
  if (!existing) project.pages.push(page);
  return writeProject(project);
}

function blockedCapture(input) {
  return { state: 'blocked', reason: text(input.blockedReason, 'Blocked reason', 12, 600), ...(input.sourceUrl ? { sourceUrl: httpUrl(input.sourceUrl, 'Source URL') } : {}) };
}

function importedImage(file) {
  if (!existsSync(file)) throw validationError(`Screenshot file does not exist: ${file}`);
  const image = readPng(file);
  const problem = captureProblem(image.bytes);
  if (problem) throw validationError(problem);
  return image;
}

function captureName(pageId, device) {
  return device === 'mobile' ? `${pageId}-mobile` : pageId;
}

// Keeps the replaced screenshot beside the new one so earlier evidence is not lost.
function storeCaptureFile(projectId, name, source) {
  const directory = join(capturesDir, projectId);
  const target = join(directory, `${name}.png`);
  mkdirSync(join(directory, 'history'), { recursive: true });
  if (existsSync(target)) renameSync(target, join(directory, 'history', `${name}-${Date.now()}.png`));
  copyFileSync(source, target);
  return `/captures/${projectId}/${name}.png`;
}

function checkedDevice(device) {
  if (!devices.includes(device)) throw validationError(`Device must be one of: ${devices.join(', ')}.`);
  return device;
}

function renderedCapture(projectId, pageId, input) {
  if (!captureTiers.has(input.tier)) throw validationError(`Evidence tier must be one of: ${[...captureTiers].join(', ')}.`);
  if (typeof input.fullPage !== 'boolean') throw validationError('State whether the screenshot covers the full page.');
  const file = text(input.file, 'Screenshot file', 1, 1000);
  const image = importedImage(file);
  const provenance = {
    sourceUrl: httpUrl(input.sourceUrl, 'Source URL'),
    viewport: text(input.viewport, 'Viewport', 3, 40),
    actor: text(input.actor, 'Actor', 3, 120),
  };
  const path = storeCaptureFile(projectId, captureName(pageId, input.device), file);
  return { path, ...provenance, capturedAt: new Date().toISOString(), tier: input.tier, state: 'rendered', fullPage: input.fullPage, pixelWidth: image.width, pixelHeight: image.height, sha256: image.sha256 };
}

export function recordCapture(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const device = checkedDevice(input?.device);
  page.captures[device] = input.blockedReason ? blockedCapture(input) : renderedCapture(projectId, pageId, input);
  return writeProject(project);
}

// Records one scan: both screenshots it took, the facts it measured, and any API calls
// it saw that the connection map does not list yet. All-or-nothing: nothing is stored
// unless both screenshots and both sets of facts are valid.
export function recordScan(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const sourceUrl = httpUrl(input?.sourceUrl, 'Scanned URL');
  const viewports = Object.fromEntries(devices.map(device => [device, checkedViewportFacts(input[device]?.facts)]));
  devices.forEach(device => importedImage(text(input[device]?.file, `${device} screenshot file`, 1, 1000)));
  for (const device of devices) {
    page.captures[device] = renderedCapture(projectId, pageId, { ...input[device], device, sourceUrl, actor: input.actor, tier: input.tier, fullPage: true });
  }
  const scannedAt = new Date().toISOString();
  const captureSha256 = Object.fromEntries(devices.map(device => [device, page.captures[device].sha256]));
  page.scan = { scannedAt, sourceUrl, actor: page.captures.desktop.actor, captureSha256, viewports };
  page.connections = mergedConnections(page.connections, [...viewports.desktop.requests, ...viewports.mobile.requests], sourceUrl, scannedAt);
  return writeProject(project);
}
