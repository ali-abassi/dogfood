import { escapeHtml } from '../format.mjs';
import { state } from '../state.mjs';

const steps = [
  ['discovery', 'Define the outcome', 'Answer the important questions in Discovery. Review the Vision, Design and Plan so the agent knows what to build, what to leave out and how you will check it.', 'Open Discovery'],
  ['plan', 'Plan a testable task', 'Describe what “done” looks like, the files or areas in scope, and the checks that prove it. Link the pages and features it affects.', 'Open Plan'],
  ['board', 'Work with your agent', 'Send the task to Claude Code or Codex. Follow progress, answer questions and send feedback from the same request. Save for later keeps it in To do.', 'Open Agent board'],
  ['overview', 'Review, then prove it', 'Inspect the change, apply it to source and save the reviewed changes. Run the task checks and try the real app. Record page evidence before accepting the work.', 'Open Overview'],
];
function stepMarkup([view, title, body, action]) {
  return `<li><div><h2>${title}</h2><p>${body}</p><button type="button" class="link-button" data-project-view="${view}">${action} →</button></div></li>`;
}
function completionMarkup() {
  return `<section class="help-section"><h2>Know what is actually done</h2><dl class="help-definitions"><div><dt>Request done</dt><dd>You closed the agent conversation. Its work can still need checks.</dd></div><div><dt>Task accepted</dt><dd>The task’s current source checks and linked page requirements pass.</dd></div><div><dt>Page accepted</dt><dd>The required evidence is current, its answers pass and no findings remain open. Any declared live-verification debt stays visible.</dd></div><div><dt>Deployed</dt><dd>A separate shipping action. Verify the deployed app and its live integrations before claiming they work.</dd></div></dl></section>`;
}
function handoffPrompt() {
  return `Use Dogfood for project ${state.project.id}. Read the Dogfood skill and run dogfood context --project ${state.project.id} --json. Check the current source, scope, tasks and evidence before editing. Follow nextAction; do not start duplicate work or take another agent’s claim. For new scope, ask the unanswered questions and get the current Vision and Plan reviewed. Define a bounded task with an outcome, scope and real checks. Build in an isolated checkout. Report the change, checks, evidence and remaining gaps. A finished agent turn needs independent review; do not self-approve, push or deploy from a native request. Inspect exact tool arguments with dogfood schema TOOL. If a decision or access is required, state exactly what is missing.`;
}
function agentMarkup() {
  return `<section class="help-section help-agent"><div class="panel-heading"><h2>Give this to your agent</h2><button type="button" class="text-button" data-help-copy>Copy instructions</button></div><label class="sr-only" for="help-agent-prompt">Agent starting instructions</label><textarea id="help-agent-prompt" readonly rows="7">${escapeHtml(handoffPrompt())}</textarea><p id="help-copy-status" role="status" class="field-hint">Works with the Dogfood CLI or MCP tools. The agent skill contains the full operating instructions.</p><a href="https://github.com/ali-abassi/dogfood/blob/main/skills/dogfood/SKILL.md" target="_blank" rel="noopener noreferrer">Read the agent skill ↗</a></section>`;
}
function setupMarkup() {
  return `<details class="help-section help-setup"><summary>Setup and common questions</summary><h3>What do I need?</h3><p>Planning works locally. Starting agents needs PAL and your Claude Code or Codex sign-in. Web captures use agent-browser. Run <code>dogfood doctor --project ${escapeHtml(state.project.id)} --require-agents</code> to check setup. A ready installation does not guarantee provider quota.</p><h3>What happens when I send feedback?</h3><p>Send starts another turn in the same conversation. During work, it queues for the next turn. A note stays on the card and does not start work. Needs you means answer the question or repair the reported setup problem; retry only after that is resolved.</p><h3>How do apps and CLI projects fit?</h3><p>Web pages use browser captures. iOS screens use actual Simulator images with device and build evidence. CLI projects use command checks and captures of their generated output. Only claim the devices and integrations you exercised.</p><h3>Where are my files?</h3><p>The app, source and evidence stay local. Agent work is isolated until you explicitly review and apply it. Project documents belong in the project checkout; screenshots and conversations stay in Dogfood’s local data folder.</p><a href="https://github.com/ali-abassi/dogfood/blob/main/docs/cli.md" target="_blank" rel="noopener noreferrer">CLI and setup guide ↗</a></details>`;
}
export function helpMarkup() {
  return `<article class="help-view" data-ui><header class="overview-heading"><div><h1>How Dogfood works</h1><p>Plan the app. Work with your agents. Prove the result.</p></div></header><p class="help-intro">Dogfood is your local workspace for building with AI agents. It connects the product you intend to make, the work in progress and the evidence of what actually works.</p><ol class="help-steps">${steps.map(stepMarkup).join('')}</ol>${completionMarkup()}${agentMarkup()}${setupMarkup()}</article>`;
}
async function copyInstructions() {
  const status = document.getElementById('help-copy-status');
  try { await navigator.clipboard.writeText(handoffPrompt()); status.textContent = 'Copied. Paste these instructions into your coding agent.'; }
  catch { document.getElementById('help-agent-prompt')?.select(); status.textContent = 'Select and copy the instructions above.'; }
}
export function registerHelpEvents(app) {
  app.addEventListener('click', event => { if (event.target.closest('[data-help-copy]')) void copyInstructions(); });
}
