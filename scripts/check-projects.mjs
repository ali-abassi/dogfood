import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = resolve(root, process.env.DOGFOOD_DATA || 'data');
const directory = join(dataDir, 'projects');
const statuses = new Set(['untested', 'pass', 'needs_work']);
const dimensions = ['functionality', 'optimization', 'design', 'excess', 'clarity'];
const auditKeys = ['security', 'scraping', 'seo'];

function fail(message) { throw new Error(message); }

function hasEvidenceNote(entry) {
  return entry.status === 'untested' || entry.note.trim().length >= 12;
}

function checkEntry(entry, label) {
  if (!entry || !statuses.has(entry.status)) fail(`${label}: invalid review status`);
  if (typeof entry.note !== 'string') fail(`${label}: evidence note missing`);
  if (!hasEvidenceNote(entry)) fail(`${label}: verdict needs a specific evidence note`);
}

function hasCaptureProvenance(capture) {
  return capture && ['sourceUrl', 'capturedAt', 'viewport', 'actor'].every(key => capture[key]);
}

function checkCaptureIdentity(capture, label) {
  if (!hasCaptureProvenance(capture)) fail(`${label}: capture provenance missing`);
  if (!['rendered', 'blocked'].includes(capture.state)) fail(`${label}: capture state invalid`);
  if (!['source', 'automated', 'mock', 'real', 'longitudinal'].includes(capture.tier)) fail(`${label}: capture evidence tier invalid`);
  if (!['http:', 'https:'].includes(new URL(capture.sourceUrl).protocol)) fail(`${label}: source URL must be HTTP(S)`);
}

function checkRenderedCapture(capture, project, label) {
  const expectedPath = new RegExp(`^/captures/${project.id}/[a-z0-9-]+(?:-mobile)?\\.png$`);
  if (!expectedPath.test(capture.path)) fail(`${label}: capture path invalid`);
  const file = join(dataDir, capture.path.slice(1));
  if (!existsSync(file)) fail(`${label}: rendered image missing`);
  const png = readFileSync(file);
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') fail(`${label}: capture is not PNG`);
  if (capture.pixelWidth !== png.readUInt32BE(16) || capture.pixelHeight !== png.readUInt32BE(20)) fail(`${label}: capture dimensions do not match image`);
  if (typeof capture.fullPage !== 'boolean') fail(`${label}: full-page capture status missing`);
}

function checkCapture(page, project) {
  const label = `${project.id}/${page.id}`;
  checkCaptureIdentity(page.capture, label);
  if (page.capture.state === 'rendered') return checkRenderedCapture(page.capture, project, label);
  if (!page.capture.reason) fail(`${label}: blocked capture needs a reason`);
}

function checkFeatures(page, project) {
  if (!Array.isArray(page.features) || !page.features.length) fail(`${project.id}/${page.id}: feature inventory missing`);
  const ids = page.features.map(feature => feature.id);
  if (new Set(ids).size !== ids.length) fail(`${project.id}/${page.id}: duplicate feature IDs`);
  for (const feature of page.features) checkEntry(feature, `${project.id}/${page.id}/${feature.name}`);
}

function checkFindingEvidence(finding, page, label) {
  if (typeof finding.evidence !== 'string') fail(`${label}: finding evidence field missing`);
  if (!finding.evidence) return;
  if (finding.evidence !== page.capture.path?.slice(1)) fail(`${label}: finding evidence belongs to another page`);
  if (!existsSync(join(dataDir, finding.evidence))) fail(`${label}: finding evidence missing`);
}

function checkFindingResolution(finding, label) {
  if (finding.status !== 'resolved') return;
  if (typeof finding.resolution !== 'string' || finding.resolution.trim().length < 20) fail(`${label}: resolution evidence missing`);
  if (Number.isNaN(Date.parse(finding.resolvedAt))) fail(`${label}: resolution time invalid`);
}

function checkFinding(finding, page, label) {
  if (['id', 'title', 'detail'].some(key => !finding[key])) fail(`${label}: finding content missing`);
  if (!['P0', 'P1', 'P2', 'P3'].includes(finding.severity)) fail(`${label}: invalid severity`);
  if (!['open', 'resolved'].includes(finding.status)) fail(`${label}: invalid finding status`);
  checkFindingResolution(finding, label);
  checkFindingEvidence(finding, page, label);
}

function checkFindings(page, project) {
  if (!Array.isArray(page.findings)) fail(`${project.id}/${page.id}: findings list missing`);
  page.findings.forEach(finding => checkFinding(finding, page, `${project.id}/${page.id}`));
}

