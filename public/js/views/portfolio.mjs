import { state } from '../state.mjs';
import { escapeHtml } from '../format.mjs';
import { readJson } from '../api.mjs';
import { loadProject, render } from '../app.mjs';
let pending;
let showingPortfolio = false;
function status(project) {
  if (project.pages && project.accepted === project.pages) return 'QA accepted';
  if (project.needsWork) return 'Needs work';
  if (project.blocked) return 'Blocked';
  return 'Not fully checked';
}
function platform(project) { return { ios: 'iOS app', cli: 'CLI and generated output', web: 'Web app', unknown: 'Project setup' }[project.platform] || 'Project setup'; }
function coverage(project, noun) { return project.unavailable ? 'Coverage unavailable until project setup is repaired.' : `<strong>${project.accepted} of ${project.pages}</strong> ${noun} accepted · ${project.findings} open findings`; }
function projectMarkup(project) {
  const noun = project.platform === 'ios' ? 'screens' : 'pages';
  return `<article class="content-panel portfolio-card"><header><span class="eyebrow">${platform(project)}</span><span class="portfolio-status">${status(project)}</span></header><h2>${escapeHtml(project.name)}</h2><p>${escapeHtml(project.description)}</p><p class="portfolio-coverage">${coverage(project, noun)}</p><p class="field-hint">${escapeHtml(project.environment)}</p><button type="button" class="text-button" data-portfolio-project="${escapeHtml(project.id)}">Open project</button></article>`;
}
function activeMarkup(data) { return data.active.length ? data.active.map(projectMarkup).join('') : '<section class="content-panel portfolio-card"><h2>Choose the work you are doing now</h2><p>Ask your agent to select your current registered projects with dogfood_set_active_projects. Earlier projects and their evidence remain in history.</p></section>'; }
export function portfolioMarkup() {
  const info = state.portfolio;
  const heading = '<header class="overview-heading"><div><h1>Current projects</h1><p>See what has been checked, what needs work, and where to go next.</p></div></header>';
  if (info?.error) return `<section class="overview-content">${heading}<p class="form-error" role="alert">${escapeHtml(info.error)}</p><button class="text-button" data-portfolio-refresh>Try again</button></section>`;
  if (!info?.data) return `<section class="overview-content">${heading}<p role="status">Reading the project portfolio…</p></section>`;
  const data = info.data;
  const content = activeMarkup(data);
  return `<section class="overview-content portfolio-view">${heading}<div class="portfolio-grid">${content}</div><p class="field-hint">Historical projects remain available in the project picker. A green page reflects its recorded evidence and scope; it does not certify an untested live integration.</p></section>`;
}
export async function loadPortfolio() {
  if (pending) return pending;
  state.portfolio ??= { data: null, error: '' };
  pending = readJson('/api/portfolio').then(data => { state.portfolio.data = data; state.portfolio.error = ''; }, error => { state.portfolio.error = error.message; }).finally(() => { pending = null; if (state.view === 'portfolio') render(); });
  return pending;
}
export function syncPortfolio() {
  const visible = state.view === 'portfolio';
  const entered = visible && !showingPortfolio;
  showingPortfolio = visible;
  if (entered) void loadPortfolio();
}
export function registerPortfolioEvents(app, guard) {
  app.addEventListener('click', event => {
    const button = event.target.closest('[data-portfolio-project], [data-portfolio-refresh]');
    if (!button) return;
    if (button.dataset.portfolioProject) return guard(() => { void loadProject(button.dataset.portfolioProject, { view: 'overview' }); });
    void loadPortfolio();
  });
}
