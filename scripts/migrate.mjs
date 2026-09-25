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

const steps = { 2: toVersion3, 3: toVersion4 };

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
