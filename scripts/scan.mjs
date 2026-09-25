import { scanPages, scanProject, withScanner } from '../lib/scanner.mjs';
import { pageById, readProject } from '../lib/store.mjs';

function selectedPages(project, ids) {
  if (!ids.length) return project.pages;
  return [...new Set(ids)].map(id => pageById(project, id));
}

function progress({ total, scanned, current }) {
  if (current) process.stderr.write(`Scanning ${scanned + 1} of ${total}: ${current}\n`);
}

function reportFailures(failed) {
  for (const failure of failed) process.stderr.write(`${failure.page}: ${failure.error}\n`);
  if (failed.length) process.exitCode = 1;
}

function reportChanged(changed) {
  if (changed.length) console.log(`Changed: ${changed.join(', ')}`);
  else console.log('No pages changed.');
}

async function scanAll(projectId) {
  const project = readProject(projectId);
  const result = await scanProject(projectId, progress);
  console.log(`${project.id}: scanned ${result.scanned}/${project.pages.length} pages; ${result.failed.length} failures`);
  reportChanged(result.changed);
  reportFailures(result.failed);
}

async function scanSelected(project, ids) {
  const pages = selectedPages(project, ids);
  const result = pages.length
    ? await withScanner(project.source.browserProfile, browser => scanPages(browser, project, pages, progress))
    : { scanned: 0, failed: [] };
  console.log(`${project.id}: scanned ${result.scanned}/${pages.length} pages; ${result.failed.length} failures`);
  reportFailures(result.failed);
}

async function main() {
  const [projectId, ...ids] = process.argv.slice(2);
  if (!projectId) throw new Error('Usage: npm run scan -- <project> [page…]');
  if (!ids.length) return scanAll(projectId);
  return scanSelected(readProject(projectId), ids);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
