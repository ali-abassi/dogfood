// Isolated, explicitly synthetic UI content; never points at a person's Dogfood data.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const data = resolve(process.argv[2] || join(repo, 'data/polish-fixture'));
execFileSync(process.execPath, [join(repo, 'tests/design/design-fixture.mjs'), data]);
process.env.DOGFOOD_DATA = data;
const store = await import(join(repo, 'lib/store.mjs'));
const tasks = await import(join(repo, 'lib/tasks.mjs'));

store.createProject({ id: 'dogfood-preview', name: 'Dogfood preview fixture', checkout: repo, url: 'http://127.0.0.1:4433' });
for (const [id, title, outcome] of [
  ['intent', 'Keep project intent inspectable', 'A new agent can read the intent and see the first available bounded outcome.'],
  ['evidence', 'Verify the actual project evidence', 'Current meaningful check results and page acceptance remain separate and inspectable.'],
  ['handoff', 'Resume without losing ownership or blockers', 'The next agent receives scoped work, native checks and a useful handoff.'],
]) tasks.addTask('dogfood-preview', { id, title, outcome, scope: ['scripts/cli.test.mjs'], checks: [{ id: 'native', command: ['node', '--test', 'scripts/cli.test.mjs'] }], pageIds: [], dependencies: [] }, 'fixture');
const docs = join(data, 'fixture-checkout');
mkdirSync(docs, { recursive: true });
const paragraph = 'Operations teams compare regional revenue, keep the fiscal calendar intact, and inspect the evidence behind every decision. A saved report must preserve currency, permissions and the selected product line across reloads.';
writeFileSync(join(docs, 'vision.md'), '# Northwind intent\n\n' + Array.from({ length: 15 }, (_, n) => `## Outcome ${n + 1}\n\n${paragraph}\n\n- Persist the full selection.\n- Explain failure without losing entered information.\n`).join('\n'));
writeFileSync(join(docs, 'design.md'), '# Northwind brand guide\n\n' + Array.from({ length: 12 }, (_, n) => `## Interface rule ${n + 1}\n\n${paragraph}\n\n| Role | Requirement |\n| --- | --- |\n| Long table content | All evidence remains inspectable without moving the page sideways. |\n`).join('\n'));
store.createProject({ id: 'long-docs', name: 'Northwind long document fixture', checkout: docs, url: 'https://northwind.example' });
store.setCoreFeatures('tidepool', [
  { id: 'booking', name: 'Book and manage a swimming lesson', summary: 'Choose a class, reserve a place and see the confirmation in your account.', pageIds: ['classes', 'book', 'account'] },
  { id: 'discovery', name: 'Find a suitable class', summary: 'Compare times, ages and prices before choosing a lesson.', pageIds: ['home', 'classes'] },
  { id: 'staff', name: 'Manage classes as a staff member', summary: 'Inspect staff-only controls and the permission boundary.', pageIds: ['admin'] },
], 'agent:polish-fixture');
store.setCoreFeatures('northwind', Array.from({ length: 8 }, (_, n) => ({ id: `outcome-${n}`, name: `Compare regional revenue and pipeline while preserving every report filter ${n + 1}`, summary: paragraph.slice(0, 230), pageIds: n % 2 ? ['revenue'] : ['revenue', 'pipeline'] })), 'agent:polish-fixture');

function competitorRecord(n) {
  const long = n > 0;
  const scannedAt = '2026-09-28T18:00:00.000Z';
  const screen = device => ({ path: `/captures/tidepool/classes${device === 'mobile' ? '-mobile' : ''}.png`, pixelWidth: device === 'mobile' ? 390 : 1440, pixelHeight: 2200 });
  const name = long ? `Harbor scheduling and lesson operations for multi-location swim schools ${n}` : 'Harbor scheduling';
  return { id: `harbor-${n}`, name, url: `https://harbor-${n}.example`, addedAt: scannedAt,
    scan: { scannedAt, pages: [{ name: 'Lesson scheduling', url: `https://harbor-${n}.example/scheduling`, title: name, description: 'Compare times and reserve a class.', headings: [{ level: 1, text: name }], captures: { desktop: screen('desktop'), mobile: screen('mobile') } }, { name: 'Pricing', url: `https://harbor-${n}.example/pricing`, error: 'The pricing page could not be reached in this fixture.' }] },
    summary: { whatTheyDo: 'Schedule lessons and manage availability across swim-school locations.', whoItsFor: 'Swim-school owners and front desk staff.', pricing: 'Pricing was not visible on the scanned page.', howTheySell: 'A product walkthrough leads to a booking request.', keyFeatures: ['Shared timetable', 'Location availability', 'Booking confirmation'], theyDoBetter: [long ? paragraph : 'Makes multi-location availability visible together.'], weDoBetter: ['Keeps page-level QA and evidence inspectable.'], ideasToTake: ['Keep location and time filters visible in the booking journey.'], by: 'agent:polish-fixture', summarizedAt: scannedAt, scannedAt: long ? '2026-09-27T18:00:00.000Z' : scannedAt } };
}
mkdirSync(join(data, 'competitors'), { recursive: true });
writeFileSync(join(data, 'competitors/tidepool.json'), JSON.stringify({ competitors: [competitorRecord(0)] }));
writeFileSync(join(data, 'competitors/northwind.json'), JSON.stringify({ competitors: Array.from({ length: 5 }, (_, n) => competitorRecord(n + 1)) }));

const manifest = JSON.parse(readFileSync(join(data, 'projects/tidepool.json'), 'utf8'));
for (const pageId of ['home', 'classes']) {
  const page = manifest.pages.find(item => item.id === pageId);
  const directory = join(data, 'visual-reviews/tidepool', pageId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, '2099-01-01T00-00-00.000Z-polish-fixture.json'), JSON.stringify({
    promptVersion: 'page-answers-v4', analyzedAt: '2099-01-01T00:00:00.000Z', captures: Object.fromEntries(['desktop', 'mobile'].map(device => [device, { sha256: page.captures[device].sha256 }])),
    analysis: { dimensions: { design: { score: 8, reason: 'Fixture review only.' }, purpose: { score: 8, reason: 'Fixture review only.' }, ease: { score: 8, reason: 'Fixture review only.' } }, suggestedFeatures: Array.from({ length: 6 }, (_, n) => ({ name: `Preserve the chosen lesson age and weekday when comparing locations ${n + 1}`, expected: paragraph })) },
  }));
}
console.log(`Isolated fixture ready at ${data}`);
