// Upgrades projects to the current manifest version, one version at a time. Retired verdicts stay
// on record under retiredChecks; they no longer count. Usage: npm run migrate
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectsDir } from '../lib/paths.mjs';
import { manifestVersion } from '../lib/schema.mjs';
import { manifestIntegrity, readProject, writeProject } from '../lib/store.mjs';

const untested = { status: 'untested', note: '' };
const today = new Date().toISOString().slice(0, 10);

function retire(page, checks) {
  const answered = Object.entries(checks).filter(([, entry]) => entry && entry.status !== 'untested');
  page.retiredChecks = { ...page.retiredChecks, ...Object.fromEntries(answered), retiredAt: today };
}

// Version 3: the five quality questions became five questions about features; clarity became clear.
function toVersion3(page) {
  const { clarity, ...retired } = page.checks;
  retire(page, retired);
  page.checks = { connected: untested, highlighted: untested, obvious: untested, accurate: untested, clear: clarity ?? untested };
}

// Version 4: the six answers. Design fit returns as Looks right, and clear (can a person tell
// what to do) becomes Easy to use; Clear purpose starts unanswered.
function toVersion4(page) {
  const { clear, ...retired } = page.checks;
  const design = page.retiredChecks?.design ?? untested;
  retire(page, retired);
  delete page.retiredChecks.design;
  page.checks = { design, purpose: untested, ease: clear ?? untested };
}

// Version 5: pages found by onboarding used to get the note "Nothing beyond the scan and
// screenshots has been checked yet." It went stale as soon as anyone checked the page, so it is
// cleared; the report now works out what is unanswered from the answers themselves.
const staleDefaultNote = 'Nothing beyond the scan and screenshots has been checked yet.';

function toVersion5(page) {
  if (page.qa.note === staleDefaultNote) page.qa.note = '';
}

// Version 6: the default checklist questions are reworded for people who are not engineers.
// A question someone edited keeps its wording.
const plainQuestions = {
  'inputs': ['Are inputs validated on the server?', 'Does the server check everything people type before it saves it?'],
  'private-data': ['Does the page avoid exposing other people’s data?', 'Can people see only their own information, even if they change a link?'],
  'headers': ['Are security headers and third-party scripts appropriate?', 'Does the page load only the scripts it needs, from places it trusts?'],
  'bulk': ['Are data endpoints rate-limited against bulk copying?', 'Is there a limit on how fast one visitor can pull data, so nobody can copy it all?'],
  'public-copy': ['Is only intentionally public content exposed to crawlers?', 'Can search engines and bots see only what is meant to be public?'],
  'title': ['Does the page have a specific title and description?', 'Does the page have its own clear title and a short description for search results?'],
  'indexing': ['Is the page indexed only if it should be public?', 'Does the page show up in search only if it is meant to be public?'],
  'keyboard': ['Can every control be reached and used with the keyboard alone, with a visible focus?', 'Can you use everything with only the keyboard, and always see where you are?'],
  'names': ['Do images, fields, and buttons have accessible names?', 'Do pictures, fields, and buttons have names a screen reader can read out?'],
  'contrast': ['Does text meet WCAG AA contrast in light and dark themes?', 'Is all text easy to read against its background, in every theme the app has?'],
  'reflow': ['Does the page stay usable at 200% zoom and on a narrow phone screen?', 'Does the page still work when zoomed to 200% and on a narrow phone?'],
};

function toVersion6(page) {
  for (const row of Object.values(page.audit).flat()) {
    const [before, after] = plainQuestions[row.id] ?? [];
    if (row.question === before) row.question = after;
  }
}

const steps = { 2: toVersion3, 3: toVersion4, 4: toVersion5, 5: toVersion6 };

// Re-stamps the hash only when dogfood's last write was intact, so an outside edit stays flagged.
function save(project, integrity) {
  if (integrity === 'verified') return writeProject(project);
  writeFileSync(join(projectsDir, `${project.id}.json`), `${JSON.stringify(project, null, 2)}\n`);
}

function migrate(id) {
  const project = readProject(id);
  const from = project.version;
  if (!steps[from]) return `${id}: version ${from}, nothing to do`;
  const integrity = manifestIntegrity(id);
  for (let version = from; version < manifestVersion; version += 1) {
    project.pages.forEach(steps[version]);
    project.version = version + 1;
  }
  save(project, integrity);
  return `${id}: migrated ${project.pages.length} pages from version ${from} to ${manifestVersion}`;
}

for (const name of readdirSync(projectsDir).filter(item => item.endsWith('.json'))) console.log(migrate(name.slice(0, -5)));
