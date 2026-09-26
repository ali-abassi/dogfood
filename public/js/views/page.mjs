import { escapeHtml, externalLinkMarkup, statusPill } from '../format.mjs';
import { groupedPages, isProjectView, state, statusNames, visiblePages } from '../state.mjs';

function menuSelectMarkup(id, label, value, options) {
  const items = options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('');
  return `<label class="menu-select">${label}<select id="${id}">${items}</select></label>`;
}

// Each status has its own shape as well as its colour, so the list reads without colour vision.
const statusShapes = { pass: '✓', needs_work: '!', in_review: '◐', untested: '–', blocked: '×' };

function statusMarkMarkup(status) {
  const label = statusNames[status] || status;
  return `<span class="menu-status status-${escapeHtml(status)}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${statusShapes[status] ?? ''}</span>`;
}

function pageOptionMarkup(page) {
  const selected = !isProjectView() && page.id === state.pageId;
  return `<button type="button" class="page-option ${selected ? 'selected' : ''}" data-page="${escapeHtml(page.id)}" ${selected ? 'aria-current="page"' : ''}><span>${escapeHtml(page.name)}</span>${statusMarkMarkup(page.progress.status)}</button>`;
}

export function pageOptionsMarkup(pages) {
  if (!state.project.pages.length) return '<p class="page-no-results" role="status">No pages yet.</p>';
  if (!pages.length) return '<p class="page-no-results" role="status">No pages match. Try another search or filter.</p>';
  return groupedPages(pages).map(({ group, pages: items }) => `<div class="page-group"><p>${escapeHtml(group)}</p>${items.map(pageOptionMarkup).join('')}</div>`).join('');
}

function projectPickerMarkup() {
  const options = state.projects.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.project.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  return `<label class="project-picker"><span class="sr-only">Project</span><select id="project-select">${options}</select></label>`;
}

export function sidebarMarkup() {
  const pages = visiblePages();
  const overviewSelected = state.view === 'overview';
  return `<aside class="page-sidebar ${state.browseOpen ? 'open' : ''}" aria-label="Project pages">
      <div class="page-sidebar-head"><img class="app-icon" src="/logo.svg" alt="" width="28" height="28"><strong>dogfood</strong><button type="button" class="page-sidebar-close" data-action="close-pages">Done</button></div>
        ${projectPickerMarkup()}
        <button type="button" class="add-project-button" data-action="add-project">+ Add project</button>
        <h2 class="sr-only">Pages</h2>
        <label class="search-field"><span class="sr-only">Search pages or features</span><span class="search-icon" aria-hidden="true"></span><input id="page-search" type="search" placeholder="Search pages or features" value="${escapeHtml(state.query)}"></label>
        <div class="menu-controls">${menuSelectMarkup('page-filter', 'Show', state.filter, [['all', 'All pages'], ['needs', 'Needs work'], ['untested', 'Not checked'], ['reviewed', 'Checked at least partly'], ['changed', 'Changed since last check']])}${menuSelectMarkup('page-sort', 'Sort', state.sort, [['navigation', 'Site order'], ['needs', 'Needs work first'], ['least', 'Least checked']])}</div>
        <nav class="page-list" aria-label="Pages"><button type="button" class="page-option overview-option ${overviewSelected ? 'selected' : ''}" data-overview ${overviewSelected ? 'aria-current="page"' : ''}>Overview</button><div class="page-groups">${pageOptionsMarkup(pages)}</div></nav>
        ${externalLinkMarkup(state.project.source.url, 'Open product ↗', 'source-link')}
  </aside>`;
}

// Removing a page is rare and needs a reason on record, so it hides behind an inline form.
function removePageMarkup(page) {
  if (state.removingPage !== page.id) return '';
  return `<form id="remove-page-form" class="finding-form remove-page-form" novalidate><label for="remove-reason">Why should ${escapeHtml(page.name)} not be in this project?</label><textarea id="remove-reason" name="reason" rows="2" required minlength="12" maxlength="400" placeholder="For example: a duplicate of Home, or a route that redirects."></textarea><div id="remove-page-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="danger-button" type="submit">Remove page</button><button class="text-button" type="button" data-action="cancel-remove-page">Cancel</button></div></form>`;
}

function checkAgainLabel(page) {
  const scanning = state.scan.running && state.scan.key === `${state.project.id}/${page.id}`;
  return scanning ? 'Checking the page…' : 'Check again';
}

// A page that has never been checked leads with Take screenshots in the screenshot panel instead.
function checkAgainMarkup(page) {
  if (!page.scan) return '';
  return `<button type="button" class="link-button" data-action="scan" ${state.scan.running ? 'disabled' : ''}>${escapeHtml(checkAgainLabel(page))}</button>`;
}

function scanErrorMarkup(page) {
  const own = state.scan.key === `${state.project.id}/${page.id}`;
  return own && state.scan.error ? `<p class="form-error" role="alert">${escapeHtml(state.scan.error)}</p>` : '';
}

export function pageHeaderMarkup(page) {
  const open = externalLinkMarkup(page.captures.desktop.sourceUrl, 'Open page ↗', 'link-button');
  return `<div class="page-heading"><div class="page-title"><p class="page-route" title="${escapeHtml(page.route)}">${escapeHtml(page.route)}</p><h1 id="selected-page-heading" tabindex="-1">${escapeHtml(page.name)}</h1></div><div class="page-actions">${statusPill(page.progress.status)}${checkAgainMarkup(page)}${open}<button type="button" class="remove-page-button" data-action="remove-page">Remove page…</button></div></div>${scanErrorMarkup(page)}${removePageMarkup(page)}`;
}

// Pages is the phone's way into the sidebar; on a computer the sidebar is always there.
export function toolbarMarkup() {
  return '<div class="toolbar"><button type="button" class="page-menu-toggle" data-action="open-pages">Pages</button></div>';
}
