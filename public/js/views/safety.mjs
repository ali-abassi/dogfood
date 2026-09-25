import { readJson } from '../api.mjs';
import { escapeHtml, statusPill, verdictByMarkup } from '../format.mjs';
import { activePage, auditNames, state } from '../state.mjs';
import { render } from '../app.mjs';

function auditChecklistMarkup(key, rows) {
  const checked = rows.filter(row => row.status !== 'untested').length;
  const items = rows.map(row => `<div class="audit-item"><div class="check-heading"><strong>${escapeHtml(row.question)}</strong>${statusPill(row.status)}</div>${row.note ? `<p class="check-note">${escapeHtml(row.note)}</p>` : ''}${verdictByMarkup(row.by, row.at)}</div>`).join('');
  return `<details class="audit-disclosure" ${key === 'security' ? 'open' : ''}><summary><span>${escapeHtml(auditNames[key])}</span><small>${checked} / ${rows.length} reviewed</small></summary><div class="audit-list">${items}</div></details>`;
}

function connectionMarkup(row) {
  return `<li class="connection"><div class="connection-title"><code>${escapeHtml(row.method)}</code><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.provenance === 'source' ? 'Source mapped' : row.provenance === 'observed' ? 'Traffic observed' : 'Manual')}</small></div><p class="connection-endpoint">${escapeHtml(row.endpoint)}</p><dl><div><dt>Sends</dt><dd>${escapeHtml(row.sends)}</dd></div><div><dt>Receives</dt><dd>${escapeHtml(row.receives)}</dd></div></dl><p class="connection-source">Evidence: ${escapeHtml(row.source)}</p></li>`;
}

export function auditMarkup(page) {
  const sections = Object.entries(page.audit).map(([key, rows]) => auditChecklistMarkup(key, rows)).join('');
  const connections = `<details class="audit-disclosure"><summary><span>Data connections</span><small>${page.connections.length} mapped</small></summary><p class="audit-caveat">These are connections found in the app code. They have not all been verified on the live page.</p><ul class="connections">${page.connections.map(connectionMarkup).join('')}</ul></details>`;
  const editor = state.auditEditing ? auditEditorMarkup(page) : '<button type="button" class="review-button audit-button" data-action="audit-edit">Edit checks & connections</button>';
  return `<section class="inspector-section audit-section"><div class="section-heading"><h3>Security, search & data</h3><span>Page checklist</span></div>${sections}${connections}${editor}</section>`;
}

function auditItemEditor(row, key) {
  return `<div class="audit-edit-row" data-audit-row="${key}" data-id="${escapeHtml(row.id)}"><label>Question<input class="audit-question" required maxlength="220" value="${escapeHtml(row.question)}"></label><div class="audit-edit-status"><label>Status<select class="audit-status"><option value="untested" ${row.status === 'untested' ? 'selected' : ''}>Untested</option><option value="pass" ${row.status === 'pass' ? 'selected' : ''}>Pass</option><option value="needs_work" ${row.status === 'needs_work' ? 'selected' : ''}>Needs work</option></select></label><button type="button" class="remove-row" data-action="remove-row" aria-label="Remove check">Remove</button></div><label>Evidence note<textarea class="audit-note" maxlength="1200" rows="2" placeholder="Required for Pass or Needs work">${escapeHtml(row.note)}</textarea></label></div>`;
}

function connectionEditor(row) {
  const options = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(method => `<option ${row.method === method ? 'selected' : ''}>${method}</option>`).join('');
  const provenance = [['source', 'Source mapped'], ['observed', 'Traffic observed'], ['manual', 'Manual']].map(([value, label]) => `<option value="${value}" ${row.provenance === value ? 'selected' : ''}>${label}</option>`).join('');
  return `<div class="connection-edit-row" data-connection-row data-id="${escapeHtml(row.id)}"><div class="connection-edit-head"><label>Name<input class="connection-name" required maxlength="100" value="${escapeHtml(row.name)}"></label><button type="button" class="remove-row" data-action="remove-row" aria-label="Remove connection">Remove</button></div><div class="connection-edit-pair"><label>Method<select class="connection-method">${options}</select></label><label>Evidence type<select class="connection-provenance">${provenance}</select></label></div><label>API route<input class="connection-endpoint-input" required maxlength="300" value="${escapeHtml(row.endpoint)}"></label><label>Information sent<input class="connection-sends" required maxlength="400" value="${escapeHtml(row.sends)}"></label><label>Information received<input class="connection-receives" required maxlength="400" value="${escapeHtml(row.receives)}"></label><label>Source file or traffic evidence<input class="connection-source-input" required maxlength="400" value="${escapeHtml(row.source)}"></label></div>`;
}

