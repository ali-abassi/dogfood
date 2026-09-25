// The one definition of dogfood's manifest vocabulary. The server, the MCP server,
// the manifest checker, and the completion gate all import from here.
export const verdicts = new Set(['untested', 'pass', 'needs_work']);
export const checkKeys = ['functionality', 'optimization', 'design', 'excess', 'clarity'];
export const auditKeys = ['security', 'scraping', 'seo', 'accessibility'];
export const devices = ['desktop', 'mobile'];
export const httpMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
export const connectionProvenance = new Set(['source', 'observed', 'manual']);
export const captureStates = new Set(['rendered', 'blocked']);
export const captureTiers = new Set(['source', 'automated', 'mock', 'real', 'longitudinal']);
export const severities = ['P0', 'P1', 'P2', 'P3'];
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
export const manifestVersion = 2;
