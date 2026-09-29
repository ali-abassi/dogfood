import { blockingSeverities, devices, notCaptured } from './schema.mjs';

// A page's QA is complete only when its screenshots and page check are current, all six answers
// are answered, and no blocking bug is open. The app, the API, the MCP server, and the checker all
// read this one gate.
const captureRequirements = [
  {
    id: 'capture',
    label: 'Desktop and phone screenshots',
    met: (page, fingerprint) => devices.every(device => validatedCapture(page.captures[device]) && (!fingerprint || !page.captures[device].fingerprint || page.captures[device].fingerprint === fingerprint)),
    missing: page => devices.filter(device => !validatedCapture(page.captures[device])).map(device => captureGap(device, page.captures[device])).join(' '),
  },
  {
    id: 'scan',
    label: 'Page check of the current screenshots',
    met: (page, fingerprint) => scanMatchesCaptures(page) && (!fingerprint || !page.scan?.fingerprint || page.scan.fingerprint === fingerprint),
    missing: scanGap,
  },
];

function scanGap(page) {
  const attempt = page.scanAttempt || {};
  if (attempt.status === 'failed') return `The latest page check failed: ${attempt.reason}. Check it again.`;
  if (attempt.status === 'started') return 'The latest page check did not finish. Check it again.';
  if (page.scan) return 'The screenshots or checkout changed after the last check; check the page again.';
  return 'Check the page to measure errors, requests, speed, search tags, and accessibility.';
}

const issuesRequirement = {
  id: 'issues',
  label: 'No open bug that blocks the page',
  met: page => !blockingFindings(page).length,
  missing: page => `Open: ${blockingFindings(page).map(item => item.id).join(', ')}.`,
};

function answered(answer) {
  return answer.status === 'pass' || answer.status === 'needs_work';
}

function freshRow(row, fingerprint, changedAt) {
  if (row.status !== 'pass') return true;
  if (fingerprintChanged(row, fingerprint)) return false;
  return !Number.isFinite(changedAt) || Date.parse(row.at) >= changedAt;
}

function fingerprintChanged(row, fingerprint) {
  return Boolean(fingerprint && row.fingerprint) && row.fingerprint !== fingerprint;
}

function rowRequirement(row, prefix, fingerprint, changedAt) {
  const label = row.name ?? row.question;
  const met = answered(row) && freshRow(row, fingerprint, changedAt);
  const missing = answered(row) ? `${label} changed since its Good verdict. Check it again.`
    : `${label} needs a pass or needs work verdict.`;
  return { id: `${prefix}:${row.id}`, label: `${label} answered`, met, missing };
}

function rowRequirements(rows, prefix, fingerprint, changedAt) {
  return rows.map(row => rowRequirement(row, prefix, fingerprint, changedAt));
}

function answerRequirement(answer) {
  return { id: answer.id, label: `${answer.name} answered`, met: answered(answer), missing: answered(answer) ? '' : answer.summary };
}

function reviewed(entry) {
  return entry.status !== 'untested';
}

function validatedCapture(capture) {
  return capture.state === 'rendered' && capture.fullPage && Boolean(capture.sha256);
}

function captureGap(device, capture) {
  if (capture.state === 'blocked') return `${device}: ${capture.reason}`;
  return `${device}: record a full-page screenshot through dogfood so it is validated.`;
}

// A scan vouches only for the screenshots it took; replacing either makes it stale.
function scanMatchesCaptures(page) {
  return Boolean(page.scan) && (!page.scanAttempt || page.scanAttempt.status === 'passed')
    && devices.every(device => page.scan.captureSha256?.[device] === page.captures[device].sha256);
}

// Measured failures that mean the page needs work regardless of any reviewer's verdict.
export function scanProblems(scan) {
  if (!scan) return [];
  return devices.flatMap(device => viewportProblems(device, scan.viewports[device]));
}

const deviceWords = { desktop: 'On a computer', mobile: 'On a phone' };

function viewportProblems(device, facts) {
  const where = deviceWords[device];
  const problems = [
    ...facts.pageErrors.map(message => `${where}: the page crashed with “${message}”`),
    ...facts.failedRequests.map(request => `${where}: loading ${request.url} failed (${request.status})`),
  ];
  return facts.horizontalOverflow ? [...problems, `${where}: the page scrolls sideways`] : problems;
}

