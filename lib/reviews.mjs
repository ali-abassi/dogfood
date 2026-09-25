import { dataDir } from './paths.mjs';
import { pageById, readProject, validationError } from './store.mjs';
import { latestVisualReview, runVisualReview } from './visual-review.mjs';

const reviewingPages = new Set();

// The saved review keeps the full provider request and response; callers see only the result.
function visibleReview(result) {
  if (!result.review) return result;
  const { model, analyzedAt, latencyMs, captures, analysis, usage, promptVersion } = result.review;
  return { review: { model, analyzedAt, latencyMs, captures, analysis, usage, promptVersion }, stale: result.stale };
}

export function currentReview(projectId, pageId) {
  const page = pageById(readProject(projectId), pageId);
  return visibleReview(latestVisualReview(dataDir, projectId, pageId, page.captures));
}

function reviewablePage(project, pageId) {
  const page = pageById(project, pageId);
  if (page.captures.desktop.state !== 'rendered' || !page.captures.desktop.fullPage) throw validationError('Capture the full desktop page before running visual analysis.');
  return page;
}

// Sends the screenshot to the model provider, which spends provider usage.
export async function startReview(projectId, pageId) {
  const project = readProject(projectId);
  const page = reviewablePage(project, pageId);
  const key = `${projectId}/${pageId}`;
  if (reviewingPages.has(key)) throw validationError('Visual analysis is already running for this page.');
  reviewingPages.add(key);
  try { return visibleReview(await runVisualReview(dataDir, project, page)); }
  catch (error) { error.status ??= 502; throw error; }
  finally { reviewingPages.delete(key); }
}