function auditEditorMarkup(page) {
  const groups = Object.entries(page.audit).map(([key, rows]) => `<div class="audit-edit-group" data-audit-group="${key}"><h4>${auditNames[key]}</h4><div class="audit-edit-list">${rows.map(row => auditItemEditor(row, key)).join('')}</div><button type="button" class="add-finding" data-action="add-check" data-key="${key}">+ Add check</button></div>`).join('');
  return `<form id="audit-form" class="audit-form"><p class="audit-caveat">Edit the questions for this page. Pass and Needs work require a specific evidence note. Source-mapped connections still need runtime verification.</p>${groups}<div class="audit-edit-group"><h4>Connections</h4><div id="connection-edit-list">${page.connections.map(connectionEditor).join('')}</div><button type="button" class="add-finding" data-action="add-connection">+ Add connection</button></div><div id="audit-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save checklist</button><button class="text-button" type="button" data-action="audit-cancel">Cancel</button></div></form>`;
}

function auditFromForm(form) {
  const audit = Object.fromEntries(Object.keys(auditNames).map(key => [key, [...form.querySelectorAll(`[data-audit-row="${key}"]`)].map(row => ({
    id: row.dataset.id,
    question: row.querySelector('.audit-question').value,
    status: row.querySelector('.audit-status').value,
    note: row.querySelector('.audit-note').value,
  }))]));
  const connections = [...form.querySelectorAll('[data-connection-row]')].map(row => ({
    id: row.dataset.id,
    name: row.querySelector('.connection-name').value,
    method: row.querySelector('.connection-method').value,
    endpoint: row.querySelector('.connection-endpoint-input').value,
    sends: row.querySelector('.connection-sends').value,
    receives: row.querySelector('.connection-receives').value,
    source: row.querySelector('.connection-source-input').value,
    provenance: row.querySelector('.connection-provenance').value,
  }));
  return { audit, connections };
}

export async function saveAudit(form) {
  const page = activePage();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    state.project = await readJson(`/api/projects/${state.project.id}/pages/${page.id}/audit`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditFromForm(form)),
    });
    state.auditEditing = false;
    state.message = `Saved ${page.name} checklist locally.`;
    render();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save checklist';
    const box = form.querySelector('#audit-error');
    box.hidden = false;
    box.textContent = error.message;
    box.scrollIntoView({ block: 'nearest' });
  }
}

export function openAuditEditor() {
  state.auditEditing = true;
  state.findingForm = null;
  render();
  document.querySelector('.audit-question')?.focus();
}

export function closeAuditEditor() {
  state.auditEditing = false;
  state.message = '';
  render();
  document.querySelector('.audit-button')?.focus();
}

export function removeAuditRow(button) {
  const row = button.closest('[data-audit-row], [data-connection-row]');
  const list = row.parentElement;
  if (list.children.length === 1) return showAuditInlineError('Keep at least one entry in each section.');
  row.remove();
  list.querySelector('input')?.focus();
}

function showAuditInlineError(message) {
  const box = document.querySelector('#audit-error');
  box.hidden = false;
  box.textContent = message;
}

export function addAuditRow(key) {
  const list = document.querySelector(`[data-audit-group="${key}"] .audit-edit-list`);
  list.insertAdjacentHTML('beforeend', auditItemEditor({ id: crypto.randomUUID(), question: '', status: 'untested', note: '' }, key));
  list.lastElementChild.querySelector('input')?.focus();
}

export function addConnectionRow() {
  const list = document.querySelector('#connection-edit-list');
  list.insertAdjacentHTML('beforeend', connectionEditor({ id: crypto.randomUUID(), name: '', method: 'GET', endpoint: '', sends: '', receives: '', source: '', provenance: 'manual' }));
  list.lastElementChild.querySelector('input')?.focus();
}
