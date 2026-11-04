import { checkedProfile, iosSourceUrl, platform, platformPage } from '../lib/project-platform.mjs';
import { checkedHash } from '../lib/native-evidence.mjs';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { captureProblem, decodePng, readCapture } from '../lib/capture.mjs';
import { dataDir, projectsDir, root } from '../lib/paths.mjs';
import {
  auditKeys, captureStates, captureTiers, checkKeys, connectionProvenance, devices, evidenceNote, findingStatuses,
  httpMethods, idPattern, manifestVersion, severities, testFilePattern, verdicts,
} from '../lib/schema.mjs';
import { manifestIntegrity, projectView } from '../lib/store.mjs';
import { validAuditDependencies, validAuditEvidence } from '../lib/audit-evidence.mjs';
import { featureAwaitsLive } from '../lib/completion.mjs';

function fail(message) { throw new Error(message); }

// Each rule is [isBroken, message]; rules run in order, so later rules may rely on earlier ones.
function assertRules(label, rules) {
  for (const [broken, message] of rules) if (broken()) fail(`${label}: ${message}`);
}

function isHttpUrl(value) {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

function checkEntry(entry, label, feature = false) {
  assertRules(label, [
    [() => !verdicts.has(entry?.status) && !(feature && featureAwaitsLive(entry)), 'invalid review status'],
    [() => typeof entry.note !== 'string', 'evidence note missing'],
    [() => entry.status !== 'untested' && entry.note.trim().length < evidenceNote.minimum, 'verdict needs a specific evidence note'],
    [() => !feature && entry.liveDebt !== undefined, 'live debt is only valid on features'],
  ]);
}

function checkRenderedCapture(capture, project, label) {
  assertRules(label, [
    [() => !['sourceUrl', 'capturedAt', 'viewport', 'actor'].every(key => capture[key]), 'capture provenance missing'],
    [() => !captureTiers.has(capture.tier), 'capture evidence tier invalid'],
    [() => !validCaptureSource(capture, project), 'source URL must match the declared platform'],
    [() => !capture.path?.startsWith(`/captures/${project.id}/`), 'capture path invalid'],
    [() => typeof capture.fullPage !== 'boolean', 'full-page capture status missing'],
  ]);
  const image = readCapture(dataDir, capture.path);
  assertRules(label, [
    [() => capture.pixelWidth !== image.width || capture.pixelHeight !== image.height, 'capture dimensions do not match image'],
    [() => capture.sha256 && capture.sha256 !== image.sha256, 'capture file changed after it was recorded'],
  ]);
  const problem = checkedCaptureProblem(capture, image.bytes);
  if (problem) fail(`${label}: ${problem}`);
}

function checkCapture(capture, project, label) {
  if (!captureStates.has(capture?.state)) fail(`${label}: capture state invalid`);
  if (capture.state === 'rendered') return checkRenderedCapture(capture, project, label);
  if (!capture.reason) fail(`${label}: blocked capture needs a reason`);
}

function validCaptureSource(capture, project) {
  if (capture.native) return validNativeUrl(capture.sourceUrl, capture.native.app.bundleId);
  return isHttpUrl(capture.sourceUrl);
}
function validNativeUrl(value, bundleId) {
  try { iosSourceUrl({ bundleId }, value); return true; }
  catch { return false; }
}
function checkScan(page, label) {
  if (page.scan === null) return;
  assertRules(`${label}/scan`, [
    [() => Number.isNaN(Date.parse(page.scan?.scannedAt)), 'scan time invalid'],
    [() => !recordedScanDevices(page).every(device => page.scan.viewports?.[device] && page.scan.captureSha256?.[device]), 'scan must cover the declared devices'],
  ]);
}

function checkUniqueIds(rows, label) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail(`${label}: duplicate IDs`);
}

function checkFeatures(page, label) {
  if (!Array.isArray(page.features)) fail(`${label}: feature inventory missing`);
  checkUniqueIds(page.features, `${label} features`);
  for (const feature of page.features) {
    checkEntry(feature, `${label}/${feature.name}`, true);
    checkLiveDebt(feature, `${label}/${feature.name}`);
  }
}

