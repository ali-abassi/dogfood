import './env.mjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { pageById, projectView, readProject, validationError } from './store.mjs';

// DOGFOOD_QA_AGENT is the command that starts a QA agent on one page, split on spaces, with {project}, {page}, {run}
// and {workdir} filled in; dogfood adds the brief as its last argument. For example:
// my-agent run --name qa-{page}-{run} --cwd {workdir} --background
const agentCommand = () => process.env.DOGFOOD_QA_AGENT?.trim() ?? '';
const runsDir = join(dataDir, 'qa-agents');
const startTimeoutMs = 60_000;
const startingPages = new Set();
const repeatWindowMs = 30 * 60_000;

export function qaAgentConfigured() {
  return Boolean(agentCommand());
}

function runsFile(projectId) {
  return join(runsDir, `${projectId}.json`);
}

// The latest QA agent started on each page of a project, by page id.
export function qaAgentRuns(projectId) {
  readProject(projectId);
  const file = runsFile(projectId);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function missingLines(page) {
  return page.progress.requirements.filter(item => !item.met).map(item => `- ${item.label}: ${item.missing}`).join('\n');
}

function browserLine(project, page, run) {
  const profile = project.source.browserProfile ? ` --profile ${project.source.browserProfile}` : '';
  return `agent-browser --session qa-${page.id}-${run}${profile} ...`;
}

export function qaBrief(project, page, run, workdir) {
  const address = page.url ?? new URL(page.route, project.source.url).href;
  return `You are the QA agent for ${project.name} in dogfood. Finish page QA for the page "${page.name}" (${page.id}) at ${address}. You are done when \`node ${root}/scripts/gate.mjs ${project.id} ${page.id}\` shows it complete. Do not ask questions.

What the page still needs:
${missingLines(page)}

Tools:
- dogfood from the shell: \`node ${root}/mcp.mjs <tool> '<json>'\`. Start with dogfood_page {"project":"${project.id}","page":"${page.id}"}; then use dogfood_scan_page, dogfood_ai_review, dogfood_run_tests, dogfood_record_verdicts, dogfood_add_issue, dogfood_resolve_issue and dogfood_complete as the missing items call for. Pass "agent":"qa-agent" wherever a tool takes an agent. Never edit dogfood's data files.
- Browser: \`${browserLine(project, page, run)}\`: open, snapshot -i, act, re-snapshot, and verify what is on screen. Save screenshots in ${workdir}. Close only your own session.

Rules: check what a person would, and record every verdict with what you saw on screen. A failure is an issue with priority (P0 breaks the app, P1 blocks this page, P2 annoying, P3 cosmetic), steps, expected and observed. Never publish, send, pay, delete, change settings or accounts, or type a password; if the page needs a sign-in you do not have, record that it is blocked and why. Spend at most $1 of provider cost.

Report what you checked, what you recorded, the issues you filed, and anything you could not check and why.`;
}

function agentArgv(projectId, pageId, run, workdir) {
  const fill = part => part.replaceAll('{project}', projectId).replaceAll('{page}', pageId).replaceAll('{run}', run).replaceAll('{workdir}', workdir);
  const command = agentCommand();
  const argv = command.startsWith('[') ? JSON.parse(command) : command.split(/\s+/);
  if (!Array.isArray(argv) || !argv.length || argv.some(part => typeof part !== 'string')) throw validationError('DOGFOOD_QA_AGENT must be a command or JSON argv array.');
  return argv.map(fill);
}

// Waits for the start command itself (a background start returns once the agent is running) and reports its failure plainly.
function runStartCommand(argv, brief, workdir) {
  const log = openSync(join(workdir, 'start.log'), 'a');
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], [...argv.slice(1), brief], { cwd: workdir, stdio: ['ignore', log, log], timeout: startTimeoutMs });
    child.on('error', error => reject(validationError(`The QA agent could not start: ${error.message}`)));
    child.on('exit', code => (code === 0 ? resolve() : reject(Object.assign(new Error(`The QA agent could not start (exit ${code}); see ${join(workdir, 'start.log')}.`), { status: 502 }))));
  });
}

function recordRun(projectId, pageId, run, workdir) {
  mkdirSync(runsDir, { recursive: true });
  const runs = { ...qaAgentRuns(projectId), [pageId]: { run, status: 'unknown', startedAt: new Date().toISOString(), workdir } };
  writeFileSync(runsFile(projectId), `${JSON.stringify(runs, null, 2)}\n`);
  return runs;
}

// Starts a QA agent on one incomplete page; it records its evidence through dogfood's MCP tools as it works.
export async function startQaAgent(projectId, pageId) {
  if (!qaAgentConfigured()) throw validationError('No QA agent is set up. Set DOGFOOD_QA_AGENT in dogfood’s .env.');
  const view = projectView(readProject(projectId));
  const page = pageById(view, pageId);
  if (page.progress.complete) throw validationError(`${page.name} is already complete.`);
  const key = `${projectId}/${pageId}`;
  const existing = qaAgentRuns(projectId)[pageId];
  assertNoRecentRun(key, existing);
  startingPages.add(key);
  try { return await launchQaAgent(view, page); }
  finally { startingPages.delete(key); }
}

async function launchQaAgent(project, page) {
  const run = Date.now().toString(36);
  const workdir = join(runsDir, project.id, page.id, run);
  mkdirSync(workdir, { recursive: true });
  await runStartCommand(agentArgv(project.id, page.id, run, workdir), qaBrief(project, page, run, workdir), workdir);
  return recordRun(project.id, page.id, run, workdir);
}

function assertNoRecentRun(key, existing) {
  if (startingPages.has(key)) throw validationError('A QA agent is already starting on this page.');
  if (existing && Date.now() - Date.parse(existing.startedAt) < repeatWindowMs) throw validationError('A QA run was already started on this page; its status is unknown. Inspect that run before starting another.');
}
