// Words people see. The server sends each answer's name, question, and summary; these name states.
export const statusNames = { blocked: 'Can’t open', untested: 'Not checked', in_review: 'Partly checked', pass: 'Good', needs_work: 'Needs work', open: 'Open', resolved: 'Fixed' };
export const answerWords = { pass: 'Good', needs_work: 'Needs work', partial: 'Partly checked', untested: 'Not checked', recheck: 'Recheck', blocked: 'Blocked' };
export const answerShortNames = { design: 'Looks', purpose: 'Purpose', ease: 'Ease', safety: 'Safety', speed: 'Speed', works: 'Works' };
export const answerIds = Object.keys(answerShortNames);
export const severityNames = { P0: 'Breaks the app', P1: 'Blocks this page', P2: 'Annoying', P3: 'Cosmetic' };
const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const questionTopics = { security: 'Security', scraping: 'Copying', seo: 'Search', accessibility: 'Accessibility' };
export const deviceNames = { desktop: 'Computer', mobile: 'Phone' };
export const state = { projects: [], project: null, pageId: null, view: 'overview', query: '', filter: 'all', sort: 'navigation', browseOpen: false, answerEditing: false, questionsEditing: false, thingsEditing: false, addingThing: false, findingForm: null, removingPage: null, screensDevice: 'desktop', copied: false, suggestions: { key: '', loading: false, items: [], error: '' }, scan: { key: '', running: false, error: '' }, scanAll: { running: false, total: null, scanned: 0, current: '', error: '' }, onboarding: { job: '', running: false, total: null, scanned: 0, current: null, error: '' }, projectDraft: { url: '', name: '', browserProfile: '' }, qa: { key: '', version: 0, runs: [], plan: [], planError: '', loading: false, running: false, error: '' }, visual: { key: '', loading: false, running: false, result: null, error: '' }, docs: { key: '', loading: false, data: null, error: '' }, history: { key: '', loading: false, shots: null, error: '', day: '' }, competitors: { key: '', loading: false, items: [], error: '', open: '', adding: false, scanning: {}, summarizing: '', removing: '' }, message: '' };

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

// A Good answer reads Recheck, not Good, when any of its evidence predates the page's last visual
// change: verdicts and reviews from before describe a page that no longer looks like this one.
// Measurements come from the current scan, so they never go stale; evidence without a time cannot
// prove it is fresh, so it reads Recheck too.
export function displayAnswerStatus(page, answer) {
  if (answer.status !== 'pass' || !page.progress.changedSinceReview) return answer.status;
  const lastChangedAt = Date.parse(page.scan?.lastChangedAt);
  const stale = answer.parts.some(part => part.source !== 'scan' && !(Date.parse(part.at) >= lastChangedAt));
  return stale ? 'recheck' : answer.status;
}

export function isProjectView() {
  return ['overview', 'features', 'competitors', 'vision', 'guide', 'plan', 'add-project', 'suggestions'].includes(state.view);
}

// Blog posts are content, not product: the menu leaves them out; the overview still lists them.
export function menuPages() {
  return visiblePages().filter(page => !/blog/i.test(page.group));
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

function findingTime(finding) {
  const at = Date.parse(finding.at);
  return Number.isFinite(at) ? at : Infinity;
}

function compareFindings(a, b) {
  return severityRank[a.severity] - severityRank[b.severity] || findingTime(a) - findingTime(b);
}

// A page's open bugs, worst and oldest first.
export function openFindings(page) {
  return page.findings.filter(item => item.status === 'open').sort(compareFindings);
}

// The overview's Fix first: open P0–P2 bugs across pages, worst and oldest first.
export function fixFirstFindings(pages) {
  return pages.flatMap(page => openFindings(page).filter(item => item.severity !== 'P3').map(finding => ({ page, finding })))
    .sort((a, b) => compareFindings(a.finding, b.finding));
}
