import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { captureProblem, readPng } from './capture.mjs';
import { pageAnswers } from './answers.mjs';
import { changedSinceReview, pageAcceptance, pageCompletion, pageStatus, scanProblems } from './completion.mjs';
import { capturesDir, dataDir, projectsDir, root } from './paths.mjs';
import { imageDifference } from './diff.mjs';
import { checkedViewportFacts, mergedConnections } from './scans.mjs';
import {
  auditKeys, captureTiers, checkKeys, connectionProvenance, defaultSignedOutMarkers, devices, evidenceNote,
  findingIdPattern, httpMethods, idPattern, manifestVersion, notCaptured, rowIdPattern, scanEnvironments, severities, testFilePattern, verdicts,
} from './schema.mjs';
import { latestVisualReview } from './visual-review.mjs';
import { checkoutRevision } from './revision.mjs';
import { auditEvidence, auditRowFresh, carryAuditEvidence, measuredAnswers, validAuditDependencies } from './audit-evidence.mjs';

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

// The version each loaded project was read at, so a write can refuse to overwrite a newer one (several agents and
// the server write the same manifest; a plain read-modify-write silently dropped whichever change landed first).
const readVersions = new WeakMap();

export function readProject(id) {
  const file = projectFile(id);
  if (!existsSync(file)) throw Object.assign(new Error(`Project ${id} does not exist.`), { status: 404 });
  const content = readFileSync(file, 'utf8');
  const project = JSON.parse(content);
  readVersions.set(project, sha256(content));
  return project;
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

const pause = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
const staleLockMs = 10_000;

function tryLock(lock) {
  try {
    closeSync(openSync(lock, 'wx'));
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (Date.now() - statSync(lock, { throwIfNoEntry: false })?.mtimeMs > staleLockMs) rmSync(lock, { force: true });
    return false;
  }
}

// A short exclusive lock around compare-and-write; a lock left by a crashed writer expires after ten seconds.
function withLock(file, action) {
  const lock = `${file}.lock`;
  for (let attempt = 0; !tryLock(lock); attempt += 1) {
    if (attempt > 250) throw Object.assign(new Error('The project is busy; try again.'), { status: 503 });
    pause(20);
  }
  try {
    return action();
  } finally {
    rmSync(lock, { force: true });
  }
}

function staleProject(project, file) {
  const readAt = readVersions.get(project);
  return Boolean(readAt) && existsSync(file) && sha256(readFileSync(file, 'utf8')) !== readAt;
}

export function writeProject(project, { createOnly = false } = {}) {
  const content = `${JSON.stringify(project, null, 2)}\n`;
  mkdirSync(projectsDir, { recursive: true });
  const file = projectFile(project.id);
  return withLock(file, () => {
    if (createOnly && existsSync(file)) throw Object.assign(validationError(`Project ${project.id} already exists.`), { code: 'PROJECT_EXISTS' });
    if (staleProject(project, file)) throw Object.assign(new Error('The project changed since it was read; reload and try again.'), { status: 409, code: 'STALE_PROJECT' });
    atomicWrite(file, content);
    atomicWrite(writtenHashFile(project.id), `${sha256(content)}\n`);
    readVersions.set(project, sha256(content));
    return project;
  });
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
function sourceRevision(project) {
  return project.source.checkout ? checkoutRevision(resolve(root, project.source.checkout)) : null;
}

function revisionFingerprint(revision) {
  return revision ? revision.fingerprint : null;
}

function positiveEntries(page, answerId) {
  const groups = {
    design: [page.checks.design], purpose: [page.checks.purpose],
    ease: [page.checks.ease, ...page.audit.accessibility],
    safety: [...page.audit.security, ...page.audit.scraping],
    speed: page.audit.seo, works: page.features,
  };
  return (answerId ? groups[answerId] : Object.values(groups).flat()).filter(entry => entry.status === 'pass');
}

function staleEntry(entry, changedAt, fingerprint) {
  return (Number.isFinite(changedAt) && !(Date.parse(entry.at) >= changedAt))
    || (fingerprint && entry.fingerprint && entry.fingerprint !== fingerprint);
}

function stalePositive(page, revision, answerId) {
  const changedAt = Date.parse(page.scan?.lastChangedAt);
  return positiveEntries(page, answerId).some(entry => entry.question
    ? !auditRowFresh(page, entry, revision?.fingerprint) : staleEntry(entry, changedAt, revision?.fingerprint));
}

function freshAnswers(page, ai, revision) {
  return pageAnswers(page, ai).map(answer => answer.status === 'pass' && stalePositive(page, revision, answer.id)
    ? { ...answer, status: 'recheck', summary: 'The page changed after this review. Check it again.' } : answer);
}

function evidenceProvenance(project, page, revision) {
  if (page.scan?.environment === 'live') return liveDeploymentCurrent(project, page);
  return localEvidenceProvenance(project, page, revision);
}

function localEvidenceProvenance(project, page, revision) {
  if (!project.source.checkout) return true;
  return servesCheckout(project.source) && pageUsesCheckoutOrigin(project, page) && checkoutEvidenceCurrent(page, revision);
}

function pageUsesCheckoutOrigin(project, page) {
  if (!project.source.url) return false;
  return new URL(expectedPageUrl(project, page)).origin === new URL(project.source.url).origin;
}

function checkoutEvidenceCurrent(page, revision) {
  const fingerprint = revisionFingerprint(revision);
  if (!fingerprint) return false;
  if (!scanHasFingerprint(page.scan, fingerprint)) return false;
  if (devices.some(device => page.captures[device].fingerprint !== fingerprint)) return false;
  return positiveEntries(page).every(entry => entry.question ? auditRowFresh(page, entry, fingerprint) : entry.fingerprint === fingerprint);
}

export function servesCheckout(source) {
  if (source.servesCheckout !== undefined) return source.servesCheckout === true;
  if (!source.url) return false;
  const host = new URL(source.url).hostname;
  return /^(localhost|[a-z0-9-]+\.localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(host);
}

function scanHasFingerprint(scan, fingerprint) {
  return Boolean(scan) && scan.fingerprint === fingerprint;
}

function currentEnvironment(project, page) {
  if (page.scan?.environment === 'live') return liveDeploymentCurrent(project, page);
  const expected = expectedPageUrl(project, page);
  return Boolean(expected && page.scan?.sourceUrl === expected);
}

function acceptanceProgress(project, page, answers, completion, provenance) {
  const acceptance = pageAcceptance(page, answers, completion);
  const environment = currentEnvironment(project, page);
  const acceptanceRequirements = [
    ...acceptance.requirements,
    { id: 'provenance', label: 'Declared checkout evidence', met: provenance, missing: provenanceGap(project, page) },
    { id: 'environment', label: 'Current environment', met: environment, missing: 'Check this page at its current project or page URL.' },
  ];
  return { accepted: acceptance.accepted && provenance && environment, acceptanceRequirements };
}

function provenanceGap(project, page) {
  if (!servesCheckout(project.source)) return 'This environment is not declared to serve the checkout; check a local build or record the deployed revision.';
  if (!pageUsesCheckoutOrigin(project, page)) return 'This page is outside the declared checkout environment; check it at the project origin or record its deployed revision.';
  return 'Recheck the current checkout and record fresh evidence for every Good verdict.';
}

export function pageProgress(project, page, revision = sourceRevision(project)) {
  const latest = latestVisualReview(dataDir, project.id, page.id, page.captures);
  const aiReview = aiReviewState(latest);
  const ai = aiReview === 'current' ? { dimensions: latest.review.analysis.dimensions, at: latest.review.analyzedAt } : null;
  const answerRevision = pageEvidenceRevision(page, revision);
  const answers = freshAnswers(page, ai, answerRevision);
  const auditAnswers = freshAnswers(page, ai, null);
  const completion = pageCompletion(page, auditAnswers);
  const provenance = evidenceProvenance(project, page, revision);
  return { status: pageStatus(page, answers, completion), answers, aiReview, checkoutFingerprint: revisionFingerprint(revision), ...completion,
    ...acceptanceProgress(project, page, answers, completion, provenance),
    staleCount: progressStaleCount(completion, answers),
    scanProblems: scanProblems(page.scan), changedSinceReview: changedSinceReview(page) || stalePositive(page, revision) };
}

function pageEvidenceRevision(page, revision) {
  return page.scan?.environment === 'live' ? null : revision;
}

function progressStaleCount(completion, answers) {
  return Math.max(completion.staleCount ?? 0, answers.filter(answer => answer.status === 'recheck').length);
}

// A core feature is one of the product's main capabilities, mapped to the pages that deliver it. Its status rolls
// up from those pages: any page needing work or blocked makes it need work, all pages good makes it good, and
// anything checked in between is partly checked.
function coreFeatureStatus(pages) {
  const statuses = pages.map(page => page.progress.status);
  if (statuses.some(status => status === 'needs_work' || status === 'blocked')) return 'needs_work';
  if (statuses.length && statuses.every(status => status === 'pass')) return 'pass';
  return statuses.some(status => status !== 'untested') ? 'in_review' : 'untested';
}

export function projectView(project) {
  const revision = sourceRevision(project);
  const pages = project.pages.map(page => ({ ...page, measuredAnswers: measuredAnswers(page), progress: pageProgress(project, page, revision) }));
  const coreFeatures = (project.coreFeatures ?? []).map(feature => ({
    ...feature, status: coreFeatureStatus(pages.filter(page => feature.pageIds.includes(page.id))),
  }));
  return { ...project, integrity: manifestIntegrity(project.id), pages, coreFeatures };
}

function coreFeaturePages(input, pageIds) {
  const ids = Array.isArray(input.pageIds) ? input.pageIds : [];
  if (!ids.length) throw validationError(`Core feature ${input.id} needs at least one page.`);
  const unknown = ids.find(id => !pageIds.has(id));
  if (unknown) throw validationError(`Core feature ${input.id} names page ${unknown}, which is not in this project.`);
  return ids;
}

function coreFeature(input, pageIds) {
  if (!idPattern.test(input?.id ?? '')) throw validationError('Each core feature needs an id of lowercase letters, numbers and dashes.');
  const summary = text(input.summary ?? '', 'Core feature summary', 0, 240);
  return { id: input.id, name: text(input.name, 'Core feature name', 2, 80), summary, pageIds: coreFeaturePages(input, pageIds) };
}

// Replaces the project's list of core features, in the order given.
export function setCoreFeatures(projectId, features, by) {
  if (!Array.isArray(features) || features.length > 40) throw validationError('Give a list of up to 40 core features.');
  const project = readProject(projectId);
  const pageIds = new Set(project.pages.map(page => page.id));
  const list = features.map(feature => coreFeature(feature, pageIds));
  if (new Set(list.map(feature => feature.id)).size !== list.length) throw validationError('Core feature ids must be unique.');
  project.coreFeatures = list;
  project.coreFeaturesUpdated = { by, at: new Date().toISOString() };
  return writeProject(project);
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

// Records who checked a verdict and when; repeated verdicts refresh their evidence.
function stampedVerdict(previous, value, label, by, revision) {
  const next = verdict(value, label);
  const fingerprint = revisionFingerprint(revision);
  if (next.status === 'untested' && previous.status === 'untested' && previous.note === next.note) return previous;
  const provenance = fingerprint ? { fingerprint } : {};
  const result = { ...previous, ...next, by, at: new Date().toISOString(), ...provenance };
  return verdictFingerprint(result, fingerprint);
}

function verdictFingerprint(result, fingerprint) {
  if (!fingerprint) delete result.fingerprint;
  return result;
}

// Re-reads and re-applies the change when another writer got there first, so concurrent updates both land.
function updatePage(projectId, pageId, change, attempts = 5) {
  const project = readProject(projectId);
  change(pageById(project, pageId), project);
  try {
    return writeProject(project);
  } catch (error) {
    if (error.code !== 'STALE_PROJECT' || attempts <= 1) throw error;
    return updatePage(projectId, pageId, change, attempts - 1);
  }
}

// Partial verdict updates for agents: only the entries named in the input change.
export function recordVerdicts(projectId, pageId, input, by) {
  return updatePage(projectId, pageId, (page, project) => {
    const revision = verdictRevision(project, page);
    assertExpectedFingerprint(input, revision);
    recordChecks(page, input.checks ?? {}, by, revision);
    page.features = updatedFeatures(page, input.features ?? [], by, revision);
    recordAudit(page, input.audit ?? {}, by, revision);
  });
}

function verdictRevision(project, page) {
  return page.scan?.environment === 'live' ? null : sourceRevision(project);
}

function recordChecks(page, checks, by, revision) {
  for (const [key, value] of Object.entries(checks)) {
    if (!checkKeys.includes(key)) throw validationError(`Unknown quality check: ${key}.`);
    page.checks[key] = stampedVerdict(page.checks[key], value, key, by, revision);
  }
}

function recordAudit(page, audit, by, revision) {
  for (const [key, rows] of Object.entries(audit)) {
    if (!auditKeys.includes(key)) throw validationError(`Unknown checklist: ${key}.`);
    assertKnownRows(page.audit[key], rows, `${key} question`);
    page.audit[key] = page.audit[key].map(row => {
      const update = rows.find(item => item.id === row.id);
      return update ? stampedAudit(page, key, row, update, by, revision) : row;
    });
  }
}

function assertKnownRows(current, updates, label) {
  if (!Array.isArray(updates)) throw validationError(`${label} updates must be a list.`);
  const unknown = updates.find(update => !current.some(row => row.id === update?.id));
  if (unknown) throw validationError(`${label} ${unknown.id} does not exist on this page.`);
}

function stampedAudit(page, key, previous, value, by, revision) {
  const row = stampedVerdict(previous, value, previous.question || key, by, revision);
  delete row.carriedFrom;
  if (value.dependsOn !== undefined) row.dependsOn = checkedDependencies(value.dependsOn);
  row.evidence = auditEvidence(page, key, row, revisionFingerprint(revision));
  return row;
}

function checkedDependencies(value) {
  if (!validAuditDependencies(value)) throw validationError('Audit dependsOn must name 1–20 supported evidence dependencies.');
  return [...new Set(value)];
}

function updatedFeatures(page, updates, by, revision) {
  assertKnownRows(page.features, updates, 'Feature');
  return page.features.map(row => {
    const update = updates.find(item => item.id === row.id);
    return update ? stampedFeature(page, row, update, by, revision) : row;
  });
}

function pendingLiveDebt(feature) {
  return feature.liveDebt?.state === 'pending';
}

function stampedFeature(page, previous, value, by, revision) {
  if (value.status === 'awaiting_live') return awaitingFeature(previous, value, by);
  if (value.status === 'pass') assertFeatureProof(page, previous);
  const row = stampedVerdict(previous, value, previous.name, by, revision);
  if (row.status === 'pass' && pendingLiveDebt(previous)) verifyLiveDebt(page, row, by);
  return row;
}

function assertFeatureProof(page, feature) {
  if (!feature.liveDebt || feature.liveDebt.state === 'verified') return;
  if (!pendingLiveDebt(feature)) throw validationError('Record the deployment before closing this live proof.');
  assertLiveVerification(page, feature);
}

function verifyLiveDebt(page, row, by) {
  row.liveDebt = { ...row.liveDebt, state: 'verified', verifiedAt: row.at, verifiedBy: by,
    scan: { scannedAt: page.scan.scannedAt, sourceUrl: page.scan.sourceUrl, environment: page.scan.environment } };
}

function awaitingFeature(previous, value, by) {
  if (previous.requiresLive !== true) throw validationError('Only features declared requiresLive may await deployment proof.');
  if (previous.liveDebt?.state === 'pending') throw validationError('This feature was deployed; check its pending live proof.');
  const note = text(value.note, 'Live verification reason', evidenceNote.minimum, evidenceNote.maximum);
  const at = new Date().toISOString();
  return { ...previous, status: 'awaiting_live', note, by, at, liveDebt: { state: 'awaiting_deploy', reason: note, by, at } };
}

function assertLiveVerification(page, feature) {
  const scan = page.scan;
  if (!scan || scan.environment !== 'live') throw validationError('Pending deployment proof needs a fresh live scan.');
  if (!(Date.parse(scan.scannedAt) > Date.parse(feature.liveDebt.activatedAt))) throw validationError('The live scan must be later than the recorded deployment.');
  if (scan.sourceUrl !== feature.liveDebt.expectedUrl) throw validationError('Scan the page at its recorded deployment URL before verifying.');
  assertPassedScanAttempt(page);
  assertRoleContext(page, scan);
}

function assertPassedScanAttempt(page) {
  if (page.scanAttempt?.status !== 'passed') throw validationError('The latest live scan did not pass.');
}

export function acceptMeasuredAnswers(projectId, pageId, by) {
  return updatePage(projectId, pageId, (page, project) => {
    const revision = verdictRevision(project, page);
    assertMeasuredCurrent(project, page, revision);
    for (const candidate of measuredAnswers(page)) {
      acceptCandidate(page, candidate, by, revision);
    }
  });
}

function assertMeasuredCurrent(project, page, revision) {
  if (!page.scan || page.scanAttempt?.status !== 'passed') throw validationError('A successful current scan is required before accepting measurements.');
  if (page.scan.environment === 'live') return;
  assertMeasuredCheckout(project, page, revision);
}

function assertMeasuredCheckout(project, page, revision) {
  if (!project.source.checkout || !servesCheckout(project.source)) return;
  if (!scanHasFingerprint(page.scan, revisionFingerprint(revision))) throw validationError('The checkout changed after the scan. Rescan before accepting measurements.');
}

function acceptCandidate(page, candidate, by, revision) {
  const rows = page.audit[candidate.key];
  const previous = rows.find(row => row.id === candidate.id) ?? { id: candidate.id, question: candidate.question, dependsOn: candidate.dependsOn, status: 'untested', note: '' };
  const row = { ...stampedAudit(page, candidate.key, previous, candidate, by, revision), verifiedBy: 'scan', measuredAt: page.scan.scannedAt };
  const index = rows.findIndex(item => item.id === candidate.id);
  if (index < 0) rows.push(row);
  else rows[index] = row;
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

function checkedAuditList(page, input, current, label, by, revision) {
  return uniqueRows(input, label, 1, 30).map(row => {
    const previous = current.find(item => item.id === row.id) ?? { status: 'untested', note: '' };
    const question = text(row.question, `${label} question`, 1, 220);
    return { ...stampedAudit(page, label, { ...previous, question }, row, by, revision), id: row.id, question }; 
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

// Moves a page to a new address (an app served from a new port, say) without re-registering its plan.
// The Chrome profile scans sign in with. A signed-in page whose saved session expired is fixed by pointing its scans
// at a profile that is still signed in, never by typing a password.
export function setBrowserProfile(projectId, browserProfile) {
  const project = readProject(projectId);
  project.source.browserProfile = text(browserProfile, 'Browser profile', 1, 100);
  return writeProject(project);
}

export function setPageUrl(projectId, pageId, url) {
  return updatePage(projectId, pageId, page => { page.url = httpUrl(url, 'Page URL'); });
}

export function setConnections(projectId, pageId, connections) {
  return updatePage(projectId, pageId, page => {
    page.connections = uniqueRows(connections, 'Connections', 1, 80).map(checkedConnection);
  });
}

export function saveAudit(projectId, pageId, input, by) {
  return updatePage(projectId, pageId, (page, project) => {
    const revision = verdictRevision(project, page);
    page.audit = Object.fromEntries(auditKeys.map(key => [key, checkedAuditList(page, input?.audit?.[key], page.audit[key], key, by, revision)]));
    if (input.connections !== undefined) page.connections = uniqueRows(input.connections, 'Connections', 0, 80).map(checkedConnection);
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

// A checkout starts planning before an app URL exists.
function projectLocation(input) {
  if (!input.url && !input.checkout) throw validationError('A product URL or local checkout is required.');
  return { url: input.url ? httpUrl(input.url, 'Product URL') : null, environment: input.url ? 'Live site' : 'Local' };
}

function setCheckoutMapping(source, value) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') throw validationError('servesCheckout must be boolean.');
  source.servesCheckout = value;
}

function projectSource(input) {
  const location = projectLocation(input);
  const source = { ...location, environment: text(input.environment ?? location.environment, 'Environment', 1, 200) };
  setCheckoutMapping(source, input.servesCheckout);
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

function checkedMarkers(value) {
  if (value === undefined) return [...defaultSignedOutMarkers];
  if (!Array.isArray(value) || !value.length || value.length > 20) throw validationError('Signed-out markers must have 1–20 entries.');
  return value.map(item => text(item, 'Signed-out marker', 1, 100));
}

export function createProject(input) {
  const id = newProjectId(input?.id);
  return writeProject({
    version: manifestVersion,
    id,
    name: text(input.name, 'Project name', 1, 100),
    description: text(input.description ?? `Plan, build and check ${input.name}.`, 'Project description', 1, 400),
    source: projectSource(input),
    guidelines: (input.guidelines ?? []).map(item => text(item, 'Guideline', 1, 300)),
    signedOutMarkers: checkedMarkers(input.signedOutMarkers),
    ...(input.fixtureSetup ? { fixtureSetup: checkedFixtureSetup(input.fixtureSetup) } : {}),
    pages: [],
  }, { createOnly: true });
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
    return editedFeature({ ...rest, id: row.id, expected }, row);
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
  return { id, name, ...expectedBehavior(input.expected), ...featureLiveRequirement(input.requiresLive), status: 'untested', note: '', addedBy: by };
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

// Retires a feature the page no longer has (the UI it tested was redesigned away), so the gate stops waiting on it.
// The manifest keeps the feature, its last verdict, who retired it, and why.
export function retireFeature(projectId, pageId, featureId, reason, by) {
  const why = text(reason, 'Reason for retiring the feature', 12, 400);
  return updatePage(projectId, pageId, page => {
    const feature = page.features.find(item => item.id === featureId);
    if (!feature) throw validationError(`Feature ${featureId} does not exist on ${pageId}.`);
    page.features = page.features.filter(item => item !== feature);
    page.retiredFeatures = [...(page.retiredFeatures ?? []), { ...feature, reason: why, by, at: new Date().toISOString() }];
  });
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

// Whether the page needs a signed-in visitor. A scan of one that lands signed out fails its
// captures instead of passing as the page.
function pageSignedIn(value, current) {
  if (value === undefined) return current === undefined ? {} : { signedIn: current };
  if (typeof value !== 'boolean') throw validationError('Signed-in registration must be true or false.');
  return { signedIn: value };
}

// The HTTP status the page itself is meant to answer with (a not-found page answers 404), so a scan does not count its
// own document as a failed request.
const isHttpStatus = value => Number.isInteger(value) && value >= 200 && value <= 599;

function pageExpectedStatus(value, current) {
  if (value === undefined) return current === undefined ? {} : { expectedStatus: current };
  if (!isHttpStatus(value)) throw validationError('Expected status must be an HTTP status from 200 to 599.');
  return { expectedStatus: value };
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
    ...pageSignedIn(input.signedIn, page.signedIn),
    ...pageExpectedStatus(input.expectedStatus, page.expectedStatus),
    ...pagePrerequisites(input, page),
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

function renderedCapture(projectId, pageId, input, revision) {
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
  const capture = { path, ...provenance, capturedAt: new Date().toISOString(), tier: input.tier, state: 'rendered', fullPage: input.fullPage, pixelWidth: image.width, pixelHeight: image.height, sha256: image.sha256,
    ...(revision?.fingerprint ? { fingerprint: revision.fingerprint } : {}) };
  return { capture, archived };
}

export function recordCapture(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const device = checkedDevice(input?.device);
  const revision = sourceRevision(project);
  assertExpectedFingerprint(input, revision);
  page.captures[device] = input.blockedReason ? blockedCapture(input) : renderedCapture(projectId, pageId, input, revision).capture;
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
// The capture files are written once; the record is applied through updatePage, so a scan racing other writers
// (lanes recording verdicts) retries its write instead of failing.
export function recordScan(projectId, pageId, input) {
  const project = readProject(projectId);
  const page = pageById(project, pageId);
  const revision = input.environment === 'live' ? null : sourceRevision(project);
  const context = checkedScanContext(input);
  assertRoleContext(page, context);
  assertExpectedFingerprint(input, revision);
  assertCurrentScanUrl(input, project, page);
  const sourceUrl = httpUrl(input?.sourceUrl, 'Scanned URL');
  const viewports = Object.fromEntries(devices.map(device => [device, checkedViewportFacts(input[device]?.facts)]));
  devices.forEach(device => importedImage(text(input[device]?.file, `${device} screenshot file`, 1, 1000)));
  const captures = {};
  const changes = {};
  for (const device of devices) {
    const { capture, archived } = renderedCapture(projectId, pageId, { ...input[device], device, sourceUrl, actor: input.actor, tier: input.tier, fullPage: true }, revision);
    captures[device] = capture;
    changes[device] = visualChange(projectId, captureName(pageId, device), page.captures[device], archived);
  }
  return updatePage(projectId, pageId, (current, latest) => {
    assertExpectedFingerprint(input, input.environment === 'live' ? null : sourceRevision(latest));
    assertCurrentScanUrl(input, latest, current);
    assertRoleContext(current, context);
    const previousScan = current.scan;
    Object.assign(current.captures, captures);
    current.scan = { ...scanRecord(current, sourceUrl, viewports, changes, revision), ...context };
    carryAuditEvidence(current, previousScan, revisionFingerprint(revision));
    current.scanAttempt = { status: 'passed', at: current.scan.scannedAt };
    current.connections = mergedConnections(current.connections, [...viewports.desktop.requests, ...viewports.mobile.requests], sourceUrl, current.scan.scannedAt);
  });
}

function assertExpectedFingerprint(input, revision) {
  if (!Object.hasOwn(input, 'checkoutFingerprint')) return;
  if (input.checkoutFingerprint !== revisionFingerprint(revision)) throw new Error('The checkout changed during its page check. Check it again.');
}

function assertCurrentScanUrl(input, project, page) {
  if (input.environment === 'live') return assertLiveScanUrl(input, page);
  if (!Object.hasOwn(input, 'checkoutFingerprint')) return;
  const expected = expectedPageUrl(project, page);
  if (expected && input.sourceUrl !== expected) throw new Error('The page URL changed during its check. Check it again.');
}

function expectedPageUrl(project, page) {
  if (page.url) return page.url;
  return project.source.url ? new URL(page.route, project.source.url).href : null;
}

// lastChangedAt carries forward, so a quiet rescan does not hide an earlier visual change.
function scanRecord(page, sourceUrl, viewports, changes, revision) {
  const scannedAt = new Date(Math.max(Date.now(), Date.parse(page.scan?.scannedAt) + 1 || 0)).toISOString();
  const captureSha256 = Object.fromEntries(devices.map(device => [device, page.captures[device].sha256]));
  const changed = devices.some(device => changes[device]?.changed);
  const lastChangedAt = changed ? scannedAt : previousChange(page.scan);
  const fingerprint = revisionFingerprint(revision);
  const provenance = fingerprint ? { fingerprint } : {};
  return { scannedAt, sourceUrl, actor: page.captures.desktop.actor, captureSha256, viewports, changes, lastChangedAt, ...provenance };
}

function previousChange(scan) {
  return scan ? scan.lastChangedAt : null;
}

export function recordScanAttempt(projectId, pageId, status, reason = '') {
  return updatePage(projectId, pageId, page => {
    page.scanAttempt = { status, at: new Date().toISOString(), ...(reason ? { reason: String(reason).slice(0, 600) } : {}) };
  });
}

function featureLiveRequirement(value) {
  if (value === undefined) return {};
  if (typeof value !== 'boolean') throw validationError('requiresLive must be boolean.');
  return { requiresLive: value };
}

function editedFeature(previous, input, by) {
  const expected = input.expected === undefined ? previous.expected : input.expected;
  const feature = { ...previous, name: text(input.name ?? previous.name, 'Feature name', 1, 120), ...featureLiveRequirement(input.requiresLive) };
  delete feature.expected;
  Object.assign(feature, expectedBehavior(expected));
  if (!previous.name) return feature;
  return materialFeatureChange(previous, feature) ? invalidatedFeature(previous, feature, by) : feature;
}

function materialFeatureChange(previous, feature) {
  return previous.expected !== feature.expected || previous.requiresLive !== feature.requiresLive;
}

function featureHistory(previous) {
  return { status: previous.status, note: previous.note, expected: previous.expected ?? null, requiresLive: previous.requiresLive ?? false,
    ...featureHistoryAttribution(previous) };
}

function featureHistoryAttribution(previous) {
  return { by: previous.by ?? null, at: previous.at ?? null, liveDebt: previous.liveDebt ?? null };
}

function invalidatedFeature(previous, feature, by) {
  const history = [...(previous.history ?? []), featureHistory(previous)];
  const result = { ...feature, history, status: 'untested', note: '', editedBy: by ?? 'registration', editedAt: new Date().toISOString() };
  delete result.by;
  delete result.at;
  delete result.fingerprint;
  if (feature.requiresLive !== true) delete result.liveDebt;
  return result;
}

export function updateFeature(projectId, pageId, featureId, input, by) {
  return updatePage(projectId, pageId, page => {
    const index = page.features.findIndex(feature => feature.id === featureId);
    if (index < 0) throw validationError(`Feature ${featureId} does not exist on ${pageId}.`);
    page.features[index] = editedFeature(page.features[index], input, by);
  });
}

function deploymentReceipt(input, by) {
  const at = new Date().toISOString();
  const id = input.id === undefined ? `deploy-${Date.now()}` : text(input.id, 'Deployment ID', 1, 100);
  return { id, url: httpUrl(input.url, 'Deployment URL'), by, at,
    ...(input.revision ? { revision: text(input.revision, 'Deployed revision', 1, 200) } : {}),
    ...(input.note ? { note: text(input.note, 'Deployment note', 1, 1200) } : {}) };
}

function deployedPageUrl(page, receipt) {
  // Exact query/hash paths stay intact when the origin changes.
  if (page.url) {
    const current = new URL(page.url);
    return `${new URL(receipt.url).origin}${current.href.slice(current.origin.length)}`;
  }
  return new URL(page.route, receipt.url).href;
}

function activateLiveDebt(page, feature, receipt) {
  if (!feature.liveDebt || feature.liveDebt.state === 'verified') return;
  feature.status = 'untested';
  feature.note = '';
  feature.liveDebt = { ...feature.liveDebt, state: 'pending', deploymentId: receipt.id, activatedAt: receipt.at, expectedUrl: deployedPageUrl(page, receipt) };
}

export function recordDeployment(projectId, input, by) {
  const project = readProject(projectId);
  const receipt = deploymentReceipt(input, by);
  project.deployments ??= [];
  if (project.deployments.some(item => item.id === receipt.id)) throw validationError('Deployment ID already exists.');
  project.deployments.push(receipt);
  for (const page of project.pages) {
    for (const feature of page.features) activateLiveDebt(page, feature, receipt);
  }
  return writeProject(project);
}

function optionalName(value, label) {
  return value == null ? null : text(value, label, 1, 100);
}

function checkedFixtures(value) {
  if (value == null) return null;
  const fixtures = typeof value === 'string' ? [value] : value;
  assertCount(fixtures, 'Fixtures', 0, 20);
  return fixtures.map(value => text(value, 'Fixture name', 1, 100));
}

function checkedRoleProof(value) {
  if (value === undefined) return {};
  if (value === null) return { roleProof: null };
  return { roleProof: { selector: text(value.selector, 'Role selector', 1, 300), expectedText: text(value.expectedText, 'Expected role text', 1, 200) } };
}

function pagePrerequisites(input, page) {
  return {
    ...(input.requiredRole !== undefined ? { requiredRole: optionalName(input.requiredRole, 'Required role') } : {}),
    ...(input.fixture !== undefined ? { fixture: checkedFixtures(input.fixture) } : {}),
    ...checkedRoleProof(input.roleProof === undefined ? page.roleProof : input.roleProof),
  };
}

function checkedFixtureSetup(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw validationError('Fixture setup must be a map.');
  return Object.fromEntries(Object.entries(input).map(([name, setup]) => [text(name, 'Fixture name', 1, 100), checkedFixture(setup)]));
}

function fixtureDirectory(value) {
  if (value === undefined) return {};
  const cwd = text(value, 'Fixture directory', 1, 300);
  if (cwd.startsWith('/') || cwd.split('/').includes('..')) throw validationError('Fixture directory must stay in the checkout.');
  return { cwd };
}

function fixtureTimeout(value) {
  if (value === undefined) return {};
  if (!Number.isInteger(value) || value < 1 || value > 60_000) throw validationError('Fixture timeout must be 1–60000ms.');
  return { timeoutMs: value };
}

function checkedFixture(input) {
  assertCount(input?.argv, 'Fixture command argv', 1, 30);
  return { argv: input.argv.map(arg => text(arg, 'Fixture argument', 1, 1000)), ...fixtureDirectory(input.cwd), ...fixtureTimeout(input.timeoutMs) };
}

function checkedScanContext(input) {
  const environment = input.environment ?? 'local';
  if (!scanEnvironments.has(environment)) throw validationError('Scan environment must be local, live or mock.');
  return { environment, requiredRole: optionalName(input.requiredRole, 'Required role'), verifiedRole: optionalName(input.verifiedRole, 'Verified role'), fixture: checkedFixtures(input.fixture), browserProfile: optionalName(input.browserProfile, 'Browser profile'), ...checkedRoleProof(input.roleProof) };
}

function assertLiveScanUrl(input, page) {
  if (!input.liveUrl) {
    if (input.configuredSourceUrl !== input.sourceUrl) throw validationError('A live scan must declare its target liveUrl or configuredSourceUrl.');
    return;
  }
  const expected = deployedPageUrl(page, { url: httpUrl(input.liveUrl, 'Live URL') });
  if (input.sourceUrl !== expected) throw validationError('Live scan URL does not match the page at its declared live target.');
}

function assertRoleContext(page, context) {
  if (!page.requiredRole) return;
  if (context.requiredRole !== page.requiredRole || context.verifiedRole !== page.requiredRole) throw validationError(`Scan requires verified role ${page.requiredRole}; check the correct browser profile.`);
}

function liveDeploymentCurrent(project, page) {
  const deployment = project.deployments?.at(-1);
  if (!deployment) return false;
  return page.scan.sourceUrl === deployedPageUrl(page, deployment) && Date.parse(page.scan.scannedAt) > Date.parse(deployment.at);
}

export function setFixtureSetup(projectId, fixtureSetup, by) {
  const project = readProject(projectId);
  const actor = text(by, 'Fixture setup actor', 1, 120);
  const next = checkedFixtureSetup(fixtureSetup);
  project.fixtureSetupHistory = [...(project.fixtureSetupHistory ?? []), { fixtureSetup: project.fixtureSetup ?? {}, by: actor, at: new Date().toISOString() }];
  project.fixtureSetup = next;
  project.fixtureSetupUpdated = { by: actor, at: new Date().toISOString() };
  return writeProject(project);
}