export function auditRows(page) {
  return Object.values(page.audit).flat();
}

function blockingFindings(page) {
  return page.findings.filter(item => item.status === 'open' && blockingSeverities.has(item.severity));
}

function verdictEntries(page) {
  return [...Object.values(page.checks), ...page.features, ...auditRows(page)];
}

function checkedRequirement(item, page, fingerprint) {
  const met = item.met(page, fingerprint);
  return { id: item.id, label: item.label, met, missing: met ? '' : item.missing(page) };
}

export function pageCompletion(page, answers, fingerprint = null) {
  const changedAt = Date.parse(page.scan?.lastChangedAt);
  const rows = [
    ...rowRequirements(page.features, 'feature', fingerprint, changedAt),
    ...Object.entries(page.audit).flatMap(([key, entries]) => rowRequirements(entries, `audit:${key}`, fingerprint, changedAt)),
  ];
  const results = [...captureRequirements.map(item => checkedRequirement(item, page, fingerprint)), ...answers.map(answerRequirement), ...rows, checkedRequirement(issuesRequirement, page)];
  return { complete: results.every(item => item.met), requirements: results };
}

export function pageAcceptance(page, answers, completion) {
  const requirements = [
    { id: 'audit', label: 'Audit complete', met: completion.complete, missing: 'Finish every page check, feature, and checklist question.' },
    { id: 'answers', label: 'All six answers good', met: answers.every(answer => answer.status === 'pass'), missing: 'Every answer must be Good.' },
    { id: 'findings', label: 'No open bugs', met: page.findings.every(item => item.status !== 'open'), missing: 'Resolve every open bug, including P2 and P3.' },
  ];
  return { accepted: requirements.every(item => item.met), requirements };
}

// Status is what the six answers say; completion is whether all of them are answered.
// The first matching rule wins. A page is good only when its QA is complete and every answer is good.
const statusRules = [
  ['blocked', page => page.captures.desktop.state === 'blocked' && page.captures.desktop.reason !== notCaptured.reason],
  ['needs_work', (page, answers) => answers.some(answer => answer.status === 'needs_work')],
  ['in_review', (page, answers) => answers.some(answer => answer.status === 'recheck')],
  ['pass', (page, answers, completion) => completion.complete && answers.every(answer => answer.status === 'pass')],
  ['in_review', (page, answers) => answers.some(answer => answer.status !== 'untested')],
];

function latestVerdictTime(page) {
  return Math.max(0, ...verdictEntries(page).map(entry => Date.parse(entry.at)).filter(Number.isFinite));
}

// True when the page was reviewed and a scan since then found it looks different, so the
// verdicts may describe a page that no longer exists. Informational: it does not block completion.
export function changedSinceReview(page) {
  const lastChangedAt = Date.parse(page.scan?.lastChangedAt);
  if (!Number.isFinite(lastChangedAt) || !verdictEntries(page).some(reviewed)) return false;
  return latestVerdictTime(page) < lastChangedAt;
}

export function pageStatus(page, answers, completion) {
  return statusRules.find(([, applies]) => applies(page, answers, completion))?.[0] ?? 'untested';
}

// Whether every given page passes the gate above, with one line per page naming what is missing.
// Other tools (for example an agent runner's check step) run it through `npm run gate` instead of reimplementing it.
// No pages is not a pass: there is nothing to vouch for.
export function pagesGate(pages, mode = 'audit') {
  if (!['audit', 'acceptance'].includes(mode)) throw new Error(`Unknown gate mode: ${mode}`);
  return { complete: pages.length > 0 && pages.every(page => mode === 'audit' ? page.progress.complete : page.progress.accepted), lines: pages.flatMap(page => gateLines(page, mode)) };
}

function gateLines(page, mode) {
  const { complete, accepted, status } = page.progress;
  const passed = mode === 'audit' ? complete : accepted;
  const requirements = mode === 'audit' ? page.progress.requirements : page.progress.acceptanceRequirements;
  if (passed) return [`✓ ${page.name} [${page.id}]: ${mode === 'audit' ? 'complete' : 'accepted'} (${status})`];
  return [`✗ ${page.name} [${page.id}]: ${status}`, ...requirements.filter(item => !item.met).map(item => `  - ${item.id}: ${item.missing}`)];
}
