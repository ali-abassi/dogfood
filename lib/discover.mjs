import { openPage } from './scanner.mjs';

const maximumPages = 50;
const maximumRoute = 300;
// Runs in the page: every visible link with its text and the navigation section it sits in.
const linkScript = `(() => {
  const visible = element => {
    const style = getComputedStyle(element);
    return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const groupFor = link => {
    const labelled = link.closest('[aria-label]')?.getAttribute('aria-label')?.trim();
    if (labelled) return labelled;
    const nav = link.closest('nav');
    if (!nav) return 'Pages';
    const preceding = [...nav.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="group"],[role="region"]')]
      .filter(item => item.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING);
    return preceding.at(-1)?.innerText.trim() || 'Pages';
  };
  return {
    url: location.href,
    links: [...document.querySelectorAll('a[href]:not([download])')].filter(visible)
      .map(link => ({ href: link.href, text: link.innerText.trim(), group: groupFor(link) })),
  };
})()`;

function decodeXml(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(amp|quot|apos|lt|gt);/g, (entity, name) => entities[name]);
}

async function sitemapLocations(origin) {
  const response = await fetch(new URL('/sitemap.xml', origin), { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!response?.ok) return [];
  const xml = await response.text();
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map(([, value]) => decodeXml(value.trim()));
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// A same-site link's route: its path plus a hash route (#/brand) for single-page apps.
// Plain anchors (#section) and query strings do not make a different page.
function routeOf(href, base) {
  if (!URL.canParse(href, base)) return null;
  const target = new URL(href, base);
  if (target.origin !== new URL(base).origin || !target.protocol.startsWith('http')) return null;
  return `${target.pathname}${target.hash.startsWith('#/') ? target.hash : ''}`;
}

function slug(route) {
  const path = route.replace('/#/', '/').replace(/^\/+|\/+$/g, '');
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'home';
}

function uniqueId(base, used) {
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function segmentName(route) {
  const last = route.replace('/#/', '/').split('/').filter(Boolean).at(-1);
  if (!last) return 'Home';
  return cleanText(last.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()));
}

// Rendered links come first (they carry names and navigation groups), then the landing
// page itself, then pages only the sitemap knows about.
function discoveredPages(landing, sitemap) {
  const candidates = [
    ...landing.links.map(link => ({ href: link.href, name: link.text, group: link.group })),
    { href: landing.url, name: '', group: 'Pages' },
    ...sitemap.map(href => ({ href, name: '', group: 'Other pages' })),
  ];
  const byRoute = new Map();
  for (const candidate of candidates) {
    const route = routeOf(candidate.href, landing.url);
    if (route && route.length <= maximumRoute && !byRoute.has(route)) byRoute.set(route, candidate);
  }
  const used = new Set();
  return [...byRoute].slice(0, maximumPages).map(([route, candidate]) => ({
    id: uniqueId(slug(route), used),
    name: cleanText(candidate.name) || segmentName(route),
    group: cleanText(candidate.group) || 'Pages',
    route,
  }));
}

export async function discoverPages(browser, url) {
  await openPage(browser, url);
  const landing = await browser.evaluate(linkScript);
  return discoveredPages(landing, await sitemapLocations(new URL(url).origin));
}
