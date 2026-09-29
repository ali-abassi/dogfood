import { readJson } from '../api.mjs';
import { escapeHtml, markdownMarkup } from '../format.mjs';
import { state } from '../state.mjs';
import { render } from '../app.mjs';

const docTabs = [['vision', 'Vision', 'vision.md'], ['design', 'Design', 'design.md'], ['plan', 'Plan', 'plan.md']];

function tabsMarkup() {
  const buttons = docTabs.map(([key, label]) => `<button type="button" data-action="doc-tab" data-doc-tab="${key}" aria-pressed="${state.docs.tab === key}">${label}</button>`).join('');
  return `<div class="device-switch doc-tabs" role="group" aria-label="Document">${buttons}</div>`;
}

function missingMarkup(file) {
  const why = state.docs.data?.checkout ? `This project has no ${file} at its root yet.` : 'This project has no local checkout, so dogfood cannot read its documents.';
  return `<div class="content-panel features-empty"><p>${escapeHtml(why)}</p></div>`;
}

function docBodyMarkup() {
  if (state.docs.error) return `<p class="form-error" role="alert">${escapeHtml(state.docs.error)}</p>`;
  if (state.docs.loading || !state.docs.data) return '<p class="muted" role="status">Loading…</p>';
  const [, , file] = docTabs.find(([key]) => key === state.docs.tab);
  const doc = state.docs.data[state.docs.tab];
  if (!doc) return missingMarkup(file);
  return `<p class="doc-file">${escapeHtml(doc.file)}</p><article class="doc-body content-panel">${markdownMarkup(doc.markdown)}</article>`;
}

export function docsMarkup() {
  return `<section class="overview-content" aria-label="Docs"><header class="overview-heading"><div><h1>Docs</h1><p>What ${escapeHtml(state.project.name)} is for, how it should look and work, and the plan.</p></div>${tabsMarkup()}</header>${docBodyMarkup()}</section>`;
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

// Documents load once per project, the first time the Docs view opens.
export function syncDocsState() {
  if (state.view !== 'docs' || !state.project || state.docs.key === state.project.id) return;
  Object.assign(state.docs, { key: state.project.id, loading: true, data: null, error: '' });
  void loadDocs(state.project.id);
}
