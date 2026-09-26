// Builds the design-evidence data folder: the Tidepool demo, a long-content project that stresses
// every surface with maximum credible names, notes, things, bugs, and connections, and an app with no pages.
// Usage: node tests/design/design-fixture.mjs <data-dir>
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = process.argv[2];
cpSync(join(repo, 'demo'), data, { recursive: true });
process.env.DOGFOOD_DATA = data;
const store = await import(join(repo, 'lib/store.mjs'));

const longNote = `${'The region filter resets when the product line changes, so comparing two lines takes three extra clicks and loses the fiscal calendar. '.repeat(8)}Seen at 1440 × 900 and 390 × 844.`;
store.createProject({
  id: 'northwind', name: 'Northwind Analytics for Operations and Revenue Teams', url: 'https://app.northwind-analytics.example',
  guidelines: ['Numbers use tabular figures and right alignment.', 'One primary action per screen.', 'Every chart states its time range and data freshness.'],
});
store.registerPage('northwind', {
  id: 'revenue', name: 'Revenue by region, product line, and sales channel over time', group: 'Workspace and reporting',
  route: '/workspace/reports/revenue-by-region-product-line-and-channel?period=trailing-twelve-months&currency=usd',
  features: Array.from({ length: 9 }, (_, n) => ({ id: `f${n}`, name: `Compare revenue for a region against the same period last year, view ${n + 1}`, expected: 'The comparison appears within a second and keeps every other filter, including after a reload.' })),
});
store.registerPage('northwind', { id: 'pipeline', name: 'Pipeline forecast', group: 'Workspace and reporting', route: '/workspace/pipeline' });
store.recordVerdicts('northwind', 'revenue', {
  checks: { design: { status: 'needs_work', note: longNote }, purpose: { status: 'pass', note: 'The heading and the period selector say this is revenue by region for the last twelve months.' } },
  features: Array.from({ length: 5 }, (_, n) => ({ id: `f${n}`, status: n === 2 ? 'needs_work' : 'pass', note: n === 2 ? longNote : 'Chose EMEA and Hardware, compared with last year; the numbers appeared in under a second and the other filters stayed.' })),
}, 'agent:design-fixture');
for (const severity of ['P1', 'P2', 'P3']) store.createFinding('northwind', 'revenue', { severity, title: `Region filter resets when the product line changes and loses the fiscal calendar (report ${['P1', 'P2', 'P3'].indexOf(severity) + 1})`, detail: longNote, attachCapture: false }, 'agent:design-fixture');
store.setConnections('northwind', 'revenue', Array.from({ length: 12 }, (_, n) => ({
  id: `c${n}`, name: `Revenue query ${n + 1}`, method: n % 4 ? 'GET' : 'POST',
  endpoint: `/api/v2/workspaces/northwind/reports/revenue/regions/${['emea', 'amer', 'apac'][n % 3]}/product-lines?include=channels,currencies&period=ttm&page=${n}`,
  sends: 'Workspace ID, report filters, fiscal calendar, and currency', receives: 'Revenue rows with currency, period, and channel breakdowns',
  source: 'Observed in the page traffic during the page check', provenance: 'observed',
})));
store.createProject({ id: 'empty-app', name: 'Brand new app', url: 'https://new-app.example' });
console.log('fixture ready');