function checkLiveDebt(feature, label) {
  if (feature.requiresLive !== undefined && typeof feature.requiresLive !== 'boolean') fail(`${label}: requires-live declaration invalid`);
  const debt = feature.liveDebt;
  if (!debt) return;
  assertRules(label, [
    [() => !feature.requiresLive || !['awaiting_deploy', 'pending', 'verified'].includes(debt.state), 'invalid live debt state or feature declaration'],
    [() => !validDebtAttribution(debt), 'live debt reason, author or time missing'],
    [() => debt.state === 'awaiting_deploy' && feature.status !== 'awaiting_live', 'deferred live debt needs awaiting_live feature status'],
    [() => debt.state !== 'awaiting_deploy' && (!debt.deploymentId || Number.isNaN(Date.parse(debt.activatedAt))), 'activated live debt needs deployment metadata'],
    [() => debt.state === 'verified' && (feature.status !== 'pass' || Number.isNaN(Date.parse(debt.verifiedAt))), 'verified live debt needs passing verdict and verification time'],
    [() => debt.state === 'pending' && feature.status === 'pass', 'pending live debt cannot have a passing verdict'],
  ]);
}

function validDebtAttribution(debt) {
  return String(debt.reason ?? '').trim().length >= evidenceNote.minimum && typeof debt.by === 'string' && Boolean(debt.by.trim()) && Number.isFinite(Date.parse(debt.at));
}

function checkFinding(finding, page, label) {
  const resolved = finding.status === 'resolved';
  assertRules(`${label}/${finding.id}`, [
    [() => ['id', 'title', 'detail'].some(key => !finding[key]), 'finding content missing'],
    [() => !severities.includes(finding.severity), 'invalid severity'],
    [() => !findingStatuses.has(finding.status), 'invalid finding status'],
    [() => resolved && String(finding.resolution ?? '').trim().length < 20, 'resolution evidence missing'],
    [() => resolved && Number.isNaN(Date.parse(finding.resolvedAt)), 'resolution time invalid'],
    [() => typeof finding.evidence !== 'string', 'finding evidence field missing'],
    [() => finding.evidence && !devices.some(device => finding.evidence === page.captures[device].path?.slice(1)), 'finding evidence belongs to another page'],
  ]);
}

function checkAuditList(rows, label) {
  assertRules(label, [[() => !Array.isArray(rows) || !rows.length, 'checklist missing']]);
  checkUniqueIds(rows, label);
  for (const row of rows) {
    assertRules(label, [[() => !row.id || !row.question, 'checklist item incomplete']]);
    checkEntry(row, `${label}/${row.id}`);
    checkAuditEvidence(row, `${label}/${row.id}`);
  }
}

function checkAuditEvidence(row, label) {
  assertRules(label, [
    [() => row.dependsOn !== undefined && !validAuditDependencies(row.dependsOn), 'audit dependencies invalid'],
    [() => row.evidence === null && row.status !== 'untested', 'answered audit evidence snapshot missing'],
    [() => row.evidence != null && !validAuditEvidence(row.evidence), 'audit evidence snapshot invalid'],
    [() => row.carriedFrom && !row.evidence, 'carried audit requires an evidence snapshot'],
  ]);
  if (row.evidence) {
    checkEvidenceContext(row.evidence.context, label);
    if (!row.evidence.dependsOn.every(key => Object.hasOwn(row.evidence.facts, key))) fail(`${label}: audit dependency fact snapshot missing`);
  }
  if (row.carriedFrom) checkCarried(row.carriedFrom, label);
}

function validFixtures(value) {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (!Array.isArray(value) || value.length > 10) return false;
  return value.every(item => typeof item === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(item));
}

function checkEvidenceContext(context, label) {
  if (context.platform === 'ios') return checkNativeContext(context, label);
  const strings = ['requiredRole', 'verifiedRole', 'browserProfile', 'declaredRole'];
  assertRules(label, [
    [() => !isHttpUrl(context.sourceUrl), 'audit evidence source must be HTTP(S)'],
    [() => !['local', 'live', 'mock'].includes(context.environment), 'audit evidence environment invalid'],
    [() => context.signedIn !== null && typeof context.signedIn !== 'boolean', 'audit evidence signed-in state invalid'],
    [() => strings.some(key => context[key] !== null && typeof context[key] !== 'string'), 'audit evidence role context invalid'],
    [() => !validFixtures(context.fixture) || !validFixtures(context.declaredFixture), 'audit evidence fixture context invalid'],
  ]);
}

