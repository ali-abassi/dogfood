// The one definition of dogfood's manifest vocabulary. The server, the MCP server,
// the manifest checker, and the completion gate all import from here.
export const verdicts = new Set(['untested', 'pass', 'needs_work']);
// The three answers a person, an agent, or the AI judges by looking; the other three of a page's
// six answers come from checklists, measurements, features, and bugs (see answers.mjs).
export const checkKeys = ['design', 'purpose', 'ease'];
export const auditKeys = ['security', 'scraping', 'seo', 'accessibility'];
export const devices = ['desktop', 'mobile'];
export const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export const connectionProvenance = new Set(['source', 'observed', 'manual']);
export const captureStates = new Set(['rendered', 'blocked']);
// A page that was never captured is stored as blocked with this reason; it is not checked yet, not blocked.
export const notCaptured = { state: 'blocked', reason: 'Not captured yet.' };
export const captureTiers = new Set(['source', 'automated', 'mock', 'real', 'longitudinal']);
export const severities = ['P0', 'P1', 'P2', 'P3'];
// How bad a bug is, in the words people see; the codes stay in the manifest and the MCP tools.
export const severityNames = { P0: 'Breaks the app', P1: 'Blocks this page', P2: 'Annoying', P3: 'Cosmetic' };
export const blockingSeverities = new Set(['P0', 'P1']);
export const findingStatuses = new Set(['open', 'resolved']);
export const caseStatuses = new Set(['passed', 'failed', 'skipped', 'pending', 'todo']);

export const idPattern = /^[a-z0-9-]+$/;
export const rowIdPattern = /^[a-zA-Z0-9-]{1,80}$/;
export const capturePathPattern = /^\/captures\/[a-z0-9-]+\/[a-z0-9-]+(?:-mobile)?\.png$/;
// Images the app may show: current screenshots, the ones they replaced, and scan diffs.
export const servedImagePattern = /^\/captures\/[a-z0-9-]+\/(?:(?:history|diffs)\/)?[a-z0-9-]+\.png$/;
export const testFilePattern = /^src\/[a-zA-Z0-9/_-]+\.test\.tsx?$/;
export const findingIdPattern = /^QA-(\d+)$/;

export const evidenceNote = { minimum: 12, maximum: 1200 };
export const manifestVersion = 6;
