import { blockingSeverities } from './schema.mjs';

// A page's QA is complete only when every applicable requirement below is met. The
// app, the API, the MCP server, and the checker all read this one gate.
const requirements = [
  {
    id: 'capture',
    label: 'Validated full-page screenshot',
    met: page => page.capture.state === 'rendered' && page.capture.fullPage && Boolean(page.capture.sha256),
    missing: page => page.capture.state === 'blocked' ? `Capture blocked: ${page.capture.reason}` : 'Record a full-page screenshot through dogfood so it is validated.',
  },
  {
    id: 'features',
    label: 'Every feature has a verdict',
    met: page => page.features.every(reviewed),
    missing: page => `Untested: ${page.features.filter(item => !reviewed(item)).map(item => item.name).join(', ')}.`,
  },
  {
    id: 'checks',
    label: 'All five quality questions answered',
    met: page => Object.values(page.checks).every(reviewed),
    missing: page => `Untested: ${Object.keys(page.checks).filter(key => !reviewed(page.checks[key])).join(', ')}.`,
  },
  {
    id: 'audit',
    label: 'Security, copying, and search checklists answered',
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
    label: 'AI review of the current screenshot',
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
  if (page.findings.some(item => item.status === 'open')) return true;
  return verdictEntries(page).some(item => item.status === 'needs_work') || page.qa.latest?.status === 'failed';
}

// Status is the verdict; completion is whether the evidence behind it is all there.
// The first matching rule wins. A page passes only when its QA is complete and every verdict is Pass.
const statusRules = [
  ['blocked', page => page.capture.state !== 'rendered'],
  ['needs_work', needsWork],
  ['pass', (page, completion) => completion.complete && verdictEntries(page).every(item => item.status === 'pass')],
  ['in_review', page => verdictEntries(page).some(reviewed)],
];

export function pageStatus(page, completion) {
  return statusRules.find(([, applies]) => applies(page, completion))?.[0] ?? 'untested';
}
