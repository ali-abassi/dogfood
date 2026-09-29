// Audit answers depend on bounded observations, not the time a screenshot was taken.
// Human judgments still depend on the reviewed image and checkout unless explicitly declared.
import { devices } from './schema.mjs';

const factNames = [
  'seo.title', 'seo.description', 'seo.robots', 'seo.canonical', 'seo.lang', 'seo.h1', 'seo.h1Count',
  'accessibility.imagesWithoutAlt', 'accessibility.unlabeledFields', 'accessibility.unnamedButtons',
  'horizontalOverflow', 'headers', 'requests', 'consoleErrors', 'pageErrors', 'failedRequests', 'links',
];
export const auditDependencyKeys = new Set(['fingerprint', 'captures.desktop', 'captures.mobile', ...factNames]);
const human = ['fingerprint', 'captures.desktop', 'captures.mobile'];
const defaults = {
  security: { inputs: human, 'private-data': human, headers: ['fingerprint', 'headers', 'requests'] },
  scraping: { bulk: human, 'public-copy': human },
  seo: { title: ['seo.title', 'seo.description'], indexing: ['seo.robots', 'seo.canonical'] },
  accessibility: { keyboard: human, names: ['accessibility.imagesWithoutAlt', 'accessibility.unlabeledFields', 'accessibility.unnamedButtons'], contrast: human, reflow: [...human, 'horizontalOverflow'] },
};

const defaultQuestionText = {
  security: {
    inputs: 'Does the server check everything people type before it saves it?',
    'private-data': 'Can people see only their own information, even if they change a link?',
    headers: 'Does the page load only the scripts it needs, from places it trusts?',
  },
  scraping: {
    bulk: 'Is there a limit on how fast one visitor can pull data, so nobody can copy it all?',
    'public-copy': 'Can search engines and bots see only what is meant to be public?',
  },
  seo: {
    title: 'Does the page have its own clear title and a short description for search results?',
    indexing: 'Does the page show up in search only if it is meant to be public?',
  },
  accessibility: {
    keyboard: 'Can you use everything with only the keyboard, and always see where you are?',
    names: 'Do pictures, fields, and buttons have names a screen reader can read out?',
    contrast: 'Is all text easy to read against its background, in every theme the app has?',
    reflow: 'Does the page still work when zoomed to 200% and on a narrow phone?',
  },
};

export function auditDependencies(key, row) {
  if (row.dependsOn !== undefined) return row.dependsOn;
  return defaultDependencies(key, row);
}

function defaultDependencies(key, row) {
  if (defaultQuestionText[key]?.[row.id] !== row.question) return null;
  return defaults[key]?.[row.id] ?? null;
}

export function validAuditDependencies(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(key => auditDependencyKeys.has(key));
}

function valueAt(source, path) {
  return path.split('.').reduce((value, key) => value?.[key], source);
}

function fingerprintValue(page, fingerprint) {
  return fingerprint ?? page.scan?.fingerprint ?? null;
}

function captureValue(page, key) {
  return page.captures?.[key.split('.')[1]]?.sha256 ?? null;
}

function dependencyValue(page, key, fingerprint) {
  if (key === 'fingerprint') return fingerprintValue(page, fingerprint);
  if (key.startsWith('captures.')) return captureValue(page, key);
  return Object.fromEntries(devices.map(device => [device, valueAt(page.scan?.viewports?.[device], key) ?? null]));
}

function scanContext(page) {
  const scan = page.scan;
  return { sourceUrl: scan.sourceUrl, environment: scan.environment ?? 'local', ...roleContext(page), ...fixtureContext(page), declaredRoleProof: page.roleProof ?? null, roleProof: scan.roleProof ?? null };
}

function roleContext(page) {
  const scan = page.scan;
  return { requiredRole: scan.requiredRole ?? page.requiredRole ?? null, verifiedRole: scan.verifiedRole ?? null, declaredRole: page.requiredRole ?? null };
}

function fixtureContext(page) {
  const scan = page.scan;
  return { fixture: scan.fixture ?? null, browserProfile: scan.browserProfile ?? null, signedIn: page.signedIn ?? null, declaredFixture: page.fixture ?? null };
}

export function auditEvidence(page, key, row, fingerprint) {
  const dependsOn = auditDependencies(key, row);
  if (!page.scan || !validAuditDependencies(dependsOn)) return null;
  return { version: 1, scanAt: page.scan.scannedAt, dependsOn: [...dependsOn], question: row.question, context: scanContext(page), facts: Object.fromEntries(dependsOn.map(dependency => [dependency, dependencyValue(page, dependency, fingerprint)])) };
}

export function validAuditEvidence(evidence) {
  return evidence?.version === 1 && validAuditDependencies(evidence.dependsOn) && validEvidenceBody(evidence);
}

function validEvidenceBody(evidence) {
  return typeof evidence.question === 'string' && Boolean(evidence.context?.sourceUrl) && Boolean(evidence.facts);
}

function completeEvidence(evidence) {
  return evidence.dependsOn.every(key => key === 'fingerprint' || knownValue(evidence.facts[key]));
}

function knownValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return true;
  return Object.values(value).every(item => item !== null && item !== undefined);
}

function legacyFresh(page, row, fingerprint) {
  const scannedAt = Date.parse(page.scan?.scannedAt);
  const matches = !fingerprint || row.fingerprint === fingerprint;
  return Number.isFinite(scannedAt) && Date.parse(row.at) >= scannedAt && matches;
}

export function auditRowFresh(page, row, fingerprint) {
  if (!row.evidence) return legacyFresh(page, row, fingerprint);
  if (!validAuditEvidence(row.evidence)) return false;
  if (!completeEvidence(row.evidence)) return incompleteFresh(page, row, fingerprint);
  const current = auditEvidence(page, '', { ...row, dependsOn: row.evidence.dependsOn }, fingerprint);
  return Boolean(current) && equalSnapshots(current, row.evidence);
}

function incompleteFresh(page, row, fingerprint) {
  return row.evidence.scanAt === page.scan?.scannedAt && legacyFresh(page, row, fingerprint);
}

function equalSnapshots(current, previous) {
  const { scanAt: currentTime, ...currentFacts } = current;
  const { scanAt: previousTime, ...previousFacts } = previous;
  return JSON.stringify(currentFacts) === JSON.stringify(previousFacts);
}

// Called only after replacing the scan. The snapshot and original verdict attribution remain intact.
export function carryAuditEvidence(page, previousScan, fingerprint) {
  if (!previousScan) return;
  for (const rows of Object.values(page.audit)) {
    for (const row of rows) carryRow(page, row, previousScan, fingerprint);
  }
}

function carryRow(page, row, previousScan, fingerprint) {
  if (!row.evidence || row.status === 'untested' || !auditRowFresh(page, row, fingerprint)) return;
  row.carriedFrom = { scannedAt: previousScan.scannedAt, sourceUrl: previousScan.sourceUrl, fingerprint: previousScan.fingerprint ?? null };
}

function candidate(key, id, question, dependsOn, status, note) {
  return { key, id, question, dependsOn, status, note, verifiedBy: 'scan' };
}

function titleCandidate(facts) {
  const missing = facts.some(fact => !fact.seo.title?.trim() || !fact.seo.description?.trim());
  return candidate('seo', 'measured-title', 'Are a title and description present in both checked viewports?', ['seo.title', 'seo.description'], missing ? 'needs_work' : 'pass', 'The scan measured title and description presence. Clarity and uniqueness require the separate human review.');
}

function indexingCandidate(facts) {
  const directives = facts.map(fact => fact.seo.robots ?? '(none)');
  return candidate('seo', 'measured-indexing', 'What indexing directives did the checked page expose?', ['seo.robots', 'seo.canonical'], 'pass', `Measured desktop/mobile robots directives: ${directives.join(' / ')}. Intended public visibility remains a separate review.`);
}

function countCandidate(facts, id, question, dependencies) {
  const counts = facts.map(fact => dependencies.reduce((sum, path) => sum + valueAt(fact, path), 0));
  return candidate('accessibility', id, question, dependencies, counts.some(count => count > 0) ? 'needs_work' : 'pass', `The scan measured ${counts[0]} desktop and ${counts[1]} mobile missing names. This verifies names being present only.`);
}

function overflowCandidate(facts) {
  const overflow = facts.some(fact => fact.horizontalOverflow);
  return candidate('accessibility', 'measured-overflow', 'Is horizontal overflow absent at the checked viewport widths?', ['horizontalOverflow'], overflow ? 'needs_work' : 'pass', `Horizontal overflow was ${overflow ? 'present' : 'absent'} at the checked widths. Zoom to 200% remains a separate review.`);
}

function failedRequests(page, facts) {
  return facts.failedRequests.filter(request => request.url !== page.scan.sourceUrl || request.status !== page.expectedStatus);
}

function requestsCandidate(page, facts) {
  const count = facts.reduce((total, fact) => total + failedRequests(page, fact).length, 0);
  return candidate('seo', 'measured-requests', 'Were the checked page requests free of unexpected failures?', ['failedRequests'], count ? 'needs_work' : 'pass', `The scan measured ${count} unexpected failed requests across both checked viewports.`);
}

export function measuredAnswers(page) {
  const facts = devices.map(device => page.scan?.viewports?.[device]);
  if (facts.some(fact => !fact?.seo || !fact?.accessibility)) return [];
  return objectiveCandidates(page, facts).map(row => ({ ...row, evidence: auditEvidence(page, row.key, row) }));
}

function objectiveCandidates(page, facts) {
  return [titleCandidate(facts), indexingCandidate(facts),
    countCandidate(facts, 'measured-alt', 'Do checked images expose alternative text?', ['accessibility.imagesWithoutAlt']),
    countCandidate(facts, 'measured-controls', 'Do checked fields and buttons expose accessible names?', ['accessibility.unlabeledFields', 'accessibility.unnamedButtons']),
    overflowCandidate(facts), requestsCandidate(page, facts)];
}
