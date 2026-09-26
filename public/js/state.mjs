// Words people see. The server sends each answer's name, question, and summary; these name states.
export const statusNames = { blocked: 'Can’t open', untested: 'Not checked', in_review: 'Partly checked', pass: 'Good', needs_work: 'Needs work', open: 'Open', resolved: 'Fixed' };
export const answerWords = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked' };
export const answerShortNames = { design: 'Looks', purpose: 'Purpose', ease: 'Ease', safety: 'Safety', speed: 'Speed', works: 'Works' };
export const answerIds = Object.keys(answerShortNames);
export const severityNames = { P0: 'Breaks the app', P1: 'Blocks this page', P2: 'Annoying', P3: 'Cosmetic' };
export const questionTopics = { security: 'Security', scraping: 'Copying', seo: 'Search', accessibility: 'Accessibility' };
export const deviceNames = { desktop: 'Computer', mobile: 'Phone' };
export const state = { projects: [], project: null, pageId: null, view: 'overview', query: '', filter: 'all', sort: 'navigation', browseOpen: false, answerEditing: false, questionsEditing: false, thingsEditing: false, addingThing: false, findingForm: null, removingPage: null, screensDevice: 'desktop', copied: false, suggestions: { key: '', loading: false, items: [], error: '' }, scan: { key: '', running: false, error: '' }, scanAll: { running: false, total: null, scanned: 0, current: '', error: '' }, onboarding: { job: '', running: false, total: null, scanned: 0, current: null, error: '' }, projectDraft: { url: '', name: '', browserProfile: '' }, qa: { key: '', version: 0, runs: [], plan: [], planError: '', loading: false, running: false, error: '' }, visual: { key: '', loading: false, running: false, result: null, error: '' }, message: '' };

// While any inline form is open, its Save is the view's one blue button.
export function editorOpen() {
  return Boolean(state.answerEditing || state.questionsEditing || state.thingsEditing || state.addingThing || state.findingForm);
}

// The view's primary action, demoted to grey while a form holds the one blue button.
export function primaryClass() {
  return editorOpen() ? 'text-button' : 'save-button';
}

function answeredCount(page) {
  return page.progress.answers.filter(answer => answer.status === 'pass' || answer.status === 'needs_work').length;
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
  if (state.sort === 'least') return pages.sort((a, b) => answeredCount(a) - answeredCount(b));
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
  state.view = 'report';
}

export function groupedPages(pages) {
  const groups = [...new Set(pages.map(page => page.group))];
  return groups.map(group => ({ group, pages: pages.filter(page => page.group === group) }));
}
