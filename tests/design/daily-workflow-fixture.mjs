// Deliberately synthetic evidence states, stored only in the named UI fixture dataset.
import { resolve, join } from 'node:path';
const data = resolve(process.argv[2]);
if (!data.includes('polish-fixture')) throw new Error('Use an isolated polish fixture dataset.');
process.env.DOGFOOD_DATA = data;
const store = await import('../../lib/store.mjs');
const id = process.env.DOGFOOD_UI_FIXTURE_PROJECT || 'daily-workflow-fixture';
if (!/^daily-workflow-fixture(?:-[a-z0-9]+)?$/.test(id)) throw new Error('Use an explicitly named synthetic fixture.');
const url = `http://127.0.0.1:4433/?project=${id}&view=overview`;
const by = 'agent:synthetic-fixture';
const example = store.pageById(store.readProject('tidepool'), 'home');
const files = Object.fromEntries(['desktop', 'mobile'].map(device => [device, join(data, example.captures[device].path.replace(/^\//, ''))]));
function scan() {
  store.recordScan(id, 'home', { sourceUrl: url, environment: 'mock', actor: 'Synthetic fixture', tier: 'mock',
    ...Object.fromEntries(['desktop', 'mobile'].map(device => [device, { file: files[device], viewport: example.captures[device].viewport, facts: example.scan.viewports[device] }])) });
}
if (process.argv[3] === 'rescan') {
  scan();
} else if (process.argv[3] === 'deployed') {
  store.recordDeployment(id, { url: 'https://live-fixture.example', revision: 'reported-fixture-revision', note: 'Synthetic receipt for UI state, not a real deployment.' }, by);
} else {
  store.createProject({ id, name: 'Daily workflow · synthetic fixture', url });
  store.registerPage(id, { id: 'home', name: 'Synthetic page', group: 'Fixture', route: '/', url, features: [{ id: 'local', name: 'Local preview', expected: 'Preview the synthetic local response.' }, { id: 'provider', name: 'Live provider output', expected: 'Verify actual provider output after deploying.', requiresLive: true }], untestedNote: 'All evidence is synthetic UI fixture content. No provider was called.' });
  scan();
  const page = store.pageById(store.readProject(id), 'home');
  const note = 'Synthetic fixture verdict only; no real security or provider proof.';
  store.recordVerdicts(id, 'home', { checks: Object.fromEntries(['design','purpose','ease'].map(key => [key, { status: 'pass', note }])), features: [{ id: 'local', status: 'pass', note }, { id: 'provider', status: 'awaiting_live', note: 'The real model is only available after deployment; no paid call is authorized.' }], audit: Object.fromEntries(Object.entries(page.audit).map(([key, rows]) => [key, rows.map(row => ({ id: row.id, status: 'pass', note }))])) }, by);
}
console.log(JSON.stringify({ fixture: id, action: process.argv[3] ?? 'seed', page: store.projectView(store.readProject(id)).pages[0].progress }));
