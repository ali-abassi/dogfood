import { scanPages, withScanner } from '../lib/scanner.mjs';
import { pageById, readProject } from '../lib/store.mjs';

function selectedPages(project, ids) {
  if (!ids.length) return project.pages;
  return [...new Set(ids)].map(id => pageById(project, id));
}

function progress({ total, scanned, current }) {
  if (current) process.stderr.write(`Scanning ${scanned + 1} of ${total}: ${current}\n`);
}

async function main() {
  const [projectId, ...ids] = process.argv.slice(2);
  if (!projectId) throw new Error('Usage: npm run scan -- <project> [page…]');
  const project = readProject(projectId);
  const pages = selectedPages(project, ids);
  const result = pages.length
    ? await withScanner(project.source.browserProfile, browser => scanPages(browser, project, pages, progress))
    : { scanned: 0, failed: [] };
  console.log(`${project.id}: scanned ${result.scanned}/${pages.length} pages; ${result.failed.length} failures`);
  for (const failure of result.failed) process.stderr.write(`${failure.page}: ${failure.error}\n`);
  if (result.failed.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
