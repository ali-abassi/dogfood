import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { captureProblem, readPng } from './capture.mjs';
import { pageAnswers } from './answers.mjs';
import { changedSinceReview, pageCompletion, pageStatus, scanProblems } from './completion.mjs';
import { capturesDir, dataDir, projectsDir, root } from './paths.mjs';
import { imageDifference } from './diff.mjs';
import { checkedViewportFacts, mergedConnections } from './scans.mjs';
import {
  auditKeys, captureTiers, checkKeys, connectionProvenance, devices, evidenceNote, findingIdPattern,
  httpMethods, idPattern, manifestVersion, notCaptured, rowIdPattern, severities, testFilePattern, verdicts,
} from './schema.mjs';
import { latestVisualReview } from './visual-review.mjs';

const defaultAudit = {
  security: [
    ['inputs', 'Does the server check everything people type before it saves it?'],
    ['private-data', 'Can people see only their own information, even if they change a link?'],
    ['headers', 'Does the page load only the scripts it needs, from places it trusts?'],
  ],
  scraping: [
    ['bulk', 'Is there a limit on how fast one visitor can pull data, so nobody can copy it all?'],
    ['public-copy', 'Can search engines and bots see only what is meant to be public?'],
  ],
  seo: [
    ['title', 'Does the page have its own clear title and a short description for search results?'],
    ['indexing', 'Does the page show up in search only if it is meant to be public?'],
  ],
  accessibility: [
    ['keyboard', 'Can you use everything with only the keyboard, and always see where you are?'],
    ['names', 'Do pictures, fields, and buttons have names a screen reader can read out?'],
    ['contrast', 'Is all text easy to read against its background, in every theme the app has?'],
    ['reflow', 'Does the page still work when zoomed to 200% and on a narrow phone?'],
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

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

// dogfood records the hash of every manifest it writes beside it, so an edit made
// outside dogfood (which skips validation and attribution) is visible afterwards.
function writtenHashFile(id) {
  return join(projectsDir, `.${id}.sha256`);
}

export function manifestIntegrity(id) {
  const hashFile = writtenHashFile(id);
  if (!existsSync(hashFile)) return 'unrecorded';
  const written = readFileSync(hashFile, 'utf8').trim();
  return written === sha256(readFileSync(projectFile(id))) ? 'verified' : 'edited-outside';
}

function atomicWrite(file, content) {
  const temporaryFile = `${file}.${process.pid}.tmp`;
  writeFileSync(temporaryFile, content);
  renameSync(temporaryFile, file);
}

export function writeProject(project) {
  const content = `${JSON.stringify(project, null, 2)}\n`;
  mkdirSync(projectsDir, { recursive: true });
  atomicWrite(projectFile(project.id), content);
  atomicWrite(writtenHashFile(project.id), `${sha256(content)}\n`);
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

// Whether the AI has looked at these screenshots: current, stale (older screenshots), or none.
function aiReviewState({ review, stale }) {
  if (!review) return 'none';
  return stale ? 'stale' : 'current';
}

// Derived fields the app and agents read; never stored in the manifest.
export function pageProgress(project, page) {
  const latest = latestVisualReview(dataDir, project.id, page.id, page.captures);
  const aiReview = aiReviewState(latest);
  const ai = aiReview === 'current' ? { dimensions: latest.review.analysis.dimensions, at: latest.review.analyzedAt } : null;
  const answers = pageAnswers(page, ai);
  const completion = pageCompletion(page, answers);
  return { status: pageStatus(page, answers, completion), answers, aiReview, ...completion, scanProblems: scanProblems(page.scan), changedSinceReview: changedSinceReview(page) };
}

export function projectView(project) {
  const pages = project.pages.map(page => ({ ...page, progress: pageProgress(project, page) }));
  return { ...project, integrity: manifestIntegrity(project.id), pages };
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

function featureSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'feature';
}

function newFeature(input, used, by) {
  const name = text(input?.name, 'Feature name', 1, 120);
  let id = featureSlug(name);
  for (let suffix = 2; used.has(id); suffix += 1) id = `${featureSlug(name)}-${suffix}`;
  used.add(id);
  return { id, name, ...expectedBehavior(input.expected), status: 'untested', note: '', addedBy: by };
}

// Removes a page registered by mistake. Its screenshots, scans, and reviews stay on disk,
// and the manifest keeps who removed it and why.
export function removePage(projectId, pageId, reason, by) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const why = text(reason, 'Reason for removing the page', 12, 400);
  project.pages = project.pages.filter(item => item !== page);
  project.removedPages = [...(project.removedPages ?? []), { id: page.id, name: page.name, route: page.route, reason: why, by, at: new Date().toISOString() }];
  return writeProject(project);
}

function appendFeatures(page, features, by) {
  assertCount(features, `Features to add to ${page.id}`, 1, 20);
  const names = new Set(page.features.map(item => item.name.toLowerCase()));
  const used = new Set(page.features.map(item => item.id));
  const fresh = features.filter(item => !names.has(String(item?.name).trim().toLowerCase()));
  page.features.push(...fresh.map(item => newFeature(item, used, by)));
}

// Adds features, for example ones the AI review suggested; names already listed are skipped.
export function addFeatures(projectId, pageId, features, by) {
  return updatePage(projectId, pageId, page => appendFeatures(page, features, by));
}

// Adds features to many pages in one write: { pageId: [{ name, expected }] }. All pages
// are checked before anything is saved.
export function addFeaturesToPages(projectId, featuresByPage, by) {
  const project = readProject(projectId);
  const entries = Object.entries(featuresByPage ?? {});
  if (!entries.length) throw validationError('Choose at least one feature to add.');
  for (const [pageId, features] of entries) appendFeatures(pageById(project, pageId), features, by);
  return writeProject(project);
}


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
  const note = input.untestedNote === undefined ? page.qa.note : text(input.untestedNote, 'Untested boundary note', 12, 600);
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

// Keeps the replaced screenshot in history so earlier evidence is not lost, and says where.
function storeCaptureFile(projectId, name, source) {
  const directory = join(capturesDir, projectId);
  const target = join(directory, `${name}.png`);
  const archived = `history/${name}-${Date.now()}.png`;
  mkdirSync(join(directory, 'history'), { recursive: true });
  const replaced = existsSync(target);
  if (replaced) renameSync(target, join(directory, archived));
  copyFileSync(source, target);
  return { path: `/captures/${projectId}/${name}.png`, archived: replaced ? `/captures/${projectId}/${archived}` : null };
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
  const { path, archived } = storeCaptureFile(projectId, captureName(pageId, input.device), file);
  const capture = { path, ...provenance, capturedAt: new Date().toISOString(), tier: input.tier, state: 'rendered', fullPage: input.fullPage, pixelWidth: image.width, pixelHeight: image.height, sha256: image.sha256 };
  return { capture, archived };
}

export function recordCapture(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const device = checkedDevice(input?.device);
  page.captures[device] = input.blockedReason ? blockedCapture(input) : renderedCapture(projectId, pageId, input).capture;
  return writeProject(project);
}

// How the new screenshot differs from the one it replaced, with a diff image of where.
// Null when there was no earlier rendered screenshot to compare against.
function visualChange(projectId, name, previous, archived) {
  if (previous.state !== 'rendered' || !archived) return null;
  const difference = imageDifference(readFileSync(join(dataDir, archived)), readFileSync(join(capturesDir, projectId, `${name}.png`)));
  mkdirSync(join(capturesDir, projectId, 'diffs'), { recursive: true });
  writeFileSync(join(capturesDir, projectId, 'diffs', `${name}.png`), difference.png);
  return {
    previousPath: archived, previousSha256: previous.sha256, diffPath: `/captures/${projectId}/diffs/${name}.png`,
    changedShare: Math.round(difference.changedShare * 10_000) / 10_000, sizeChanged: difference.sizeChanged, changed: difference.changed,
  };
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
  const changes = {};
  for (const device of devices) {
    const previous = page.captures[device];
    const { capture, archived } = renderedCapture(projectId, pageId, { ...input[device], device, sourceUrl, actor: input.actor, tier: input.tier, fullPage: true });
    page.captures[device] = capture;
    changes[device] = visualChange(projectId, captureName(pageId, device), previous, archived);
  }
  page.scan = scanRecord(page, sourceUrl, viewports, changes);
  page.connections = mergedConnections(page.connections, [...viewports.desktop.requests, ...viewports.mobile.requests], sourceUrl, page.scan.scannedAt);
  return writeProject(project);
}

// lastChangedAt carries forward, so a quiet rescan does not hide an earlier visual change.
function scanRecord(page, sourceUrl, viewports, changes) {
  const scannedAt = new Date().toISOString();
  const captureSha256 = Object.fromEntries(devices.map(device => [device, page.captures[device].sha256]));
  const changed = devices.some(device => changes[device]?.changed);
  const lastChangedAt = changed ? scannedAt : page.scan?.lastChangedAt ?? null;
  return { scannedAt, sourceUrl, actor: page.captures.desktop.actor, captureSha256, viewports, changes, lastChangedAt };
}
