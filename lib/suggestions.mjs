import { dataDir } from './paths.mjs';
import { readProject } from './store.mjs';
import { latestVisualReview } from './visual-review.mjs';

// The AI review's suggested features that each page does not list yet, so a person or agent
// can go through a whole project at once. Suggestions from a review of older screenshots are
// still offered, marked stale, because a page's features rarely change with its pixels.
function pendingForPage(project, page) {
  const { review, stale } = latestVisualReview(dataDir, project.id, page.id, page.captures);
  const listed = new Set(page.features.map(item => item.name.toLowerCase()));
  const suggestions = (review?.analysis.suggestedFeatures ?? []).filter(item => !listed.has(item.name.toLowerCase()));
  return { page: page.id, name: page.name, group: page.group, stale, suggestions };
}

export function pendingSuggestions(projectId) {
  const project = readProject(projectId);
  return project.pages.map(page => pendingForPage(project, page)).filter(entry => entry.suggestions.length);
}
