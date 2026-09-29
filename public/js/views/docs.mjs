import { readJson } from '../api.mjs';
import { escapeHtml, markdownMarkup } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

// Each document view: the document it shows, its title, the file it reads, and what belongs in it when it is
// missing. The design view is called guide, because design already names a page's Looks right answer view.
const docViews = {
  vision: { doc: 'vision', title: 'Vision', file: 'vision.md', lede: 'Why the product exists and what it does.', empty: 'Why the product exists, who it is for, and what it does, in the owner’s words.' },
  guide: { doc: 'design', title: 'Design', file: 'design.html', lede: 'The brand guide: logo, colour, type, components and voice.', empty: 'The brand guide: logo, colour, type, space, components, voice and imagery, generated from design.json.' },
  plan: { doc: 'plan', title: 'Plan', file: 'plan.md', lede: 'Milestones, their exit criteria, and the tasks for the next one.', empty: 'The milestones, each with exit criteria, and the tasks for the first one, each with a check that proves it is done.' },
};

export const docViewIds = Object.keys(docViews);

function emptyMarkup(view) {
  const why = state.docs.data?.checkout
    ? `Add ${view.file} to the project checkout and it will show here.`
    : 'This project has no local checkout, so dogfood cannot read its documents.';
  return `<div class="doc-empty content-panel"><h2>No ${escapeHtml(view.title.toLowerCase())} yet</h2><p>${escapeHtml(view.empty)}</p><p class="muted">${escapeHtml(why)}</p></div>`;
}

// A document's own top heading repeats the view's title, so the view drops it.
function withoutLeadHeading(markdown) {
  return markdown.replace(/^\s*#\s[^\n]*\n+/, '');
}

// The brand guide is a page of its own. It runs in a sandboxed frame with no scripts, sized to its content.
function designFrameMarkup() {
  const src = `/api/projects/${encodeURIComponent(state.project.id)}/design`;
  return `<iframe class="doc-frame" title="${escapeHtml(state.project.name)} brand guide" sandbox="allow-same-origin" src="${src}"></iframe>`;
}

function docMarkup(doc) {
  if (doc.html) return designFrameMarkup();
  return `<article class="doc-body content-panel">${markdownMarkup(withoutLeadHeading(doc.markdown))}</article>`;
}

function docBodyMarkup(view) {
  if (state.docs.error) return `<p class="form-error" role="alert">${escapeHtml(state.docs.error)}</p>`;
  if (state.docs.loading || !state.docs.data) return '<p class="muted" role="status">Loading…</p>';
  const doc = state.docs.data[view.doc];
  return doc ? docMarkup(doc) : emptyMarkup(view);
}

function fileMarkup(view) {
  const doc = state.docs.data?.[view.doc];
  if (!doc) return '';
  const open = designFullPageLink(doc);
  return `<p class="doc-file">${escapeHtml(doc.file)} in ${escapeHtml(state.docs.data.ref || 'main')}${open}</p>`;
}

function designFullPageLink(doc) {
  return doc.html ? ` · <a href="/api/projects/${encodeURIComponent(state.project.id)}/design" target="_blank" rel="noopener noreferrer">Open full page ↗</a>` : '';
}

export function docsMarkup() {
  const view = docViews[state.view];
  return `<section class="overview-content doc-view" aria-label="${escapeHtml(view.title)}"><header class="overview-heading"><div><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.lede)}</p>${fileMarkup(view)}</div></header>${docBodyMarkup(view)}</section>`;
}

export function planDocumentMarkup() {
  const view = docViews.plan;
  return `<details class="plan-document"><summary>Read ${view.file}</summary>${fileMarkup(view)}${docBodyMarkup(view)}</details>`;
}

// Sets a design frame's height to its page, so the guide scrolls with the app instead of inside a box.
export function fitDocFrame(frame) {
  const page = frame.contentDocument?.documentElement;
  if (page) frame.style.height = `${page.scrollHeight}px`;
}

async function loadDocs(projectId) {
  try {
    const data = await readJson(`/api/projects/${encodeURIComponent(projectId)}/docs`);
    if (state.docs.key === projectId) Object.assign(state.docs, { loading: false, data });
  } catch (error) {
    if (state.docs.key === projectId) Object.assign(state.docs, { loading: false, error: error.message });
  }
  render();
}

// Documents load once per project, the first time a document view opens.
export function syncDocsState() {
  if (!docViewIds.includes(state.view) || !state.project || state.docs.key === state.project.id) return;
  Object.assign(state.docs, { key: state.project.id, loading: true, data: null, error: '' });
  void loadDocs(state.project.id);
}