function checkAuditList(rows, label) {
  if (!Array.isArray(rows) || !rows.length) fail(`${label}: checklist missing`);
  if (new Set(rows.map(row => row.id)).size !== rows.length) fail(`${label}: duplicate IDs`);
  for (const row of rows) {
    if (!row.id || !row.question) fail(`${label}: checklist item incomplete`);
    checkEntry(row, `${label}/${row.id}`);
  }
}

function checkConnection(row, label) {
  if (['id', 'name', 'method', 'endpoint', 'sends', 'receives', 'source'].some(key => !row[key])) fail(`${label}: incomplete connection`);
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(row.method)) fail(`${label}: invalid connection method`);
  if (!['source', 'observed', 'manual'].includes(row.provenance)) fail(`${label}: invalid connection provenance`);
}

function checkAudit(page, project) {
  for (const key of auditKeys) checkAuditList(page.audit?.[key], `${project.id}/${page.id}/${key}`);
  if (!Array.isArray(page.connections) || !page.connections.length) fail(`${project.id}/${page.id}: connections missing`);
  if (new Set(page.connections.map(row => row.id)).size !== page.connections.length) fail(`${project.id}/${page.id}: duplicate connection IDs`);
  for (const row of page.connections) checkConnection(row, `${project.id}/${page.id}`);
}

function checkPageTest(test, checkout, label) {
  if (!test.id || !test.label || !/^src\/[a-zA-Z0-9/_-]+\.test\.tsx?$/.test(test.file)) fail(`${label}: invalid focused test`);
  if (typeof test.reason !== 'string' || test.reason.trim().length < 12) fail(`${label}: focused test needs a reason`);
  const file = join(checkout, test.file);
  if (!existsSync(file) || !realpathSync(file).startsWith(`${checkout}${sep}`)) fail(`${label}: focused test missing or outside checkout`);
}

function checkQaPlan(page, project) {
  const tests = page.qa?.tests;
  const label = `${project.id}/${page.id}`;
  if (!Array.isArray(tests)) fail(`${label}: test plan missing`);
  if (typeof page.qa.note !== 'string' || page.qa.note.trim().length < 12) fail(`${label}: describe the untested page boundary`);
  if (new Set(tests.map(test => test.id)).size !== tests.length) fail(`${label}: duplicate test IDs`);
  for (const test of tests) checkPageTest(test, realpathSync(resolve(root, project.source.checkout)), label);
}

function checkPage(page, project) {
  if (!/^[a-z0-9-]+$/.test(page.id)) fail(`${project.id}: invalid page ID`);
  if (['name', 'group', 'route'].some(key => !page[key])) fail(`${project.id}/${page.id}: page identity missing`);
  checkCapture(page, project);
  for (const key of dimensions) checkEntry(page.checks?.[key], `${project.id}/${page.id}/${key}`);
  checkFeatures(page, project);
  checkFindings(page, project);
  checkAudit(page, project);
  checkQaPlan(page, project);
}

if (!existsSync(directory)) fail(`No projects folder at ${directory}. Run with DOGFOOD_DATA=demo to check the demo.`);
const names = readdirSync(directory).filter(name => name.endsWith('.json'));
if (!names.length) fail('No project manifests found');
for (const name of names) {
  const project = JSON.parse(readFileSync(join(directory, name), 'utf8'));
  if (project.version !== 1 || `${project.id}.json` !== name) fail(`${name}: project version or ID mismatch`);
  if (!/^[a-z0-9-]+$/.test(project.id)) fail(`${name}: invalid project ID`);
  if (!project.name || !project.description || !project.source?.url || !project.source?.environment) fail(`${name}: project identity or source missing`);
  if (!project.source.checkout || !existsSync(resolve(root, project.source.checkout))) fail(`${name}: local checkout missing`);
  if (!['http:', 'https:'].includes(new URL(project.source.url).protocol)) fail(`${name}: project URL must be HTTP(S)`);
  if (!Array.isArray(project.guidelines)) fail(`${name}: design guidelines missing`);
  if (!Array.isArray(project.pages) || !project.pages.length) fail(`${name}: no pages`);
  const ids = project.pages.map(page => page.id);
  if (new Set(ids).size !== ids.length) fail(`${name}: duplicate page IDs`);
  project.pages.forEach(page => checkPage(page, project));
  console.log(`${project.name}: ${project.pages.length} pages, ${project.pages.reduce((count, page) => count + page.features.length, 0)} features`);
}
