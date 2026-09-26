import { findingEndpoint, readJson } from '../api.mjs';
import { dateLabel, escapeHtml, safeCapturePath, statusPill, verdictByMarkup } from '../format.mjs';
import { activePage, primaryClass, severityNames, state } from '../state.mjs';
import { render } from '../app.mjs';

function findingEvidenceMarkup(finding) {
  const evidencePath = finding.evidence ? safeCapturePath(`/${finding.evidence}`) : '';
  return evidencePath ? ` · <a href="${evidencePath}" target="_blank" rel="noopener">Screenshot ↗</a>` : '';
}

function findingActionMarkup(finding) {
  if (state.findingForm === finding.id) return '';
  const [action, label] = finding.status === 'open' ? ['resolve', 'Mark fixed'] : ['reopen', 'Reopen'];
  return `<button type="button" class="finding-action" data-finding-action="${action}" data-finding-id="${escapeHtml(finding.id)}">${label}</button>`;
}

function findingMarkup(finding) {
  const resolution = finding.resolution ? `<p class="resolution-note"><strong>Checked again:</strong> ${escapeHtml(finding.resolution)} <small>· ${escapeHtml(dateLabel(finding.resolvedAt))}</small></p>` : '';
  const resolvedBy = verdictByMarkup(finding.resolvedBy, finding.resolvedAt, 'Marked fixed');
  const form = state.findingForm === finding.id ? resolutionFormMarkup(finding) : '';
  return `<li class="finding finding-${escapeHtml(finding.status)}" data-bug><div class="finding-body"><div class="finding-title"><span class="bug-severity severity-${escapeHtml(finding.severity)}">${escapeHtml(severityNames[finding.severity])}</span><strong>${escapeHtml(finding.title)}</strong>${statusPill(finding.status)}</div><p>${escapeHtml(finding.detail)}</p><small>${escapeHtml(finding.id)}${findingEvidenceMarkup(finding)}</small>${verdictByMarkup(finding.by, finding.at, 'Reported')}${resolution}${resolvedBy}${findingActionMarkup(finding)}${form}</div></li>`;
}

function resolutionFormMarkup(finding) {
  return `<form id="resolution-form" class="finding-form" novalidate data-finding-id="${escapeHtml(finding.id)}"><label for="retest-note">What did you check again, and what happened?</label><textarea id="retest-note" name="note" rows="3" required minlength="20" maxlength="1200" placeholder="For example: pressed Reserve on a phone; the booking was confirmed."></textarea><div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Mark fixed</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

function newFindingFormMarkup(page) {
  const capture = page.captures.desktop.state === 'rendered' ? `<label class="capture-choice"><input type="checkbox" name="attachCapture"> Attach the Computer screenshot if it shows the bug</label>` : '';
  const severities = ['P0', 'P1', 'P2', 'P3'].map(code => `<option value="${code}" ${code === 'P2' ? 'selected' : ''}>${severityNames[code]}</option>`).join('');
  return `<form id="finding-form" class="finding-form" novalidate><label for="finding-title">What’s wrong?</label><input id="finding-title" name="title" required minlength="8" maxlength="120" placeholder="For example: Reserve does nothing on a phone"><label for="finding-severity">How bad is it?</label><select id="finding-severity" name="severity">${severities}</select><label for="finding-detail">What happened, and how can someone see it again?</label><textarea id="finding-detail" name="detail" rows="4" required minlength="20" maxlength="1200" placeholder="Where did you start, what did you do, and what happened?"></textarea>${capture}<div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Report a bug</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

export function findingsMarkup(page) {
  const findings = [...page.findings].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || a.severity.localeCompare(b.severity));
  const list = findings.length ? `<ul class="findings">${findings.map(findingMarkup).join('')}</ul>` : '<p class="muted">No bugs reported on this page.</p>';
  const form = state.findingForm === 'new' ? newFindingFormMarkup(page) : '';
  const action = state.findingForm === 'new' ? '' : `<button type="button" class="${primaryClass()}" data-action="report-bug" data-finding-action="new">Report a bug</button>`;
  return `<section class="content-panel" aria-label="Bugs"><div class="panel-heading"><h2>Bugs</h2>${action}</div>${form}${list}</section>`;
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
  await submitFinding(form, findingEndpoint(page), 'POST', body, 'Bug reported');
}

export async function resolveFinding(form) {
  const page = activePage();
  const body = { status: 'resolved', note: new FormData(form).get('note') };
  await submitFinding(form, findingEndpoint(page, form.dataset.findingId), 'PUT', body, 'Marked fixed');
}

async function reopenFinding(id) {
  const page = activePage();
  try {
    state.project = await readJson(findingEndpoint(page, id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) });
    state.message = 'Bug reopened';
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

// A bug form replaces any other open form, so one Save is ever showing.
function openFindingForm(id) {
  Object.assign(state, { answerEditing: false, questionsEditing: false, thingsEditing: false, addingThing: false });
  state.findingForm = id;
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
  if (id === 'new') return document.querySelector('[data-action="report-bug"]')?.focus();
  const button = [...document.querySelectorAll('.finding-action')].find(item => item.dataset.findingId === id);
  button?.focus();
}
