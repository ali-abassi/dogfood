import './env.mjs';
import { readFileSync, existsSync, accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { pageById, projectView, readProject, validationError } from './store.mjs';
import { agentBoard, createAgentCard, dispatchAgentBoard } from './agent-board.mjs';

// Page QA uses the same durable native session lifecycle as all other requests.
// DOGFOOD_QA_AGENT is deliberately not executed: arbitrary custom launch commands cannot bypass that lifecycle.
const startingPages = new Set();
const activeStates = new Set(['running', 'todo']);

export function qaAgentConfigured() {
  return agentBoardAvailability();
}

function agentBoardAvailability() {
  // Availability depends on local executable setup, checked authoritatively for each selected project at start.
  const directories = (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':');
  return [process.env.DOGFOOD_PAL_BIN, ...directories.map(directory => join(directory, 'pal'))].filter(Boolean).some(executable);
}

function executable(path) {
  try { accessSync(path, constants.X_OK); return true; } catch { return false; }
}

function legacyRuns(projectId) {
  const path = join(dataDir, 'qa-agents', `${projectId}.json`);
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}

function runReceipt(projectId, card) {
  return { run: card.id, card: card.id, status: card.status, startedAt: card.createdAt, updatedAt: card.updatedAt, workdir: card.checkout, error: card.error, result: card.result, session: card.session, url: `/?project=${encodeURIComponent(projectId)}&view=board&card=${encodeURIComponent(card.id)}` };
}

export function qaAgentRuns(projectId) {
  const cards = agentBoard(projectId).cards.filter(card => card.intent === 'qa' && card.pageId);
  const runs = Object.fromEntries(Object.entries(legacyRuns(projectId)).map(([page, run]) => [page, { ...run, status: 'legacy', legacy: true }]));
  for (const card of cards.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))) runs[card.pageId] = runReceipt(projectId, card);
  return runs;
}

function missingLines(page) {
  return page.progress.requirements.filter(item => !item.met).map(item => `- ${item.label}: ${item.missing}`).join('\n');
}

function browserContract(project) {
  if (project.source.platform === 'ios') return `This is native iOS QA for bundle ${project.source.bundleId}. Use the existing Simulator and native semantic UI tooling, not a browser rendering substituted for the app. Preserve containers, PINs, account state and existing user data; never reset or guess credentials. Record actual app/build/device evidence with dogfood_record_native_check. A source-unmatched installed build, missing device or protected screen stays unverified or blocked. Do not launch another simulator or browser as a shortcut.`;
  const session = process.env.DOGFOOD_BROWSER_SESSION;
  const profile = process.env.DOGFOOD_BROWSER_PROFILE || project.source.browserProfile;
  if (!session || !profile) return 'Browser setup is required: no designated session/profile is available. Report NEEDS_INPUT with the missing browser contract. Do not create a browser or substitute a new profile.';
  return `Reuse the designated existing browser session ${JSON.stringify(session)} with profile ${JSON.stringify(profile)}. Use agent-browser --session ${JSON.stringify(session)} for navigation and all viewport changes. Snapshot, interact, re-snapshot and verify. Do not launch another session, change accounts, close the selected preview or stop any service.`;
}

function qaAddress(project, page) { if (project.source.platform === 'ios') return `iOS bundle ${project.source.bundleId}, screen ${page.route}`; return page.url ?? new URL(page.route, project.source.url).href; }

export function qaBrief(project, page) {
  if (project.source.platform !== 'ios' && !page.url && !project.source.url) throw validationError('Attach the running app URL before asking a QA agent.');
  const address = qaAddress(project, page);
  return `Audit page "${page.name}" (${page.id}) at ${address} in project ${project.id}. Read dogfood context --project ${project.id} --json and dogfood_page first. This is page QA, not implementation: do not edit source, integrate changes, deploy, accept a planned task or claim production readiness.\n\nWhat the page still needs:\n${missingLines(page)}\n\nUse Dogfood MCP tools or node ${root}/mcp.mjs with explicit project ${project.id} and page ${page.id}. Never edit data files. Attribute observations as qa-agent. Record pass, needs-work or blocked with matching evidence, exact reproductions and honest remaining gaps. A completed audit can contain failures; page acceptance is a separate gate. Do not spend provider/API usage on visual review or paid test services.\n\n${browserContract(project)}\n\nDo not publish, message, pay, delete user data, change settings/accounts, type passwords, copy credentials or delegate. If authentication or another necessary decision is missing, begin your final response exactly NEEDS_INPUT: and ask the specific question. Report the checked devices/roles, concrete observed outcomes, recorded finding IDs, evidence locations and unverified items. Leave the browser and source for the owner.`;
}

function availableBackend(projectId) {
  const board = agentBoard(projectId);
  const preferred = process.env.DOGFOOD_QA_BACKEND || 'codex';
  const agent = board.agents.find(item => item.id === preferred && item.available) || board.agents.find(item => item.available);
  if (!agent) throw validationError('No native QA runner is available. Run dogfood doctor --require-agents with this project.');
  return agent.id;
}

function existingActive(projectId, pageId) {
  return agentBoard(projectId).cards.find(card => card.intent === 'qa' && card.pageId === pageId && activeStates.has(card.status));
}

export async function startQaAgent(projectId, pageId) {
  const project = projectView(readProject(projectId));
  const page = pageById(project, pageId);
  if (page.progress.accepted) throw validationError(`${page.name} is already accepted.`);
  const key = `${projectId}/${pageId}`;
  if (startingPages.has(key)) throw validationError('A QA request is already starting on this page.');
  if (existingActive(projectId, pageId)) return qaAgentRuns(projectId);
  startingPages.add(key);
  try { return await launchQaRequest(project, page); }
  finally { startingPages.delete(key); }
}

async function launchQaRequest(project, page) {
  createAgentCard(project.id, { title: `Check ${page.name}`, request: qaBrief(project, page), backend: availableBackend(project.id), pageId: page.id, intent: 'qa', start: true });
  await dispatchAgentBoard(project.id);
  return qaAgentRuns(project.id);
}
