import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-competitors-'));
const checkout = join(data, 'repo');
process.env.DOGFOOD_DATA = data;
process.env.DEEPSEEK_API_KEY = 'test-key';
const store = await import('../lib/store.mjs');
const competitors = await import('../lib/competitors.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

mkdirSync(checkout, { recursive: true });
writeFileSync(join(checkout, 'vision.md'), '# Vision\nShop makes booking a swim class take one tap.\n');
store.createProject({ id: 'shop', name: 'Shop', url: 'https://shop.example', checkout });

test('competitors are added by website, at most five, never twice and never the project itself', () => {
  assert.throws(() => competitors.addCompetitor('shop', { url: 'not a site' }), /http/);
  assert.throws(() => competitors.addCompetitor('shop', { url: 'https://shop.example/pricing' }), /own site/);
  const added = competitors.addCompetitor('shop', { url: 'https://www.rival.example/' });
  assert.deepEqual(added.map(({ id, name, scan, summary }) => [id, name, scan, summary]), [['rival-example', 'rival.example', null, null]]);
  assert.throws(() => competitors.addCompetitor('shop', { url: 'https://rival.example/about' }), /already a competitor/);
  for (const host of ['b', 'c', 'd', 'e']) competitors.addCompetitor('shop', { url: `https://${host}.example` });
  assert.throws(() => competitors.addCompetitor('shop', { url: 'https://f.example' }), /at most 5/);
});

test('a scan reads the landing page, then pricing and features before other pages, shallow first, skipping sign-in and legal', () => {
  const pages = ['/blog/about-us', '/login', '/privacy', '/docs/api/pricing', '/pricing', '/about', '/features', '/careers', '/team', '/product']
    .map(route => ({ id: route.slice(1).replace(/\//g, '-'), name: route, route }));
  const chosen = competitors.keyPages('https://rival.example/', pages);
  assert.deepEqual(chosen.map(page => page.route), ['/', '/pricing', '/about', '/features', '/product', '/docs/api/pricing']);
  assert.equal(chosen[0].id, 'landing');
  assert.equal(chosen[1].url, 'https://rival.example/pricing');
});

test('a scan reads each page once, whatever its trailing slash, and never files like sitemap.xml', () => {
  const pages = ['/pricing/', '/pricing', '/sitemap.xml', '/guide.pdf', '/features'].map(route => ({ id: route.replace(/\W+/g, '-'), name: route, route }));
  assert.deepEqual(competitors.keyPages('https://rival.example/', pages).map(page => page.route), ['/', '/pricing/', '/features']);
});

test('a bot check or a not-found page is reported instead of read as the competitor\'s content', () => {
  const content = (title, text = '', headings = []) => ({ title, text, headings });
  assert.match(competitors.pageProblem(content('Just a moment...', 'Performing security verification')), /bot check/);
  assert.match(competitors.pageProblem(content('Not Found', '', [{ level: 1, text: 'Page Not Found' }])), /does not exist/);
  assert.equal(competitors.pageProblem(content('Pricing | Rival', 'Plans from $9')), '');
});

test('a site is named by the part of its title that matches its host', () => {
  assert.equal(competitors.brandInTitle('AI Ad Generator - Make AI ads | Predis.ai', 'https://predis.ai/'), 'Predis.ai');
  assert.equal(competitors.brandInTitle('Trade Ideas: AI stock scanner', 'https://www.trade-ideas.com/'), 'Trade Ideas');
  assert.equal(competitors.brandInTitle('TrendSpider® Official - All-in-One Trading Software', 'https://trendspider.com/'), 'TrendSpider');
  assert.equal(competitors.brandInTitle('Stock charts for everyone', 'https://finviz.com/'), '');
});

// Stands in for a finished scan: one page read, one that failed.
function recordScan() {
  const file = join(data, 'competitors', 'shop.json');
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  saved.competitors[0].scan = {
    scannedAt: '2026-09-29T08:00:00.000Z',
    pages: [
      { id: 'landing', name: 'Home', url: 'https://rival.example/', title: 'Rival', description: 'Book anything.', headings: [{ level: 1, text: 'Book in seconds' }], text: 'Plans from $9 a month.', captures: {} },
      { id: 'pricing', name: 'Pricing', url: 'https://rival.example/pricing', error: 'dogfood could not open this page.' },
    ],
  };
  writeFileSync(file, JSON.stringify(saved));
}

const summary = {
  whatTheyDo: 'Online booking for classes.', whoItsFor: 'Studios.', pricing: 'From $9 a month.', howTheySell: 'Speed.',
  keyFeatures: ['Book a class'], theyDoBetter: ['Cheaper'], weDoBetter: ['One tap'], ideasToTake: ['Show prices up front'],
};

function stubProvider(content) {
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 900, completion_tokens: 200, cost: 0.0004 } }) };
  };
  return requests;
}

test('summarizing needs a scan first', async () => {
  await assert.rejects(() => competitors.summarizeCompetitor('shop', 'rival-example'), /Scan this competitor/);
});

test('a summary is sent the page text and our vision, never failed pages, and is stored with its scan and cost', async () => {
  recordScan();
  const requests = stubProvider(summary);
  const [rival] = await competitors.summarizeCompetitor('shop', 'rival-example');
  const prompt = requests[0].body.messages[0].content;
  assert.match(prompt, /booking a swim class take one tap/);
  assert.match(prompt, /Plans from \$9 a month/);
  assert.doesNotMatch(prompt, /could not open/);
  assert.equal(typeof prompt, 'string', 'text only, no screenshots');
  assert.deepEqual(rival.summary.weDoBetter, ['One tap']);
  assert.equal(rival.summary.scannedAt, '2026-09-29T08:00:00.000Z');
  assert.ok(rival.summary.usage.costUsd > 0);
});

test('a summary missing a required answer is refused, and the last good one stays', async () => {
  stubProvider({ ...summary, pricing: '  ' });
  await assert.rejects(() => competitors.summarizeCompetitor('shop', 'rival-example'), /left out pricing/);
  assert.equal(competitors.listCompetitors('shop')[0].summary.pricing, 'From $9 a month.');
});

test('an agent can record its own summary, attributed to it and tied to the scan it read', () => {
  const [rival] = competitors.recordCompetitorSummary('shop', 'rival-example', { ...summary, pricing: 'Free trial, then $15.' }, 'agent:proof');
  assert.deepEqual([rival.summary.by, rival.summary.pricing, rival.summary.scannedAt], ['agent:proof', 'Free trial, then $15.', '2026-09-29T08:00:00.000Z']);
  assert.throws(() => competitors.recordCompetitorSummary('shop', 'rival-example', { ...summary, whatTheyDo: '' }, 'agent:proof'), /left out whatTheyDo/);
});

test('removing a competitor deletes its screenshots', () => {
  const folder = join(data, 'captures', 'shop', 'competitors', 'rival-example');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'landing.png'), '');
  const left = competitors.removeCompetitor('shop', 'rival-example');
  assert.ok(!left.some(item => item.id === 'rival-example'));
  assert.equal(existsSync(folder), false);
});

test('a checkout-only project can collect competitor research before its app exists', () => {
  store.createProject({ id: 'not-built', name: 'Not built', checkout: data });
  const result = competitors.addCompetitor('not-built', { url: 'https://competitor.example' });
  assert.equal(result.length, 1);
});
