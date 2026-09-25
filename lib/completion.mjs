import { blockingSeverities, devices } from './schema.mjs';

// A page's QA is complete only when every applicable requirement below is met. The
// app, the API, the MCP server, and the checker all read this one gate.
const requirements = [
  {
    id: 'capture',
    label: 'Validated desktop and mobile screenshots',
    met: page => devices.every(device => validatedCapture(page.captures[device])),
    missing: page => devices.filter(device => !validatedCapture(page.captures[device])).map(device => captureGap(device, page.captures[device])).join(' '),
  },
  {
    id: 'scan',
    label: 'Automated scan of the current screenshots',
    met: page => scanMatchesCaptures(page),
    missing: page => page.scan ? 'The screenshots changed after the last scan; scan the page again.' : 'Scan the page to measure errors, requests, speed, search tags, and accessibility.',
  },
  {
    id: 'features',
    label: 'Every feature has a verdict',
    met: page => page.features.length > 0 && page.features.every(reviewed),
    missing: page => page.features.length ? `Untested: ${page.features.filter(item => !reviewed(item)).map(item => item.name).join(', ')}.` : 'List what this page lets people do.',
  },
  {
    id: 'checks',
    label: 'All five quality questions answered',
    met: page => Object.values(page.checks).every(reviewed),
    missing: page => `Untested: ${Object.keys(page.checks).filter(key => !reviewed(page.checks[key])).join(', ')}.`,
  },
  {
    id: 'audit',
    label: 'Security, copying, search, and accessibility checklists answered',
    met: page => auditRows(page).every(reviewed),
    missing: page => `${auditRows(page).filter(item => !reviewed(item)).length} checklist questions are untested.`,
  },
  {
    id: 'connections',
    label: 'Data connections mapped',
    met: page => page.connections.length > 0,
    missing: () => 'Map at least one connection, including the page request itself.',
  },
  {
    id: 'tests',
    label: 'Focused tests pass',
    applies: page => page.qa.tests.length > 0,
    met: page => page.qa.latest?.status === 'passed',
    missing: page => page.qa.latest ? `Latest run ${page.qa.latest.status}.` : 'Run the focused tests.',
  },
  {
    id: 'ai-review',
    label: 'AI review of the current desktop screenshot',
    met: (page, evidence) => evidence.visualReview.exists && !evidence.visualReview.stale,
    missing: (page, evidence) => evidence.visualReview.exists ? 'The AI review belongs to an older screenshot; run it again.' : 'Ask AI to review the screenshot.',
  },
  {
    id: 'issues',
    label: 'No open P0 or P1 issues',
    met: page => !blockingFindings(page).length,
    missing: page => `Open: ${blockingFindings(page).map(item => item.id).join(', ')}.`,
  },
];

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

function viewportProblems(device, facts) {
  const problems = [
    ...facts.pageErrors.map(message => `${device}: uncaught error: ${message}`),
    ...facts.failedRequests.map(request => `${device}: ${request.method} ${request.url} returned ${request.status}`),
  ];
  return facts.horizontalOverflow ? [...problems, `${device}: the page scrolls sideways`] : problems;
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

export function pageCompletion(page, evidence) {
  const applicable = requirements.filter(item => !item.applies || item.applies(page));
  const results = applicable.map(item => {
    const met = item.met(page, evidence);
    return { id: item.id, label: item.label, met, missing: met ? '' : item.missing(page, evidence) };
  });
  return { complete: results.every(item => item.met), requirements: results };
}

function needsWork(page) {
  if (page.findings.some(item => item.status === 'open') || scanProblems(page.scan).length) return true;
  return verdictEntries(page).some(item => item.status === 'needs_work') || page.qa.latest?.status === 'failed';
}

// Status is the verdict; completion is whether the evidence behind it is all there.
// The first matching rule wins. A page passes only when its QA is complete and every verdict is Pass.
const statusRules = [
  ['blocked', page => page.captures.desktop.state !== 'rendered'],
  ['needs_work', needsWork],
  ['pass', (page, completion) => completion.complete && verdictEntries(page).every(item => item.status === 'pass')],
  ['in_review', page => verdictEntries(page).some(reviewed)],
];

export function pageStatus(page, completion) {
  return statusRules.find(([, applies]) => applies(page, completion))?.[0] ?? 'untested';
}
