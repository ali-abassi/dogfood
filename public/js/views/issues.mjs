import { findingEndpoint, readJson } from '../api.mjs';
import { dateLabel, escapeHtml, safeCapturePath, statusPill, verdictByMarkup } from '../format.mjs';
import { activePage, fixFirstFindings, openFindings, primaryClass, severityNames, state } from '../state.mjs';
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
  return `<form id="resolution-form" class="finding-form" novalidate data-finding-id="${escapeHtml(finding.id)}"><label for="retest-note">What did you check again, and what happened?</label><p id="retest-help" class="form-help">Record a fresh check and its result. At least 20 characters.</p><textarea id="retest-note" name="note" rows="4" aria-describedby="retest-help finding-error" required minlength="20" maxlength="1200" placeholder="For example: pressed Reserve on a phone; the booking was confirmed."></textarea><div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Mark fixed</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

function newFindingFormMarkup(page) {
  const capture = page.captures.desktop.state === 'rendered' ? `<label class="capture-choice"><input type="checkbox" name="attachCapture"> Attach the Computer screenshot if it shows the bug</label>` : '';
  const severities = ['P0', 'P1', 'P2', 'P3'].map(code => `<option value="${code}" ${code === 'P2' ? 'selected' : ''}>${severityNames[code]}</option>`).join('');
  return `<form id="finding-form" class="finding-form" novalidate><label for="finding-title">What’s wrong?</label><input id="finding-title" name="title" aria-describedby="finding-error" required minlength="8" maxlength="120" placeholder="For example: Reserve does nothing on a phone"><label for="finding-severity">How bad is it?</label><select id="finding-severity" name="severity">${severities}</select><label for="finding-detail">What happened, and how can someone see it again?</label><p id="finding-detail-help" class="form-help">Include the steps and the result, so someone can reproduce it. At least 20 characters.</p><textarea id="finding-detail" name="detail" rows="4" aria-describedby="finding-detail-help finding-error" required minlength="20" maxlength="1200" placeholder="Where did you start, what did you do, and what happened?"></textarea>${capture}<div id="finding-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="save-button" type="submit">Report a bug</button><button class="text-button" type="button" data-finding-action="cancel">Cancel</button></div></form>`;
}

// One open bug in a list: how bad it is, its title, and where to find it. Opens the Bugs section.
function openFindingRowMarkup(finding, meta, navigation) {
  return `<li><button type="button" class="finding-row" ${navigation}><span class="bug-severity severity-${escapeHtml(finding.severity)}">${escapeHtml(severityNames[finding.severity])}</span><span class="finding-row-title" title="${escapeHtml(finding.title)}">${escapeHtml(finding.title)}</span><span class="finding-row-meta">${meta}</span><span class="chevron" aria-hidden="true"></span></button></li>`;
}

// A page's open bugs above its answers: id, priority, title. Nothing when there are none.
export function openFindingsMarkup(page) {
  const open = openFindings(page);
  if (!open.length) return '';
  const rows = open.map(finding => openFindingRowMarkup(finding, escapeHtml(finding.id), 'data-view="works"')).join('');
  return `<section class="content-panel" data-open-findings aria-label="Open bugs"><h2>Open bugs</h2><ul class="finding-rows">${rows}</ul></section>`;
}

// The overview's Fix first: open P0–P2 bugs across pages, worst and oldest first.
export function fixFirstMarkup(pages) {
  const items = fixFirstFindings(pages);
  if (!items.length) return '';
  const rows = items.map(({ page, finding }) => openFindingRowMarkup(finding, `${escapeHtml(page.name)} · ${escapeHtml(finding.id)}`, `data-page="${escapeHtml(page.id)}" data-view="works"`)).join('');
  return `<section class="content-panel fix-first" data-fix-first aria-label="Fix first"><h2>Fix first</h2><ul class="finding-rows">${rows}</ul></section>`;
}

export function findingsMarkup(page) {
  const findings = [...page.findings].sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || a.severity.localeCompare(b.severity));
  const list = findings.length ? `<ul class="findings">${findings.map(findingMarkup).join('')}</ul>` : '<p class="muted">No bugs reported on this page.</p>';
  const form = state.findingForm === 'new' ? newFindingFormMarkup(page) : '';
  const action = state.findingForm === 'new' ? '' : `<button type="button" class="${primaryClass()}" data-action="report-bug" data-finding-action="new">Report a bug</button>`;
  return `<section class="content-panel" aria-label="Bugs"><div class="panel-heading"><h2>Bugs</h2>${action}</div>${form}${list}</section>`;
}

function showFindingError(error, field) {
  const box = document.querySelector('#finding-error');
  box.hidden = false;
  box.textContent = error.message;
  if (!field) box.closest('form').querySelector('.form-actions')?.insertAdjacentElement('beforebegin', box);
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    field.insertAdjacentElement('afterend', box);
    field.focus();
  }
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

function clearFindingErrors(form) {
  form.querySelectorAll('[aria-invalid]').forEach(field => field.removeAttribute('aria-invalid'));
}

function shortField(form, name, minimum, message) {
  const field = form.elements.namedItem(name);
  if (field.value.trim().length >= minimum) return false;
  showFindingError({ message }, field);
  return true;
}

export async function saveFinding(form) {
  clearFindingErrors(form);
  if (shortField(form, 'title', 8, 'Describe the bug in at least 8 characters.')) return;
  if (shortField(form, 'detail', 20, 'Write at least 20 characters about the steps and what happened.')) return;
  const page = activePage();
  const data = new FormData(form);
  const body = { title: data.get('title'), severity: data.get('severity'), detail: data.get('detail'), attachCapture: data.has('attachCapture') };
  await submitFinding(form, findingEndpoint(page), 'POST', body, 'Bug reported');
}

export async function resolveFinding(form) {
  clearFindingErrors(form);
  if (shortField(form, 'note', 20, 'Write at least 20 characters about your fresh check and its result.')) return;
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
