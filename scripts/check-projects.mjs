import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { captureProblem, readCapture } from '../lib/capture.mjs';
import { dataDir, projectsDir, root } from '../lib/paths.mjs';
import {
  auditKeys, captureStates, captureTiers, checkKeys, connectionProvenance, devices, evidenceNote, findingStatuses,
  httpMethods, idPattern, manifestVersion, severities, testFilePattern, verdicts,
} from '../lib/schema.mjs';
import { projectView } from '../lib/store.mjs';

function fail(message) { throw new Error(message); }

// Each rule is [isBroken, message]; rules run in order, so later rules may rely on earlier ones.
function assertRules(label, rules) {
  for (const [broken, message] of rules) if (broken()) fail(`${label}: ${message}`);
}

function isHttpUrl(value) {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

function checkEntry(entry, label) {
  assertRules(label, [
    [() => !verdicts.has(entry?.status), 'invalid review status'],
    [() => typeof entry.note !== 'string', 'evidence note missing'],
    [() => entry.status !== 'untested' && entry.note.trim().length < evidenceNote.minimum, 'verdict needs a specific evidence note'],
  ]);
}

function checkRenderedCapture(capture, project, label) {
  assertRules(label, [
    [() => !['sourceUrl', 'capturedAt', 'viewport', 'actor'].every(key => capture[key]), 'capture provenance missing'],
    [() => !captureTiers.has(capture.tier), 'capture evidence tier invalid'],
    [() => !isHttpUrl(capture.sourceUrl), 'source URL must be HTTP(S)'],
    [() => !capture.path?.startsWith(`/captures/${project.id}/`), 'capture path invalid'],
    [() => typeof capture.fullPage !== 'boolean', 'full-page capture status missing'],
  ]);
  const image = readCapture(dataDir, capture.path);
  assertRules(label, [
    [() => capture.pixelWidth !== image.width || capture.pixelHeight !== image.height, 'capture dimensions do not match image'],
    [() => capture.sha256 && capture.sha256 !== image.sha256, 'capture file changed after it was recorded'],
  ]);
  const problem = captureProblem(image.bytes);
  if (problem) fail(`${label}: ${problem}`);
}

function checkCapture(capture, project, label) {
  if (!captureStates.has(capture?.state)) fail(`${label}: capture state invalid`);
  if (capture.state === 'rendered') return checkRenderedCapture(capture, project, label);
  if (!capture.reason) fail(`${label}: blocked capture needs a reason`);
}

function checkScan(page, label) {
  if (page.scan === null) return;
  assertRules(`${label}/scan`, [
    [() => Number.isNaN(Date.parse(page.scan?.scannedAt)), 'scan time invalid'],
    [() => !devices.every(device => page.scan.viewports?.[device] && page.scan.captureSha256?.[device]), 'scan must cover desktop and mobile'],
  ]);
}

function checkUniqueIds(rows, label) {
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail(`${label}: duplicate IDs`);
}

function checkFeatures(page, label) {
  if (!Array.isArray(page.features)) fail(`${label}: feature inventory missing`);
  checkUniqueIds(page.features, `${label} features`);
  for (const feature of page.features) checkEntry(feature, `${label}/${feature.name}`);
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
    [() => finding.evidence && finding.evidence !== page.captures.desktop.path?.slice(1), 'finding evidence belongs to another page'],
  ]);
}

function checkAuditList(rows, label) {
  assertRules(label, [[() => !Array.isArray(rows) || !rows.length, 'checklist missing']]);
  checkUniqueIds(rows, label);
  for (const row of rows) {
    assertRules(label, [[() => !row.id || !row.question, 'checklist item incomplete']]);
    checkEntry(row, `${label}/${row.id}`);
  }
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
  ]);
  devices.forEach(device => checkCapture(page.captures?.[device], project, `${label}/${device}`));
  checkScan(page, label);
  for (const key of checkKeys) checkEntry(page.checks?.[key], `${label}/${key}`);
  checkFeatures(page, label);
  page.findings.forEach(finding => checkFinding(finding, page, label));
  checkAudit(page, label);
  checkConnections(page, label);
  checkTestPlan(page, checkout, label);
}

function checkProjectIdentity(project, name) {
  assertRules(name, [
    [() => project.version !== manifestVersion || `${project.id}.json` !== name, 'project version or ID mismatch'],
    [() => !idPattern.test(project.id), 'invalid project ID'],
    [() => ['name', 'description'].some(key => !project[key]) || !project.source?.environment, 'project identity or source missing'],
    [() => !isHttpUrl(project.source.url), 'project URL must be HTTP(S)'],
    [() => project.source.checkout && !existsSync(resolve(root, project.source.checkout)), 'local checkout missing'],
    [() => !Array.isArray(project.guidelines), 'design guidelines missing'],
    [() => !Array.isArray(project.pages), 'pages missing'],
  ]);
  checkUniqueIds(project.pages, `${name} pages`);
}

function checkProject(name) {
  const project = JSON.parse(readFileSync(join(projectsDir, name), 'utf8'));
  checkProjectIdentity(project, name);
  const checkout = project.source.checkout ? realpathSync(resolve(root, project.source.checkout)) : null;
  project.pages.forEach(page => checkPage(page, project, checkout));
  const complete = projectView(project).pages.filter(page => page.progress.complete).length;
  console.log(`${project.name}: ${project.pages.length} pages, ${complete} with complete QA`);
}

if (!existsSync(projectsDir)) fail(`No projects folder at ${projectsDir}. Run with DOGFOOD_DATA=demo to check the demo.`);
const names = readdirSync(projectsDir).filter(name => name.endsWith('.json'));
if (!names.length) fail('No project manifests found');
names.forEach(checkProject);
