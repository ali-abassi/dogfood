import { escapeHtml, externalLinkMarkup, statusPill } from '../format.mjs';
import { deviceNames, groupedPages, isProjectView, requirementActions, requirementShortNames, requirementViews, state, statusNames, visiblePages } from '../state.mjs';
import { captureFrameMarkup } from './see-page.mjs';

function menuSelectMarkup(id, label, value, options) {
  const items = options.map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${text}</option>`).join('');
  return `<label class="menu-select">${label}<select id="${id}">${items}</select></label>`;
}

function pageOptionMarkup(page) {
  const selected = page.id === state.pageId;
  const status = page.progress.status;
  const label = statusNames[status] || status;
  return `<button type="button" class="page-option ${selected ? 'selected' : ''}" data-page="${escapeHtml(page.id)}" ${selected ? 'aria-current="page"' : ''}><span>${escapeHtml(page.name)}</span><span class="menu-status status-${escapeHtml(status)}" role="img" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"></span></button>`;
}

export function pageOptionsMarkup(pages) {
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
        <div class="menu-controls">${menuSelectMarkup('page-filter', 'Show', state.filter, [['all', 'All pages'], ['needs', 'Needs work'], ['untested', 'Untested'], ['reviewed', 'Reviewed'], ['changed', 'Changed since review']])}${menuSelectMarkup('page-sort', 'Sort', state.sort, [['navigation', 'Site order'], ['needs', 'Needs work first'], ['least', 'Least reviewed']])}</div>
        <nav class="page-list" aria-label="Pages"><button type="button" class="page-option overview-option ${overviewSelected ? 'selected' : ''}" data-overview ${overviewSelected ? 'aria-current="page"' : ''}>Overview</button><div class="page-groups">${pageOptionsMarkup(pages)}</div></nav>
        ${externalLinkMarkup(state.project.source.url, 'Open product ↗', 'source-link')}
  </aside>`;
}

export function captureMarkup(page) {
  const selected = state.screenshotDevice;
  const toggles = Object.entries(deviceNames).map(([device, label]) => `<button type="button" data-action="screenshot-device" data-screenshot-device="${escapeHtml(device)}" aria-pressed="${selected === device}">${escapeHtml(label)}</button>`).join('');
  return `<section class="capture-column" aria-label="Page screenshot">
    <div class="capture-column-heading"><h3>Page screenshot</h3><div class="device-toggle" role="group" aria-label="Screenshot device">${toggles}</div></div>
    ${captureFrameMarkup(page, selected)}
  </section>`;
}

// Removing a page is rare and needs a reason on record, so it hides behind an inline form.
function removePageMarkup(page) {
  if (state.removingPage !== page.id) return '';
  return `<form id="remove-page-form" class="finding-form remove-page-form"><label for="remove-reason">Why should ${escapeHtml(page.name)} not be in this project?</label><textarea id="remove-reason" name="reason" rows="2" required minlength="12" maxlength="400" placeholder="For example: a duplicate of Home, or a route that redirects."></textarea><div id="remove-page-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="danger-button" type="submit">Remove page</button><button class="text-button" type="button" data-action="cancel-remove-page">Cancel</button></div></form>`;
}

export function pageHeaderMarkup(page) {
  return `<div class="page-heading"><div class="page-title"><p class="page-route" title="${escapeHtml(page.route)}">${escapeHtml(page.route)}</p><h1 id="selected-page-heading" tabindex="-1">${escapeHtml(page.name)}</h1></div><div class="page-verdict">${statusPill(page.progress.status)}<button type="button" class="remove-page-button" data-action="remove-page">Remove page…</button></div></div>${removePageMarkup(page)}`;
}

// What is missing leads, each with its reason and the view that fixes it; what is done
// shares one quiet line. Nothing expands, so nothing moves while someone reads.
function missingRequirementMarkup(requirement) {
  const view = requirementViews[requirement.id] || 'review';
  const action = requirementActions[requirement.id] || 'Open';
  return `<li class="completion-item" data-requirement="${escapeHtml(requirement.id)}" data-met="false"><span class="completion-mark" aria-hidden="true"></span><div class="completion-text"><strong>${escapeHtml(requirement.label)}</strong><p>${escapeHtml(requirement.missing)}</p></div><button type="button" class="completion-action" data-view="${escapeHtml(view)}">Open ${escapeHtml(action)}</button></li>`;
}

function doneRequirementsMarkup(done) {
  if (!done.length) return '';
  const names = done.map(item => `<span data-requirement="${escapeHtml(item.id)}" data-met="true" title="${escapeHtml(item.label)}">${escapeHtml(requirementShortNames[item.id] || item.label)}</span>`).join('<span aria-hidden="true"> · </span>');
  return `<p class="completion-done"><span class="completion-done-mark" aria-hidden="true">✓</span><span class="sr-only">Done: </span>${names}</p>`;
}

export function qaCompletionMarkup(page) {
  const missing = page.progress.requirements.filter(item => !item.met);
  const done = page.progress.requirements.filter(item => item.met);
  const heading = missing.length ? 'What QA still needs' : 'QA complete';
  const list = missing.length ? `<ul class="completion-list">${missing.map(missingRequirementMarkup).join('')}</ul>` : '';
  return `<section class="qa-completion ${missing.length ? '' : 'complete'}" aria-label="QA completion"><h2>${heading}</h2>${list}${doneRequirementsMarkup(done)}</section>`;
}

function viewButton(name, label, short, suffix = '') {
  const selected = state.view === name;
  return `<button type="button" class="view-button ${selected ? 'selected' : ''}" data-view="${name}" aria-pressed="${selected}"><span class="label-full">${label}</span><span class="label-short" aria-hidden="true">${short}</span>${suffix ? `<span class="view-badge">${suffix}</span>` : ''}</button>`;
}

function viewNavigationMarkup(page) {
  const open = page.findings.filter(item => item.status === 'open').length;
  return `<nav class="view-navigation" aria-label="Page QA areas">${viewButton('tests', 'Run checks', 'Checks')}${viewButton('capture', 'See page', 'Page')}${viewButton('review', 'My review', 'Review')}${viewButton('risk', 'Safety & search', 'Safety')}${viewButton('findings', 'Issues', 'Issues', open ? String(open) : '')}</nav>`;
}

export function toolbarMarkup(page) {
  const navigation = !isProjectView() && page ? viewNavigationMarkup(page) : '';
  const toolbarClass = navigation ? 'toolbar' : 'toolbar overview-toolbar';
  return `<div class="${toolbarClass}"><button type="button" class="page-menu-toggle" data-action="open-pages">Pages</button>${navigation}</div>`;
}
