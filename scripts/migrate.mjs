// Upgrades version 2 projects to version 3: the five quality questions become the five
// questions about a page's features. Clarity keeps its verdict as Clear; the other old verdicts
// move to retiredChecks, kept on record but no longer counted. Usage: npm run migrate
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectsDir } from '../lib/paths.mjs';
import { manifestIntegrity, readProject, writeProject } from '../lib/store.mjs';

const untested = { status: 'untested', note: '' };
const today = new Date().toISOString().slice(0, 10);

function migratePage(page) {
  const { clarity, ...retired } = page.checks;
  page.retiredChecks = { ...retired, retiredAt: today };
  page.checks = { connected: untested, highlighted: untested, obvious: untested, accurate: untested, clear: clarity ?? untested };
}

// Re-stamps the hash only when dogfood's last write was intact, so an outside edit stays flagged.
function save(project, integrity) {
  if (integrity === 'verified') return writeProject(project);
  writeFileSync(join(projectsDir, `${project.id}.json`), `${JSON.stringify(project, null, 2)}\n`);
}

for (const id of readdirSync(projectsDir).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5))) {
  const project = readProject(id);
  if (project.version !== 2) {
    console.log(`${id}: version ${project.version}, nothing to do`);
    continue;
  }
  const integrity = manifestIntegrity(id);
  project.pages.forEach(migratePage);
  project.version = 3;
  save(project, integrity);
  console.log(`${id}: migrated ${project.pages.length} pages to version 3`);
}
