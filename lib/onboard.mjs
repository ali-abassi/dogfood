import { discoverPages } from './discover.mjs';
import { startReview } from './reviews.mjs';
import { scanPages, withScanner } from './scanner.mjs';
import { createProject, listProjects, registerPage, text, validationError } from './store.mjs';

const localHosts = new Set(['localhost', '127.0.0.1']);

function productUrl(value) {
  const url = typeof value === 'string' && URL.canParse(value.trim()) ? new URL(value.trim()) : null;
  if (!url?.protocol.startsWith('http')) throw validationError('Product URL must be an HTTP(S) URL.');
  return url;
}

function optionalText(value, label, maximum) {
  return value === undefined || value === '' ? undefined : text(value, label, 1, maximum);
}

function projectSlug(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// The project ID comes from an explicit ID, else the name, else the site's host name.
function projectIdentity(input, url) {
  const name = optionalText(input.name, 'Project name', 100) ?? url.hostname;
  const id = projectSlug(optionalText(input.id, 'Project ID', 80) ?? name);
  if (!id) throw validationError('Project ID must contain a letter or number.');
  if (listProjects().some(project => project.id === id)) throw validationError(`Project ${id} already exists.`);
  return { id, name };
}

// Checks everything that can be checked before the slow part, so callers can refuse early.
export function onboardingPlan(input) {
  const url = productUrl(input?.url);
  return {
    url: url.href,
    ...projectIdentity(input, url),
    browserProfile: optionalText(input.browserProfile, 'Browser profile', 100),
    environment: localHosts.has(url.hostname) ? 'Local' : 'Live site',
    aiReview: input.aiReview === true,
  };
}

// Optional and paid: asks the AI review about each scanned page so it arrives with suggested
// features. A page whose review fails is reported and skipped; onboarding still finishes.
async function reviewPages(projectId, pages, onProgress) {
  const failed = [];
  for (const [index, page] of pages.entries()) {
    onProgress({ phase: 'review', total: pages.length, scanned: index, current: page.name });
    try { await startReview(projectId, page.id); }
    catch (error) { failed.push({ page: page.id, error: error.message }); }
  }
  return { reviewed: pages.length - failed.length, reviewFailed: failed };
}

export function onboard(plan, onProgress = () => {}) {
  return withScanner(plan.browserProfile, async browser => {
    const pages = await discoverPages(browser, plan.url);
    const project = createProject(plan);
    for (const page of pages) registerPage(project.id, page);
    const result = await scanPages(browser, project, pages, progress => onProgress({ phase: 'scan', ...progress }));
    const failedIds = new Set(result.failed.map(item => item.page));
    const reviews = plan.aiReview ? await reviewPages(project.id, pages.filter(page => !failedIds.has(page.id)), onProgress) : { reviewed: 0, reviewFailed: [] };
    return { project: project.id, name: project.name, pageCount: pages.length, ...result, ...reviews };
  });
}

export function onboardProject(input, onProgress) {
  return onboard(onboardingPlan(input), onProgress);
}
