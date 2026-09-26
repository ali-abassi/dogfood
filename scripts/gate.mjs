import { pagesGate } from '../lib/completion.mjs';
import { pageById, projectView, readProject } from '../lib/store.mjs';

// Exits 0 only when every named page (default: every page) passes dogfood's completion gate,
// 1 when one does not, and 2 when the request itself is wrong.
const [projectId, ...pageIds] = process.argv.slice(2);
try {
  if (!projectId) throw new Error('Usage: npm run gate -- <project> [page ...]');
  const project = projectView(readProject(projectId));
  const pages = pageIds.length ? pageIds.map(id => pageById(project, id)) : project.pages;
  const { complete, lines } = pagesGate(pages);
  process.stdout.write(`${lines.join('\n') || `${projectId} has no pages.`}\n`);
  process.exitCode = complete ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
