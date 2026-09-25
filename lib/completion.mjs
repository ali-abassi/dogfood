import { blockingSeverities, devices } from './schema.mjs';

// A page's QA is complete only when its screenshots and page check are current, all six answers
// are answered, and no blocking bug is open. The app, the API, the MCP server, and the checker all
// read this one gate.
const captureRequirements = [
  {
    id: 'capture',
    label: 'Desktop and phone screenshots',
    met: page => devices.every(device => validatedCapture(page.captures[device])),
    missing: page => devices.filter(device => !validatedCapture(page.captures[device])).map(device => captureGap(device, page.captures[device])).join(' '),
  },
  {
    id: 'scan',
    label: 'Page check of the current screenshots',
    met: page => scanMatchesCaptures(page),
    missing: page => page.scan ? 'The screenshots changed after the last check; check the page again.' : 'Check the page to measure errors, requests, speed, search tags, and accessibility.',
  },
];

const issuesRequirement = {
  id: 'issues',
  label: 'No open bug that blocks the page',
  met: page => !blockingFindings(page).length,
  missing: page => `Open: ${blockingFindings(page).map(item => item.id).join(', ')}.`,
};

function answered(answer) {
  return answer.status === 'pass' || answer.status === 'needs_work';
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
  return Boolean(page.scan) && devices.every(device => page.scan.captureSha256?.[device] === page.captures[device].sha256);
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

function checkedRequirement(item, page) {
  const met = item.met(page);
  return { id: item.id, label: item.label, met, missing: met ? '' : item.missing(page) };
}

export function pageCompletion(page, answers) {
  const results = [...captureRequirements.map(item => checkedRequirement(item, page)), ...answers.map(answerRequirement), checkedRequirement(issuesRequirement, page)];
  return { complete: results.every(item => item.met), requirements: results };
}

// Status is what the six answers say; completion is whether all of them are answered.
// The first matching rule wins. A page is good only when its QA is complete and every answer is good.
const statusRules = [
  ['blocked', page => page.captures.desktop.state !== 'rendered'],
  ['needs_work', (page, answers) => answers.some(answer => answer.status === 'needs_work')],
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
