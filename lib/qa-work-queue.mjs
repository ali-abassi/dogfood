import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir, root } from './paths.mjs';
import { projectView, readProject, validationError } from './store.mjs';
import { agentBoard, createAgentCard } from './agent-board.mjs';

const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const fail = (message, status = 400) => Object.assign(validationError(message), { status });
const missing = requirement => !requirement.met;
const open = finding => finding.status === 'open';
const reviewMarker = 'Dogfood full-page QA request · v1';
function activeReview(card, pageId) {
  return card.intent === 'qa' && card.pageId === pageId && card.status !== 'done' && card.request.startsWith(`${reviewMarker}\n`);
}

function linkedRequest(cards, pageId) {
  const card = cards.find(item => activeReview(item, pageId));
  return card ? { id: card.id, title: card.title, status: card.status } : null;
}

function pageWork(page, cards) {
  const missingChecks = page.progress.requirements.filter(missing);
  return {
    id: page.id, name: page.name, route: page.route, status: page.progress.status,
    complete: page.progress.complete, accepted: page.progress.accepted,
    missingChecks, missingCount: missingChecks.length,
    acceptanceGaps: page.progress.acceptanceRequirements.filter(missing),
    openFindings: page.findings.filter(open),
    liveDebt: page.features.filter(feature => ['awaiting_deploy', 'pending'].includes(feature.liveDebt?.state)),
    features: page.features.map(({ id, name, expected, status }) => ({ id, name, expected, status })),
    request: linkedRequest(cards, page.id),
  };
}

function needsReview(page) { return !page.accepted || page.liveDebt.length > 0; }
function queueSummary(pages, total) {
  return {
    pages: total, needsReview: pages.length,
    missingChecks: pages.reduce((sum, page) => sum + page.missingCount, 0),
    openFindings: pages.reduce((sum, page) => sum + page.openFindings.length, 0),
    withRequests: pages.filter(page => page.request).length,
  };
}

// This is a projection of the real gate, never a second completion calculation.
export function qaWorkQueue(projectId, pageId) {
  const project = projectView(readProject(projectId));
  const cards = agentBoard(projectId).cards;
  const pages = project.pages.map(page => pageWork(page, cards)).filter(needsReview);
  const selected = pageId ? pages.filter(page => page.id === pageId) : pages;
  if (pageId) assertPage(project, pageId);
  return {
    projectId,
    source: queueSource(project),
    summary: queueSummary(selected, pageId ? 1 : project.pages.length),
    pages: selected,
  };
}
function queueSource(project) {
  return { url: project.source.url, environment: project.source.environment, checkoutFingerprint: project.pages[0]?.progress.checkoutFingerprint ?? null };
}
function assertPage(project, pageId) {
  if (!project.pages.some(page => page.id === pageId)) throw fail('The page does not exist.', 404);
}

function stillAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
function staleLock(file) {
  try { return !stillAlive(JSON.parse(readFileSync(file, 'utf8')).pid); }
  catch { return Date.now() - (statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? Date.now()) > 30_000; }
}
function tryLock(file) {
  try {
    const handle = openSync(file, 'wx');
    writeFileSync(handle, JSON.stringify({ pid: process.pid }));
    return handle;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (staleLock(file)) rmSync(file, { force: true });
    return null;
  }
}
function lockPage(projectId, pageId, operation) {
  const directory = join(dataDir, 'qa-request-locks');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${projectId}-${pageId}.lock`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const handle = tryLock(path);
    if (handle === null) { pause(10); continue; }
    try { return operation(); }
    finally { closeSync(handle); rmSync(path, { force: true }); }
  }
  throw fail('This page review is being saved. Try again.', 503);
}

function quote(value) { return `'${value.replaceAll("'", "'\\''")}'`; }
function readInstructions(projectId, pageId) {
  const input = JSON.stringify({ project: projectId, page: pageId });
  return `Read the complete current scope before checking anything:\nMCP: dogfood_qa_work_queue ${input}\nMCP: dogfood_page ${input}\nCLI fallback (the JSON is stdin):\nnode ${quote(join(root, 'bin/dogfood.mjs'))} tool dogfood_qa_work_queue --input - <<'DOGFOOD_INPUT'\n${input}\nDOGFOOD_INPUT`;
}
function requestBrief(queue, page) {
  const contract = [
    `${reviewMarker}\nComplete the required QA for ${page.name}. This is an exhaustive review of the registered scope, not a sample.`,
    `Project: ${queue.projectId}\nPage: ${page.id}\nRoute: ${page.route}\nSource: ${JSON.stringify(queue.source)}`,
    readInstructions(queue.projectId, page.id),
    'For every required check, exercise the behavior and record a pass or needs-work verdict with concrete evidence. If access or setup prevents a check, record the precise blocker and leave it incomplete. Do not infer behavioral, security, accessibility, or live-integration passes from screenshots.',
    'Recheck current source and environment before recording evidence. Preserve unrelated work and user records. This request does not authorize paid calls, account changes, publishing, or trading. Do not edit application source; file findings for fixes.',
    'Retest open findings; resolve only with fresh evidence. Do not retire requirements, mark blocked checks passed, or weaken the gate to finish. Read dogfood_complete for this page at the end and report every remaining requirement and blocker. A finished agent turn does not mean the audit or release is accepted.',
  ].join('\n\n');
  const exact = `\n\nCurrent required work:\n${JSON.stringify({ missingChecks: page.missingChecks, acceptanceGaps: page.acceptanceGaps, features: page.features, openFindings: page.openFindings, liveDebt: page.liveDebt }, null, 2)}`;
  if (contract.length + exact.length <= 10_000) return contract + exact;
  return `${contract}\n\nThe scope contains ${page.missingCount} missing requirements, ${page.features.length} features, and ${page.openFindings.length} open findings. It exceeds the inline brief limit. The mandatory tools above return the COMPLETE inventory without truncation; read it before starting. No requirement is waived or sampled.`;
}
function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Choose the agent for this page review.');
  if (Object.keys(input).some(key => key !== 'backend')) throw fail('Page reviews only accept backend; they are always saved without starting.');
}
function validateRequest(projectId, pageId, input) {
  validateInput(input);
  const backend = input.backend ?? 'codex';
  if (!['codex', 'claude'].includes(backend)) throw fail('Choose Codex or Claude Code.');
  assertPage(readProject(projectId), pageId);
  return backend;
}
function saveReview(projectId, pageId, backend) {
  const previous = agentBoard(projectId).cards.find(card => activeReview(card, pageId));
  if (previous) return { request: previous, reused: true, pageId };
  const queue = qaWorkQueue(projectId, pageId), page = queue.pages[0];
  if (!page) throw fail('This page has no outstanding QA requirements or findings.', 409);
  const request = createAgentCard(projectId, {
    title: `Review ${page.name}`.slice(0, 160), request: requestBrief(queue, page),
    backend, pageId, intent: 'qa', start: false,
  });
  return { request, reused: false, pageId };
}

export function requestPageReview(projectId, pageId, input = {}) {
  const backend = validateRequest(projectId, pageId, input);
  return lockPage(projectId, pageId, () => saveReview(projectId, pageId, backend));
}

export function qaWorkQueueRoutes(readBody) {
  const path = '/api/projects/([a-z0-9-]+)/work-queue';
  return [
    ['GET', path, ([project]) => qaWorkQueue(project)],
    ['POST', `${path}/([a-z0-9-]+)/request`, async ([project, page], request) => requestPageReview(project, page, await readBody(request)), 201],
  ];
}
const text = { type: 'string' };
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
export const qaWorkQueueTools = [
  {
    name: 'dogfood_qa_work_queue',
    description: 'Read the complete outstanding page QA inventory, exact missing gate requirements, open findings, live debt, source fingerprint and active review requests. Optional page scopes the inventory without truncation. Does not run checks or start work.',
    inputSchema: schema({ project: text, page: text }, ['project']),
    run: input => qaWorkQueue(input.project, input.page),
  },
  {
    name: 'dogfood_request_page_review',
    description: 'Save an exhaustive QA request for one page with outstanding checks or findings. Reuses an active full-page request generated by this queue; unrelated narrow reviews remain separate. Never starts an agent, changes verdicts or accepts the page.',
    inputSchema: schema({ project: text, page: text, backend: { type: 'string', enum: ['codex', 'claude'] } }, ['project', 'page']),
    run: input => requestPageReview(input.project, input.page, { backend: input.backend }),
  },
];
