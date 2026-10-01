import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { state, visiblePages, menuPages } from '../public/js/state.mjs';

const original = {};
const touched = ['project', 'query', 'filter', 'sort', 'pageId'];

function page(id, overrides = {}) {
  return {
    id, name: id, group: 'Product', route: `/${id}`, features: [], findings: [],
    progress: { status: 'untested', changedSinceReview: false, answers: [] },
    ...overrides,
  };
}

function fixture() {
  return [
    page('home', { name: 'Café home', group: 'Marketing', route: '/landing?ref=a+b', features: [{ name: 'Choose a membership', expected: 'Invisible expected prose' }] }),
    page('book', { name: 'Book a lesson', features: [{ name: 'Choose your time' }], findings: [
      { id: 'QA-107', title: 'Payment [draft]+ button', status: 'open', detail: 'Invisible finding detail' },
      { id: 'QA-108', title: 'Archived ghost', status: 'resolved' },
    ] }),
    page('japanese', { name: '東京の予約', features: [{ name: '水泳レッスン' }] }),
    page('article', { name: 'Café guide', group: 'Blog', route: '/blog/cafe' }),
  ];
}

function ids(query, read = visiblePages) {
  state.query = query;
  return read().map(item => item.id);
}

beforeEach(() => {
  for (const key of touched) original[key] = state[key];
  Object.assign(state, { project: { pages: fixture() }, query: '', filter: 'all', sort: 'navigation', pageId: 'book' });
});

afterEach(() => {
  for (const key of touched) state[key] = original[key];
});

test('page identifiers, routes, feature names and open bug identifiers are discoverable', () => {
  assert.deepEqual(ids('japanese'), ['japanese']);
  assert.deepEqual(ids('/landing'), ['home']);
  assert.deepEqual(ids('membership'), ['home']);
  assert.deepEqual(ids('qa-107'), ['book']);
  assert.deepEqual(ids('payment'), ['book']);
});

test('all terms match on the same page across fields, independent of order', () => {
  assert.deepEqual(ids('MEMBERSHIP /landing marketing'), ['home']);
  assert.deepEqual(ids('marketing /landing membership'), ['home']);
  assert.deepEqual(ids('home payment'), []);
  assert.deepEqual(ids('qa-107 lesson'), ['book']);
  assert.deepEqual(ids('  choose\tHOME\n'), ['home']);
});

test('each term retains substring matching', () => {
  assert.deepEqual(ids('members land'), ['home']);
  assert.deepEqual(ids('107 paym'), ['book']);
});

test('case and composed or decomposed accents are equivalent', () => {
  assert.deepEqual(ids('CAFE HOME'), ['home']);
  assert.deepEqual(ids('cafe\u0301 home'), ['home']);
  state.project.pages[0].name = 'Cafe\u0301 home';
  assert.deepEqual(ids('CAFÉ home'), ['home']);
});

test('non-Latin scripts stay searchable without transliteration', () => {
  assert.deepEqual(ids('東京 レッスン'), ['japanese']);
  assert.deepEqual(ids('予約'), ['japanese']);
  assert.deepEqual(ids('Tokyo'), []);
});

test('punctuation is literal rather than regex or markup', () => {
  assert.deepEqual(ids('[draft]+'), ['book']);
  assert.deepEqual(ids('?ref=a+b'), ['home']);
  assert.deepEqual(ids('.*'), []);
  assert.deepEqual(ids('<script>'), []);
  assert.deepEqual(ids('['), ['book']);
});

test('resolved bug text and explanatory prose do not create results', () => {
  assert.deepEqual(ids('qa-108'), []);
  assert.deepEqual(ids('archived'), []);
  assert.deepEqual(ids('Invisible expected'), []);
  assert.deepEqual(ids('Invisible finding'), []);
});

test('search uses updated page, feature and finding values immediately', () => {
  const home = state.project.pages[0];
  const book = state.project.pages[1];
  assert.deepEqual(ids('membership'), ['home']);
  home.features[0].name = 'Choose a subscription';
  assert.deepEqual(ids('membership'), []);
  assert.deepEqual(ids('subscription'), ['home']);
  book.findings[0].status = 'resolved';
  assert.deepEqual(ids('qa-107'), []);
  home.route = '/welcome';
  assert.deepEqual(ids('/landing'), []);
  assert.deepEqual(ids('/welcome'), ['home']);
});

test('blank search preserves site order and the menu excludes blog content', () => {
  assert.deepEqual(ids(' \t\n'), ['home', 'book', 'japanese', 'article']);
  assert.deepEqual(ids('', menuPages), ['home', 'book', 'japanese']);
  assert.deepEqual(ids('cafe', menuPages), ['home']);
  assert.deepEqual(ids('cafe'), ['home', 'article']);
});

test('search intersects existing status and changed-page filters', () => {
  Object.assign(state.project.pages[0].progress, { status: 'pass', changedSinceReview: true });
  state.project.pages[1].progress.status = 'needs_work';
  state.filter = 'needs';
  assert.deepEqual(ids('choose'), ['book']);
  state.filter = 'reviewed';
  assert.deepEqual(ids('choose'), ['home', 'book']);
  state.filter = 'untested';
  assert.deepEqual(ids('choose'), []);
  state.filter = 'changed';
  assert.deepEqual(ids('choose'), ['home']);
});

test('sorting keeps its meaning without changing source data or selection', () => {
  state.project.pages[1].progress.status = 'needs_work';
  state.project.pages[0].progress.answers = [{ status: 'pass' }];
  const before = structuredClone(state.project);
  state.sort = 'needs';
  assert.deepEqual(ids('choose'), ['book', 'home']);
  state.sort = 'least';
  assert.deepEqual(ids('choose'), ['book', 'home']);
  assert.deepEqual(state.project, before);
  assert.equal(state.pageId, 'book');
  state.sort = 'navigation';
  assert.deepEqual(ids('choose'), ['home', 'book']);
});

test('a project with no pages has no search results or menu entries', () => {
  state.project.pages = [];
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids('hello'), []);
  assert.deepEqual(ids('hello', menuPages), []);
});
