import { httpMethods } from './schema.mjs';

// Scan facts come from scripts run inside the scanned page, so they are untrusted input:
// every field is checked and bounded here before it reaches a manifest.
const headerNames = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
const seoText = ['title', 'description', 'canonical', 'robots', 'lang'];
const accessibilityCounts = ['imagesWithoutAlt', 'unlabeledFields', 'unnamedButtons'];
const maximumConnections = 80;

function scanError(message) {
  return Object.assign(new Error(`Scan: ${message}`), { status: 400 });
}

function boundedText(value, maximum = 500) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw scanError('expected text.');
  return value.slice(0, maximum);
}

function count(value, label) {
  if (!Number.isInteger(value) || value < 0) throw scanError(`${label} must be a count.`);
  return value;
}

function textList(value, label, maximum) {
  if (!Array.isArray(value)) throw scanError(`${label} must be a list.`);
  return value.slice(0, maximum).map(item => boundedText(String(item)));
}

function request(value) {
  if (!httpMethods.has(value?.method) && value?.method !== 'OPTIONS') throw scanError('request method is invalid.');
  return { method: value.method, url: boundedText(String(value.url), 1000), status: count(value.status, 'Request status') };
}

function requestList(value, label, maximum) {
  if (!Array.isArray(value)) throw scanError(`${label} must be a list.`);
  return value.slice(0, maximum).map(request);
}

function pickText(source, names) {
  return Object.fromEntries(names.map(name => [name, boundedText(source?.[name] ?? null)]));
}

function loadTime(value) {
  if (value === null || value === undefined) return null;
  if (!(Number.isFinite(value) && value >= 0)) throw scanError('load time must be milliseconds.');
  return Math.round(value);
}

function seoFacts(seo) {
  return { ...pickText(seo, seoText), h1Count: count(seo?.h1Count, 'Heading count') };
}

function accessibilityFacts(facts) {
  return Object.fromEntries(accessibilityCounts.map(name => [name, count(facts?.[name], name)]));
}

export function checkedViewportFacts(facts) {
  if (!facts || typeof facts !== 'object') throw scanError('viewport facts are missing.');
  if (typeof facts.horizontalOverflow !== 'boolean') throw scanError('horizontal overflow must be true or false.');
  return {
    loadMs: loadTime(facts.loadMs),
    consoleErrors: textList(facts.consoleErrors, 'Console errors', 20),
    pageErrors: textList(facts.pageErrors, 'Page errors', 20),
    failedRequests: requestList(facts.failedRequests, 'Failed requests', 50),
    requests: requestList(facts.requests, 'Requests', 100),
    horizontalOverflow: facts.horizontalOverflow,
    seo: seoFacts(facts.seo),
    accessibility: accessibilityFacts(facts.accessibility),
    headers: pickText(facts.headers, headerNames),
  };
}

// An API endpoint as a person would name it: the path for same-site calls, the full origin and path otherwise.
function endpointOf(url, pageUrl) {
  const target = new URL(url, pageUrl);
  return target.origin === new URL(pageUrl).origin ? target.pathname : `${target.origin}${target.pathname}`;
}

function connectionId(method, endpoint) {
  return `observed-${method}-${endpoint}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 80).replace(/-$/, '');
}

function observedConnection(item, scannedAt) {
  return {
    id: connectionId(item.method, item.endpoint),
    name: item.endpoint,
    method: item.method,
    endpoint: item.endpoint,
    sends: 'Not recorded by the scan',
    receives: `HTTP ${item.status}`,
    source: `Observed in the page's own traffic during the scan on ${scannedAt.slice(0, 10)}`,
    provenance: 'observed',
  };
}

// Adds API calls seen during the scan that the connection map does not list yet.
export function mergedConnections(connections, requests, pageUrl, scannedAt) {
  const known = new Set(connections.map(row => `${row.method} ${row.endpoint}`));
  const ids = new Set(connections.map(row => row.id));
  const added = [];
  for (const item of requests.filter(entry => httpMethods.has(entry.method))) {
    const row = observedConnection({ ...item, endpoint: endpointOf(item.url, pageUrl) }, scannedAt);
    if (known.has(`${row.method} ${row.endpoint}`) || ids.has(row.id)) continue;
    known.add(`${row.method} ${row.endpoint}`);
    ids.add(row.id);
    added.push(row);
  }
  return [...connections, ...added].slice(0, maximumConnections);
}
