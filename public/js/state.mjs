export const checkNames = {
  connected: ['Connected', 'Does each feature work end to end, with its data loading and saving?'],
  highlighted: ['Highlighted', 'Is each feature easy to find on the page?'],
  obvious: ['Obvious', 'Can a person tell what they can do here before trying it?'],
  accurate: ['Accurate', 'Does each feature do what the page says it does?'],
  clear: ['Clear', 'Is the page clear overall?'],
};
export const statusNames = { blocked: 'Blocked', untested: 'Untested', in_review: 'In review', pass: 'Pass', needs_work: 'Needs work', open: 'Open', resolved: 'Resolved' };
export const tierNames = { source: 'Source-based', automated: 'Automated', mock: 'Mock', real: 'Real browser', longitudinal: 'Longitudinal' };
export const auditNames = { security: 'Security', scraping: 'Automated copying', seo: 'Search visibility', accessibility: 'Accessibility' };
export const deviceNames = { desktop: 'Desktop', mobile: 'Mobile' };
export const deviceViewports = { desktop: '1440 × 900', mobile: '390 × 844' };
export const scanHeaderNames = ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy'];
export const scanSeoNames = { title: 'Title', description: 'Description', canonical: 'Canonical', robots: 'Robots', lang: 'Language', h1Count: 'H1 count' };
export const scanAccessibilityNames = { imagesWithoutAlt: 'Images without alt', unlabeledFields: 'Unlabeled fields', unnamedButtons: 'Unnamed buttons' };
export const requirementViews = { capture: 'capture', scan: 'capture', features: 'review', checks: 'review', audit: 'risk', connections: 'risk', tests: 'tests', 'ai-review': 'capture', issues: 'findings' };
export const requirementShortNames = { capture: 'Screenshots', scan: 'Scan', features: 'Features', checks: 'Questions', audit: 'Safety', connections: 'Connections', tests: 'Tests', 'ai-review': 'AI review', issues: 'Issues' };
export const requirementActions = { capture: 'See page', scan: 'See page', features: 'My review', checks: 'My review', audit: 'Safety & search', connections: 'Safety & search', tests: 'Run checks', 'ai-review': 'See page', issues: 'Issues' };
export const state = { projects: [], project: null, pageId: null, view: 'overview', query: '', filter: 'all', sort: 'navigation', browseOpen: false, editing: false, auditEditing: false, findingForm: null, removingPage: null, screenshotDevice: 'desktop', suggestions: { key: '', loading: false, items: [], error: '' }, scan: { key: '', running: false, error: '' }, scanAll: { running: false, total: null, scanned: 0, current: '', error: '' }, onboarding: { job: '', running: false, total: null, scanned: 0, current: null, error: '' }, projectDraft: { url: '', name: '', browserProfile: '' }, qa: { key: '', version: 0, runs: [], plan: [], planError: '', loading: false, running: false, error: '' }, visual: { key: '', loading: false, running: false, result: null, error: '' }, message: '' };

export function reviewedChecks(page) {
  return Object.values(page.checks).filter(item => item.status !== 'untested').length;
}

function matchesSearch(page) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return [page.name, page.group, ...page.features.map(item => item.name)].join(' ').toLowerCase().includes(query);
}

const pageFilters = {
  needs: page => ['needs_work', 'blocked'].includes(page.progress.status),
  reviewed: page => page.progress.status !== 'untested',
  untested: page => page.progress.status === 'untested',
  changed: page => page.progress.changedSinceReview === true,
};

function matchesPage(page) {
  if (!matchesSearch(page)) return false;
  const predicate = pageFilters[state.filter];
  return predicate ? predicate(page) : true;
}

export function visiblePages() {
  const pages = state.project.pages.filter(matchesPage);
  if (state.sort === 'needs') return pages.sort((a, b) => Number(['needs_work', 'blocked'].includes(b.progress.status)) - Number(['needs_work', 'blocked'].includes(a.progress.status)));
  if (state.sort === 'least') return pages.sort((a, b) => reviewedChecks(a) - reviewedChecks(b));
  return pages;
}

export function activePage() {
  return state.project?.pages.find(page => page.id === state.pageId) ?? null;
}

export function isProjectView() {
  return ['overview', 'add-project', 'suggestions'].includes(state.view);
}

export function ensureSelection() {
  if (isProjectView()) return;
  if (state.project.pages.some(page => page.id === state.pageId)) return;
  state.pageId = state.project.pages[0]?.id ?? null;
  state.view = defaultView(activePage());
}

// Pages without selected tests open on their review criteria instead of an empty runner.
export function defaultView(page) {
  return page?.qa.tests.length ? 'tests' : 'review';
}

export function groupedPages(pages) {
  const groups = [...new Set(pages.map(page => page.group))];
  return groups.map(group => ({ group, pages: pages.filter(page => page.group === group) }));
}
