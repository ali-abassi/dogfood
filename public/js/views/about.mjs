import { answerMarkMarkup, escapeHtml } from '../format.mjs';
import { state } from '../state.mjs';

const provenanceWords = { source: 'from the code', observed: 'seen in its traffic', manual: 'added by hand' };

function factMarkup(label, value) {
  return value ? `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>` : '';
}

// What a page is for rarely changes between screenshots, so the latest AI check describes it even when older.
function aiFactsMarkup() {
  const analysis = state.visual.result?.review?.analysis;
  if (!analysis) return factMarkup('What it’s for', 'Not described yet. Check with AI describes the page from its screenshots.');
  return `${factMarkup('What it’s for', analysis.pagePurpose)}${factMarkup('Main action', analysis.primaryAction)}`;
}

function seoFactsMarkup(page) {
  const seo = page.scan?.viewports.desktop.seo;
  return seo ? `${factMarkup('Title', seo.title)}${factMarkup('Search description', seo.description)}` : '';
}

function descriptionMarkup(page) {
  return `<dl class="facts about-facts">${aiFactsMarkup()}${seoFactsMarkup(page)}</dl>`;
}

function featureMarkup(feature) {
  const expected = feature.expected ? `<small>${escapeHtml(feature.expected)}</small>` : '';
  return `<li>${answerMarkMarkup(feature.name, feature.status)}<span><strong>${escapeHtml(feature.name)}</strong>${expected}</span></li>`;
}

function featuresMarkup(page) {
  const body = page.features.length
    ? `<ul class="about-features">${page.features.map(featureMarkup).join('')}</ul>`
    : '<p class="muted">No things to do are listed yet.</p>';
  return `<section class="about-part" data-about-features><div class="panel-heading"><h3>Things people can do · ${page.features.length}</h3><button type="button" class="text-button" data-view="works">Open checks</button></div>${body}</section>`;
}

// Links from both screen sizes, each once; a phone menu can hold links the computer layout does not.
function pageLinks(page) {
  const viewports = page.scan?.viewports;
  if (!viewports?.desktop.links) return null;
  const byHref = new Map([...viewports.desktop.links, ...(viewports.mobile.links ?? [])].map(link => [link.href, link]));
  return [...byHref.values()];
}

function linkMarkup(link, origin) {
  const url = new URL(link.href);
  const where = url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : link.href;
  return `<li><a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.text || where)}</a><span>${escapeHtml(where)}</span></li>`;
}

function linkGroupMarkup(title, links, origin) {
  return links.length ? `<h4>${escapeHtml(title)} · ${links.length}</h4><ul class="about-links">${links.map(link => linkMarkup(link, origin)).join('')}</ul>` : '';
}

function linksBodyMarkup(links, origin) {
  const own = links.filter(link => link.href.startsWith(`${origin}/`) || link.href === origin);
  const other = links.filter(link => !own.includes(link));
  return `${linkGroupMarkup('On this site', own, origin)}${linkGroupMarkup('Elsewhere', other, origin)}`;
}

function linksMarkup(page) {
  const links = pageLinks(page);
  if (!links) return `<section class="about-part"><h3>Links</h3><p class="muted">${page.scan ? 'Listed after the next check.' : 'Check the page to list its links.'}</p></section>`;
  const origin = new URL(page.scan.sourceUrl).origin;
  return `<details class="about-part about-disclosure" data-links><summary><h3>Links · ${links.length}</h3></summary>${links.length ? linksBodyMarkup(links, origin) : '<p class="muted">This page has no links.</p>'}</details>`;
}

function connectionMarkup(row) {
  const how = provenanceWords[row.provenance] ?? row.provenance;
  return `<li><span class="about-endpoint">${escapeHtml(row.method)} ${escapeHtml(row.endpoint)}</span><small>${escapeHtml(row.name)} · sends ${escapeHtml(row.sends)} · gets ${escapeHtml(row.receives)} · ${escapeHtml(how)}</small></li>`;
}

function connectionsMarkup(page) {
  if (!page.connections.length) return `<section class="about-part"><h3>Data connections</h3><p class="muted">${page.scan ? 'None seen yet.' : 'Check the page to see where it sends and receives data.'}</p></section>`;
  return `<details class="about-part about-disclosure" data-connections><summary><h3>Data connections · ${page.connections.length}</h3></summary><ul class="about-connections">${page.connections.map(connectionMarkup).join('')}</ul></details>`;
}

// What the page is, what people can do on it, where it links, and which APIs it calls.
export function aboutMarkup(page) {
  return `<section class="content-panel about-page" data-about aria-labelledby="about-heading"><h2 id="about-heading">About this page</h2>${descriptionMarkup(page)}${featuresMarkup(page)}${linksMarkup(page)}${connectionsMarkup(page)}</section>`;
}
