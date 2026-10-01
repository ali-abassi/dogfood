import { escapeHtml, externalLinkMarkup, plainMessageMarkup, statusPill } from '../format.mjs';
import { groupedPages, isProjectView, menuPages, state, statusNames } from '../state.mjs';

function menuSelectMarkup(id, label, value, options) {
  const items = options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('');
  return `<label class="menu-select"><span class="sr-only">${label}</span><select id="${id}">${items}</select></label>`;
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

// Line icons at the text's weight, drawn on a 16-point grid.
const navIcons = {
  competitors: '<circle cx="5.8" cy="6" r="2.3"/><circle cx="11" cy="6.8" r="1.9"/><path d="M1.8 13.2c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6"/><path d="M10.4 10.1c1.9-.3 3.4.8 3.8 3.1"/>',
  overview: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1.2"/><rect x="9" y="9" width="4.5" height="4.5" rx="1.2"/>',
  vision: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.2"/>',
  guide: '<path d="M8 2.5a5.5 5.5 0 1 0 0 11c1 0 1.3-.8.9-1.5-.5-.8 0-1.8 1-1.8h1.2a2.4 2.4 0 0 0 2.4-2.4C13.5 4.7 11 2.5 8 2.5z"/><circle cx="5.3" cy="7" r=".6"/><circle cx="7.6" cy="5" r=".6"/><circle cx="10.4" cy="5.8" r=".6"/>',
  plan: '<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M2.5 4l.9.9L5 3.3M2.5 8l.9.9L5 7.3M2.5 12l.9.9L5 11.3"/>',
  features: '<path d="M8 2.5l5.5 3L8 8.5l-5.5-3z"/><path d="M2.5 8.2L8 11.2l5.5-3M2.5 10.9L8 13.9l5.5-3"/>',
};

const projectViews = [['overview', 'Overview'], ['vision', 'Vision'], ['guide', 'Design'], ['plan', 'Plan'], ['features', 'Features'], ['competitors', 'Competitors']];

function navIconMarkup(view) {
  return `<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true">${navIcons[view]}</svg>`;
}

// The project's own views sit above its pages: the overview, its vision, design and plan, and its core features.
function projectNavMarkup() {
  return projectViews.map(([view, label]) => {
    const selected = state.view === view;
    return `<button type="button" class="page-option project-view ${selected ? 'selected' : ''}" data-project-view="${view}" ${selected ? 'aria-current="page"' : ''}>${navIconMarkup(view)}<span>${label}</span></button>`;
  }).join('');
}

function projectPickerMarkup() {
  const options = state.projects.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.project.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  return `<label class="project-picker"><span class="sr-only">Project</span><select id="project-select">${options}</select></label>`;
}

export function sidebarMarkup() {
  const pages = menuPages();
  return `<aside class="page-sidebar ${state.browseOpen ? 'open' : ''}" aria-label="Project">
      <div class="page-sidebar-head"><img class="app-icon" src="/logo.svg" alt="" width="28" height="28"><strong>dogfood</strong><button type="button" class="add-project-button" data-action="add-project" aria-label="Add an app" title="Add an app">+</button><button type="button" class="page-sidebar-close" data-action="close-pages">Done</button></div>
      ${projectPickerMarkup()}
      <nav class="page-list" aria-label="Project">
        <div class="project-nav">${projectNavMarkup()}</div>
        <div class="pages-head"><h2>Pages</h2></div>
        <label class="search-field"><span class="sr-only">Search pages, routes, things to do or open bugs</span><span class="search-icon" aria-hidden="true"></span><input id="page-search" type="search" placeholder="Search pages" value="${escapeHtml(state.query)}"></label>
        <div class="menu-controls">${menuSelectMarkup('page-filter', 'Show', state.filter, [['all', 'All pages'], ['needs', 'Needs work'], ['untested', 'Not checked'], ['reviewed', 'Checked'], ['changed', 'Changed since last check']])}${menuSelectMarkup('page-sort', 'Sort', state.sort, [['navigation', 'Site order'], ['needs', 'Needs work first'], ['least', 'Least checked']])}</div>
        <div class="page-groups">${pageOptionsMarkup(pages)}</div>
      </nav>
      ${state.project.source?.url ? externalLinkMarkup(state.project.source.url, 'Open the app ↗', 'source-link') : ''}
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
  return own && state.scan.error ? `<div class="form-error" role="alert">${plainMessageMarkup(state.scan.error)}</div>` : '';
}

export function acceptanceLabel(progress) {
  if (progress.accepted === true) return 'Accepted';
  return progress.complete === true ? 'Checked · Not accepted' : 'Not fully checked';
}

function missingRequirementsMarkup(page) {
  const requirements = page.progress.acceptanceRequirements ?? page.progress.requirements ?? [];
  const missing = requirements.filter(item => !item.met);
  if (!missing.length) return '';
  const rows = missing.map(item => `<li><strong>${escapeHtml(item.label)}</strong>${item.missing ? ` — ${escapeHtml(item.missing)}` : ''}</li>`).join('');
  return `<details class="page-gate-requirements"><summary>Before acceptance</summary><ul>${rows}</ul></details>`;
}

function acceptanceMarkup(page) {
  const label = acceptanceLabel(page.progress);
  return `<div class="page-gate" role="group" aria-label="Acceptance status"><span class="page-gate-state" data-gate-status="${escapeHtml(label)}">${escapeHtml(label)}</span>${missingRequirementsMarkup(page)}</div>`;
}

export function pageHeaderMarkup(page) {
  const open = externalLinkMarkup(page.captures.desktop.sourceUrl, 'Open page ↗', 'link-button');
  return `<div class="page-heading"><div class="page-title"><p class="page-route" title="${escapeHtml(page.route)}">${escapeHtml(page.route)}</p><h1 id="selected-page-heading" tabindex="-1">${escapeHtml(page.name)}</h1></div><div class="page-actions">${statusPill(page.progress.status)}${acceptanceMarkup(page)}${checkAgainMarkup(page)}${open}<button type="button" class="remove-page-button" data-action="remove-page">Remove page…</button></div></div>${scanErrorMarkup(page)}${removePageMarkup(page)}`;
}

// Pages is the phone's way into the sidebar; on a computer the sidebar is always there.
export function toolbarMarkup() {
  return '<div class="toolbar"><button type="button" class="page-menu-toggle" data-action="open-pages">Menu</button></div>';
}
