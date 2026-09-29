import { scanPages, scanProject, withScanner } from '../lib/scanner.mjs';
import { fixtureNames } from '../lib/scan-target.mjs';
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

async function scanAll(projectId, options) {
  const project = readProject(projectId);
  const result = await scanProject(projectId, progress, options);
  console.log(`${project.id}: scanned ${result.scanned}/${project.pages.length} pages; ${result.failed.length} failures`);
  reportChanged(result.changed);
  reportFailures(result.failed);
}

async function scanSelected(project, ids, options) {
  const pages = selectedPages(project, ids);
  const explicitProfile = Boolean(options.browserProfile || options.requiredRole || pages.some(page => page.requiredRole));
  const result = pages.length
    ? await withScanner(options.browserProfile ?? project.source.browserProfile, browser => scanPages(browser, project, pages, progress, options), { explicitProfile })
    : { scanned: 0, failed: [] };
  console.log(`${project.id}: scanned ${result.scanned}/${pages.length} pages; ${result.failed.length} failures`);
  reportFailures(result.failed);
}

const flags = { '--live-url': 'liveUrl', '--browser-profile': 'browserProfile', '--required-role': 'requiredRole', '--fixtures': 'fixtures' };

function parseArguments(args) {
  const ids = [];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) { ids.push(argument); continue; }
    const key = flags[argument];
    if (!key) throw new Error(`Unknown scan option: ${argument}`);
    const value = args[++index];
    requireValue(argument, value);
    addOption(options, key, value);
  }
  return { projectId: ids.shift(), ids, options };
}

function requireValue(argument, value) {
  if (!value || value.startsWith('--')) throw new Error(`${argument} needs a value.`);
}

function addOption(options, key, value) {
  if (key === 'fixtures') options.fixtures = fixtureNames([...(options.fixtures || []), ...value.split(',')]);
  else options[key] = value;
}

async function main() {
  const { projectId, ids, options } = parseArguments(process.argv.slice(2));
  if (!projectId) throw new Error('Usage: npm run scan -- <project> [page…] [--live-url URL] [--browser-profile PROFILE] [--required-role ROLE] [--fixtures NAME,…]');
  if (!ids.length) return scanAll(projectId, options);
  return scanSelected(readProject(projectId), ids, options);
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