function checkCarried(carried, label) {
  assertRules(label, [
    [() => Number.isNaN(Date.parse(carried.scannedAt)) || !isHttpUrl(carried.sourceUrl), 'carried audit scan provenance invalid'],
    [() => carried.fingerprint !== null && carried.fingerprint !== undefined && typeof carried.fingerprint !== 'string', 'carried audit fingerprint invalid'],
  ]);
}

function checkAudit(page, label) {
  for (const key of auditKeys) checkAuditList(page.audit?.[key], `${label}/${key}`);
}

function checkConnection(row, label) {
  assertRules(`${label}/${row.id}`, [
    [() => ['id', 'name', 'method', 'endpoint', 'sends', 'receives', 'source'].some(key => !row[key]), 'incomplete connection'],
    [() => !httpMethods.has(row.method), 'invalid connection method'],
    [() => !connectionProvenance.has(row.provenance), 'invalid connection provenance'],
  ]);
}

function checkConnections(page, label) {
  if (!Array.isArray(page.connections)) fail(`${label}: connections list missing`);
  checkUniqueIds(page.connections, `${label} connections`);
  for (const row of page.connections) checkConnection(row, label);
}

function checkFocusedTest(test, checkout, label) {
  if (!checkout) fail(`${label}: focused tests need a project checkout`);
  const file = join(checkout, String(test.file));
  assertRules(`${label}/${test.id}`, [
    [() => !test.id || !test.label || !testFilePattern.test(test.file), 'invalid focused test'],
    [() => String(test.reason ?? '').trim().length < 12, 'focused test needs a reason'],
    [() => !existsSync(file) || !realpathSync(file).startsWith(`${checkout}${sep}`), 'focused test missing or outside checkout'],
  ]);
}

function checkTestPlan(page, checkout, label) {
  assertRules(label, [
    [() => !Array.isArray(page.qa?.tests), 'test plan missing'],
    [() => typeof page.qa.note !== 'string', 'untested boundary note missing'],
  ]);
  checkUniqueIds(page.qa.tests, `${label} tests`);
  for (const test of page.qa.tests) checkFocusedTest(test, checkout, label);
}

function checkPage(page, project, checkout) {
  const label = `${project.id}/${page.id}`;
  assertRules(label, [
    [() => !idPattern.test(page.id), 'invalid page ID'],
    [() => ['name', 'group', 'route'].some(key => !page[key]), 'page identity missing'],
    [() => !Array.isArray(page.findings), 'findings list missing'],
    [() => page.signedIn !== undefined && typeof page.signedIn !== 'boolean', 'signed-in registration invalid'],
  ]);
  devices.forEach(device => checkCapture(page.captures?.[device], project, `${label}/${device}`));
  checkScan(page, label);
  checkNativeRecord(page, project, label);
  for (const key of checkKeys) checkEntry(page.checks?.[key], `${label}/${key}`);
  checkFeatures(page, label);
  page.findings.forEach(finding => checkFinding(finding, page, label));
  checkAudit(page, label);
  checkConnections(page, label);
  checkTestPlan(page, checkout, label);
}

function checkProjectIdentity(project, name) {
  checkedProfile(project.source);
  assertRules(name, [
    [() => project.version !== manifestVersion || `${project.id}.json` !== name, 'project version or ID mismatch'],
    [() => !idPattern.test(project.id), 'invalid project ID'],
    [() => ['name', 'description'].some(key => !project[key]) || !project.source?.environment, 'project identity or source missing'],
    [() => project.source.url !== null && !isHttpUrl(project.source.url), 'project URL must be HTTP(S)'],
    [() => !project.source.url && !project.source.checkout, 'a URL or checkout is required'],
    [() => project.source.checkout && !existsSync(resolve(root, project.source.checkout)), 'local checkout missing'],
    [() => !Array.isArray(project.guidelines), 'design guidelines missing'],
    [() => !Array.isArray(project.pages), 'pages missing'],
    [() => project.signedOutMarkers !== undefined && (!Array.isArray(project.signedOutMarkers) || !project.signedOutMarkers.every(item => typeof item === 'string' && item.trim())), 'signed-out markers invalid'],
  ]);
  checkUniqueIds(project.pages, `${name} pages`);
}

