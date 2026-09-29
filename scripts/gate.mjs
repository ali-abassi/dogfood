import { pagesGate } from '../lib/completion.mjs';
import { pageById, projectView, readProject } from '../lib/store.mjs';

// Exits 0 only when every named page (default: every page) passes dogfood's completion gate,
// 1 when one does not, and 2 when the request itself is wrong.
const args = process.argv.slice(2);
const mode = args.includes('--accept') ? 'acceptance' : 'audit';
const [projectId, ...pageIds] = args.filter(arg => arg !== '--accept');
try {
  if (!projectId || args.filter(arg => arg === '--accept').length > 1) throw new Error('Usage: npm run gate -- [--accept] <project> [page ...]');
  const project = projectView(readProject(projectId));
  const pages = pageIds.length ? pageIds.map(id => pageById(project, id)) : project.pages;
  const { complete, lines } = pagesGate(pages, mode);
  process.stdout.write(`${lines.join('\n') || `${projectId} has no pages.`}\n`);
  process.exitCode = complete ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
