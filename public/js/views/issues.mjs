import { findingEndpoint, readJson } from '../api.mjs';
import { dateLabel, escapeHtml, safeCapturePath, statusPill, verdictByMarkup } from '../format.mjs';
import { activePage, state } from '../state.mjs';
import { render } from '../app.mjs';

function findingEvidenceMarkup(finding) {
  const evidencePath = finding.evidence ? safeCapturePath(`/${finding.evidence}`) : '';
  return evidencePath ? `<a href="${evidencePath}" target="_blank" rel="noopener">Screenshot ↗</a>` : 'No screenshot attached';
}

function findingActionMarkup(finding) {
  if (state.findingForm === finding.id) return '';
  const action = finding.status === 'open' ? 'Resolve' : 'Reopen';
  return `<button type="button" class="finding-action" data-finding-action="${action.toLowerCase()}" data-finding-id="${escapeHtml(finding.id)}">${action}</button>`;
}

function findingMarkup(finding) {
  const resolution = finding.resolution ? `<p class="resolution-note"><strong>Last retest:</strong> ${escapeHtml(finding.resolution)} <small>· ${escapeHtml(dateLabel(finding.resolvedAt))}</small></p>` : '';
  const resolvedBy = verdictByMarkup(finding.resolvedBy, finding.resolvedAt, 'Resolved');
  const form = state.findingForm === finding.id ? resolutionFormMarkup(finding) : '';
  return `<li class="finding"><span class="severity">${escapeHtml(finding.severity)}</span><div class="finding-body"><div class="finding-title"><strong>${escapeHtml(finding.title)}</strong>${statusPill(finding.status)}</div><p>${escapeHtml(finding.detail)}</p><small>${escapeHtml(finding.id)} · ${findingEvidenceMarkup(finding)}</small>${verdictByMarkup(finding.by, finding.at, 'Opened')}${resolution}${resolvedBy}${findingActionMarkup(finding)}${form}</div></li>`;
}

function resolutionFormMarkup(finding) {
  return `<form id="resolution-form" class="finding-form" data-finding-id="${escapeHtml(finding.id)}"><label for="retest-note">What did you retest?</label><textarea id="retest-note" name="note" rows="3" required minlength="20" maxlength="1200" placeholder="Name the environment, action, and observed result."></textarea><div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Mark resolved</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

function newFindingFormMarkup(page) {
  const capture = page.captures.desktop.state === 'rendered' ? `<label class="capture-choice"><input type="checkbox" name="attachCapture"> Attach this screenshot if it shows the issue</label>` : '';
  return `<form id="finding-form" class="finding-form"><label for="finding-title">Issue title</label><input id="finding-title" name="title" required minlength="8" maxlength="120" placeholder="What is wrong?"><label for="finding-severity">Priority</label><select id="finding-severity" name="severity"><option value="P2">P2 · important</option><option value="P1">P1 · blocks core work</option><option value="P0">P0 · critical</option><option value="P3">P3 · minor</option></select><label for="finding-detail">What happened and how to repeat it?</label><textarea id="finding-detail" name="detail" rows="4" required minlength="20" maxlength="1200" placeholder="Where did you start, what did you do, and what happened?"></textarea>${capture}<div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Save issue</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

export function findingsMarkup(page) {
  const findings = [...page.findings].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || a.severity.localeCompare(b.severity));
  const list = findings.length ? `<ul class="findings">${findings.map(findingMarkup).join('')}</ul>` : '<p class="no-findings">No issues recorded for this page.</p>';
  const form = state.findingForm === 'new' ? newFindingFormMarkup(page) : '';
  const action = state.findingForm === 'new' ? '' : '<button type="button" class="add-finding" data-finding-action="new">+ Add issue</button>';
  return `<section class="inspector-section"><div class="section-heading"><h3>Issues on this page</h3><span>${page.findings.filter(item => item.status === 'open').length} open</span></div>${list}${action}${form}</section>`;
}

function showFindingError(error) {
  const box = document.querySelector('#finding-error');
  box.hidden = false;
  box.textContent = error.message;
  box.scrollIntoView({ block: 'nearest' });
}

async function submitFinding(form, endpoint, method, body, message) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const project = await readJson(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (state.project.id !== project.id) return;
    state.project = project;
    state.findingForm = null;
    state.message = message;
    render();
  } catch (error) {
    if (!document.contains(form)) return;
    button.disabled = false;
    button.textContent = label;
    showFindingError(error);
  }
}

export async function saveFinding(form) {
  const page = activePage();
  const data = new FormData(form);
  const body = { title: data.get('title'), severity: data.get('severity'), detail: data.get('detail'), attachCapture: data.has('attachCapture') };
  await submitFinding(form, findingEndpoint(page), 'POST', body, `Saved issue on ${page.name}.`);
}

export async function resolveFinding(form) {
  const page = activePage();
  const body = { status: 'resolved', note: new FormData(form).get('note') };
  await submitFinding(form, findingEndpoint(page, form.dataset.findingId), 'PUT', body, 'Issue resolved with a retest note.');
}

async function reopenFinding(id) {
  const page = activePage();
  try {
    state.project = await readJson(findingEndpoint(page, id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) });
    state.message = 'Issue reopened.';
    render();
  } catch (error) { state.message = error.message; render(); }
}

function cancelFindingForm() {
  const previous = state.findingForm;
  state.findingForm = null;
  state.message = '';
  render();
  focusFindingAction(previous);
}

function openFindingForm(id) {
  state.findingForm = id;
  state.editing = false;
  state.auditEditing = false;
  render();
  document.querySelector(id === 'new' ? '#finding-title' : '#retest-note')?.focus();
}

export function handleFindingButton(button) {
  const action = button.dataset.findingAction;
  if (action === 'reopen') { button.disabled = true; return reopenFinding(button.dataset.findingId); }
  if (action === 'cancel') return cancelFindingForm();
  openFindingForm(action === 'new' ? 'new' : button.dataset.findingId);
}

function focusFindingAction(id) {
  if (id === 'new') return document.querySelector('.add-finding')?.focus();
  const button = [...document.querySelectorAll('.finding-action')].find(item => item.dataset.findingId === id);
  button?.focus();
}