const authorPattern = /^(person|agent:[A-Za-z0-9-]{1,40})$/;

function verdictAuthors(page) {
  return [...Object.values(page.checks), ...page.features, ...Object.values(page.audit).flat(), ...page.findings].map(entry => entry.by).filter(Boolean);
}

// Warnings, not failures: the manifest is still usable, but someone wrote it without dogfood.
function warnAboutOutsideEdits(project) {
  if (manifestIntegrity(project.id) === 'edited-outside') console.warn(`warning: ${project.id} was edited outside dogfood since dogfood last wrote it; write through the app, the MCP server, or the store.`);
  const unknown = project.pages.flatMap(verdictAuthors).filter(author => !authorPattern.test(author));
  if (unknown.length) console.warn(`warning: ${project.id} has ${unknown.length} entries attributed outside dogfood (for example "${unknown[0]}").`);
}

function checkProject(name) {
  const project = JSON.parse(readFileSync(join(projectsDir, name), 'utf8'));
  checkProjectIdentity(project, name);
  const checkout = project.source.checkout ? realpathSync(resolve(root, project.source.checkout)) : null;
  project.pages.forEach(page => checkPage(platformPage(project, page), project, checkout));
  warnAboutOutsideEdits(project);
  const complete = projectView(project).pages.filter(page => page.progress.complete).length;
  console.log(`${project.name}: ${project.pages.length} pages, ${complete} with complete QA`);
}

if (!existsSync(projectsDir)) fail(`No projects folder at ${projectsDir}. Run with DOGFOOD_DATA=demo to check the demo.`);
function selectedManifest(id) {
  if (!idPattern.test(id)) fail('Project selection must use registered project IDs.');
  return `${id}.json`;
}
const selected = process.argv.slice(2);
const names = selected.length ? selected.map(selectedManifest) : readdirSync(projectsDir).filter(name => name.endsWith('.json'));
if (!names.length) fail('No project manifests found');
names.forEach(checkProject);

function checkNativeContext(context, label) {
  assertRules(label, [
    [() => !validNativeUrl(context.sourceUrl, context.app?.bundleId), 'native evidence source identity invalid'],
    [() => !context.device?.simulatorUDID || !context.device.name || !context.device.os, 'native evidence device missing'],
    [() => !context.app?.version || !context.app.build, 'native app version/build missing'],
    [() => !['matched', 'unknown'].includes(context.build?.sourceProof), 'native build source proof missing'],
  ]);
  checkedHash(context.profileHash, 'Native profile hash');
}
function checkNativeRecord(page, project, label) {
  const check = page.nativeCheck;
  if (!check) return;
  checkNativeContext({ ...check, platform: 'ios' }, label);
  checkedHash(check.sourceFingerprint, 'Native source fingerprint');
  checkedHash(check.captureSha256, 'Native capture fingerprint');
  if (check.build.sourceProof === 'matched') checkMatchedNativeBuild(check, label);
  if (platform(project.source) === 'ios') checkNativeReceipt(page, label);
}
function checkMatchedNativeBuild(check, label) {
  checkedHash(check.build.artifactSha256, 'Native artifact fingerprint');
  assertRules(label, [
    [() => check.build.sourceFingerprint !== check.sourceFingerprint, 'native build/source mismatch'],
    [() => !check.build.artifactFile || !check.build.note, 'native build receipt missing'],
  ]);
}
function checkNativeReceipt(page, label) {
  const capture = page.captures.mobile;
  assertRules(label, [
    [() => capture.sha256 !== page.nativeCheck.captureSha256, 'native screenshot/check mismatch'],
    [() => capture.sourceUrl !== page.nativeCheck.sourceUrl, 'native screenshot/source mismatch'],
    [() => JSON.stringify(capture.native?.device) !== JSON.stringify(page.nativeCheck.device), 'native screenshot/device mismatch'],
  ]);
}

function checkedCaptureProblem(capture, bytes) {
  if (!capture.native) return captureProblem(bytes);
  const decoded = decodePng(bytes);
  return typeof decoded === 'string' ? decoded : '';
}

function recordedScanDevices(page) {
  if (page.scan.captureDevices === undefined) return devices;
  return checkedProfile({ platform: 'web', captureDevices: page.scan.captureDevices }).captureDevices;
}
