import { answerMarkMarkup, escapeHtml, plainMessageMarkup, shortReason } from '../format.mjs';
import { deviceNames, displayAnswerStatus, state } from '../state.mjs';
import { aboutMarkup } from './about.mjs';
import { shownShot, timelineMarkup } from './history.mjs';
import { qaAgentMarkup } from './qa-agent.mjs';
import { openFindingsMarkup } from './issues.mjs';

function screenPictureMarkup(page, device, shot) {
  if (!shot) return `<div class="screen-missing">${plainMessageMarkup(page.captures[device].reason || 'No screenshot that day.')}</div>`;
  const size = shot.width ? ` width="${escapeHtml(shot.width)}" height="${escapeHtml(shot.height)}"` : '';
  return `<img data-screenshot src="${shot.src}" alt="${escapeHtml(page.name)} on a ${escapeHtml(deviceNames[device].toLowerCase())}"${size}>`;
}

// Each screenshot is the whole page; its frame scrolls so the page can be read top to bottom.
function screenMarkup(page, device) {
  const shot = shownShot(page, device);
  const caption = shot?.caption ?? 'No screenshot';
  return `<figure class="report-screen report-screen-${device}"><div class="screen-frame" role="group" tabindex="0" aria-label="${escapeHtml(deviceNames[device])} screenshot, scrolls">${screenPictureMarkup(page, device, shot)}</div><figcaption title="${escapeHtml(caption)}"><strong>${escapeHtml(deviceNames[device])}</strong> ${escapeHtml(caption)}</figcaption></figure>`;
}

const emptyScreens = {
  blocked: capture => ({ title: 'Can’t take screenshots', text: capture.reason, action: 'Check again' }),
  missing: () => ({ title: 'Not checked yet', text: 'dogfood opens the page on a computer and a phone, takes full screenshots, and measures it. It takes about 15 seconds.', action: 'Take screenshots' }),
};

// The store marks a page that was never captured as blocked with this reason (lib/store.mjs).
const neverCaptured = 'Not captured yet.';

// With no screenshot at all, the panel says why and offers to take them.
function scanErrorMarkup() {
  return state.scan.error ? `<p class="form-error" role="alert">${escapeHtml(state.scan.error)}</p>` : '';
}

function takeScreenshotsMarkup(page) {
  const capture = page.captures.desktop;
  const copy = emptyScreens[capture.reason && capture.reason !== neverCaptured ? 'blocked' : 'missing'](capture);
  const label = state.scan.running ? 'Taking screenshots…' : copy.action;
  return `<div class="screens-empty"><strong>${copy.title}</strong><div class="screens-empty-text">${plainMessageMarkup(copy.text)}</div><button type="button" class="save-button" data-action="scan" ${state.scan.running ? 'disabled' : ''}>${label}</button>${scanErrorMarkup()}</div>`;
}

function screensMarkup(page) {
  const rendered = ['desktop', 'mobile'].some(device => page.captures[device].state === 'rendered');
  const body = rendered ? `<div class="report-screen-pair">${screenMarkup(page, 'desktop')}${screenMarkup(page, 'mobile')}</div>` : takeScreenshotsMarkup(page);
  const actions = rendered ? `<div class="screens-actions">${timelineMarkup()}<button type="button" class="link-button" data-action="view-screens">View full page</button></div>` : '';
  return `<section class="report-screens content-panel" data-report-screens aria-label="How the page looks">${actions}${body}</section>`;
}

function aiCheckWanted(page) {
  return page.progress.aiReview !== 'current' && page.captures.desktop.state === 'rendered';
}

// The AI check is the one primary action, offered only while the AI has not seen these screenshots.
function aiCheckMarkup(page) {
  if (!aiCheckWanted(page)) return '';
  const running = state.visual.running;
  const error = state.visual.error ? `<p class="form-error" role="alert">${escapeHtml(state.visual.error)}</p>` : '';
  return `<div class="ai-check"><button type="button" class="save-button" data-action="run-visual" ${running ? 'disabled' : ''}>${running ? 'Checking with AI…' : 'Check with AI'}</button><small>Under a tenth of a cent</small>${error}</div>`;
}

function answerRowMarkup(page, answer) {
  // The tag cell is always there, so every row's chevron lines up.
  const source = `<span class="answer-source-tag">${answer.parts.some(part => part.source === 'ai') ? 'AI' : ''}</span>`;
  const oneLine = shortReason(answer.summary);
  return `<li><button type="button" class="answer-row" data-view="${escapeHtml(answer.id)}" data-answer-row="${escapeHtml(answer.id)}">${answerMarkMarkup(answer.name, displayAnswerStatus(page, answer))}<span class="answer-name">${escapeHtml(answer.name)}</span><span class="answer-summary" title="${escapeHtml(oneLine)}">${escapeHtml(oneLine)}</span>${source}<span class="chevron" aria-hidden="true"></span></button></li>`;
}

function answersMarkup(page) {
  const rows = page.progress.answers.map(answer => answerRowMarkup(page, answer)).join('');
  return `<section class="answers-panel content-panel" data-answers aria-labelledby="answers-heading"><header class="answers-heading"><h2 id="answers-heading">Is this page working?</h2><div class="answers-actions">${qaAgentMarkup(page)}${aiCheckMarkup(page)}</div></header><ul class="answer-list">${rows}</ul></section>`;
}

export function pageReportMarkup(page) {
  return `${screensMarkup(page)}${openFindingsMarkup(page)}${answersMarkup(page)}${aboutMarkup(page)}`;
}
