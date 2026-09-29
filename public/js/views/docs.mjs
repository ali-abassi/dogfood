import { readJson } from '../api.mjs';
import { escapeHtml, markdownMarkup } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

// Each document view: the document it shows, its title, the file it reads, and what belongs in it when it is
// missing. The design view is called guide, because design already names a page's Looks right answer view.
const docViews = {
  vision: { doc: 'vision', title: 'Vision', file: 'vision.md', lede: 'Who this product is for, what it solves and what success means.', empty: 'Ask your coding agent to write the project’s purpose, audience and definition of done in vision.md.' },
  guide: { doc: 'design', title: 'Design', file: 'design.html', lede: 'The project’s visual direction, components and voice.', empty: 'Ask your coding agent to save the project’s brand guide as design.html in its checkout.' },
  plan: { doc: 'plan', title: 'Plan', file: 'plan.md', lede: 'Milestones, their exit criteria, and the tasks for the next one.', empty: 'The milestones, each with exit criteria, and the tasks for the first one, each with a check that proves it is done.' },
};

export const docViewIds = Object.keys(docViews);

function emptyMarkup(view) {
  const why = state.docs.data?.checkout
    ? 'Refresh here after the file is saved.'
    : 'There is no available local checkout. Ask your coding agent to connect the project folder so its documents can be read here.';
  return `<div class="doc-empty doc-state content-panel"><h2>No ${escapeHtml(view.title.toLowerCase())} yet</h2><p>${escapeHtml(view.empty)}</p><p>${escapeHtml(why)}</p><button type="button" id="retry-docs" class="text-button">Refresh documents</button></div>`;
}

// A document's own top heading repeats the view's title, so the view drops it.
function withoutLeadHeading(markdown) {
  return markdown.replace(/^\s*#\s[^\n]*\n+/, '');
}

// The brand guide is a page of its own. It runs in a sandboxed frame with no scripts, sized to its content.
function designFrameMarkup() {
  const src = `/api/projects/${encodeURIComponent(state.project.id)}/design`;
  return `<div class="doc-guide" aria-busy="true"><p class="doc-guide-loading muted" role="status">Opening brand guide…</p><iframe class="doc-frame" title="${escapeHtml(state.project.name)} brand guide" sandbox="allow-same-origin" src="${src}"></iframe></div>`;
}

function readingMarkup(markdown) {
  const sections = [];
  let headingIndex = 0;
  const body = markdownMarkup(withoutLeadHeading(markdown)).replace(/<h([2-6])>(.*?)<\/h\1>/g, (heading, level, text) => {
    const id = `doc-section-${++headingIndex}`;
    const headingLevel = Math.max(2, Number(level) - 1);
    if (headingLevel <= 2) sections.push({ id, text: text.replace(/<[^>]*>/g, '') });
    return `<h${headingLevel} id="${id}">${text}</h${headingLevel}>`;
  });
  const contents = sections.length >= 3
    ? `<details class="doc-contents"><summary>In this document</summary><nav aria-label="Document sections">${sections.map(section => `<a href="#${section.id}">${section.text}</a>`).join('')}</nav></details>`
    : '';
  return `${contents}<article class="doc-body content-panel">${body}</article>`;
}

function docMarkup(doc, view) {
  if (doc.html) return designFrameMarkup();
  if (!doc.markdown?.trim()) return emptyMarkup(view);
  return readingMarkup(doc.markdown);
}

function docBodyMarkup(view) {
  if (state.docs.error) return `<div class="doc-state content-panel" role="alert"><h2>Couldn’t read the documents</h2><p>${escapeHtml(state.docs.error)}</p><button type="button" id="retry-docs" class="save-button">Try again</button></div>`;
  if (state.docs.loading || !state.docs.data) return '<div class="doc-state content-panel" aria-busy="true"><p role="status">Reading project documents…</p><button type="button" id="retry-docs" class="text-button" disabled>Loading…</button></div>';
  const doc = state.docs.data[view.doc];
  return doc ? docMarkup(doc, view) : emptyMarkup(view);
}

function fileMarkup(view) {
  const doc = state.docs.data?.[view.doc];
  if (!doc) return '';
  const open = designFullPageLink(doc);
  const source = state.docs.data.ref === 'checkout' ? 'Working checkout' : state.docs.data.ref || 'main';
  return `<p class="doc-file">${escapeHtml(source)} · <span>${escapeHtml(doc.file)}</span>${open}</p>`;
}

function designFullPageLink(doc) {
  return doc.html ? ` · <a href="/api/projects/${encodeURIComponent(state.project.id)}/design" target="_blank" rel="noopener noreferrer">Open full page ↗</a>` : '';
}

export function docsMarkup() {
  const view = docViews[state.view];
  return `<section class="overview-content doc-view" aria-label="${escapeHtml(view.title)}"><header class="overview-heading"><div><h1>${escapeHtml(view.title)}</h1><p>${escapeHtml(view.lede)}</p>${fileMarkup(view)}</div><div class="doc-actions"><button type="button" class="text-button" data-project-view="plan">Open Plan</button></div></header>${docBodyMarkup(view)}</section>`;
}

export function planDocumentMarkup() {
  const view = docViews.plan;
  return `<details class="plan-document"><summary>Read ${view.file}</summary>${fileMarkup(view)}${docBodyMarkup(view)}</details>`;
}

// Sets a design frame's height to its page, so the guide scrolls with the app instead of inside a box.
function finishGuideLoading(frame) {
  const guide = frame.closest('.doc-guide');
  if (!guide) return;
  guide.setAttribute('aria-busy', 'false');
  guide.querySelector('.doc-guide-loading')?.remove();
}

export function fitDocFrame(frame) {
  const page = frame.contentDocument?.documentElement;
  if (!page) return;
  frame.style.height = '1px';
  frame.style.height = `${Math.max(page.scrollHeight, frame.contentDocument.body.scrollHeight)}px`;
  finishGuideLoading(frame);
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

export function retryDocs() {
  if (!state.project || state.docs.loading) return;
  Object.assign(state.docs, { key: state.project.id, loading: true, data: null, error: '' });
  render();
  void loadDocs(state.project.id);
}
