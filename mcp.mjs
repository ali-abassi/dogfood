import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { onboardProject } from './lib/onboard.mjs';
import { scanPage, scanProject } from './lib/scanner.mjs';
import {
  addFeatures, createFinding, createProject, listProjects, pageById, projectView, readProject, recordCapture,
  recordVerdicts, registerPage, saveAudit, setConnections, updateFinding,
} from './lib/store.mjs';
import { auditKeys, captureTiers, checkKeys, connectionProvenance, devices, httpMethods, severities, verdicts } from './lib/schema.mjs';
import { runTests } from './lib/test-runs.mjs';
import { projectReport } from './lib/report.mjs';
import { startReview } from './lib/reviews.mjs';

const supportedVersions = new Set(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
const agentPattern = /^[A-Za-z0-9-]{1,40}$/;
const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const verdictValues = [...verdicts];
const verdictSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: verdictValues },
    note: { type: 'string', description: 'Evidence note supporting the verdict; pass and needs_work require at least 12 characters.' },
  },
  required: ['status', 'note'],
};
const projectPageProperties = {
  project: { type: 'string', description: 'Project ID already registered in dogfood.' },
  page: { type: 'string', description: 'Page ID within the selected project.' },
};
const projectPageRequired = ['project', 'page'];
const auditVerdictSchema = {
  type: 'object',
  properties: Object.fromEntries(auditKeys.map(key => [key, {
    type: 'array',
    items: { type: 'object', properties: { id: { type: 'string' }, ...verdictSchema.properties }, required: ['id', ...verdictSchema.required] },
  }])),
};
const connectionsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' }, name: { type: 'string' }, method: { type: 'string', enum: [...httpMethods] },
      endpoint: { type: 'string' }, sends: { type: 'string' }, receives: { type: 'string' }, source: { type: 'string' },
      provenance: { type: 'string', enum: [...connectionProvenance] },
    },
    required: ['id', 'name', 'method', 'endpoint', 'sends', 'receives', 'source', 'provenance'],
  },
};

function objectSchema(properties, required, extra = {}) {
  return { type: 'object', properties, required, ...extra };
}

function byAgent(agent) {
  if (typeof agent !== 'string' || !agentPattern.test(agent)) throw new Error('Agent name must contain 1–40 letters, numbers, or hyphens.');
  return `agent:${agent}`;
}

function projectList() {
  return listProjects().map(project => ({
    ...project,
    completePages: projectView(readProject(project.id)).pages.filter(page => page.progress.complete).length,
  }));
}

// The tool an agent calls next for each unmet requirement, so it never has to guess.
const requirementTools = {
  capture: 'dogfood_scan_page',
  scan: 'dogfood_scan_page',
  features: 'dogfood_ai_review then dogfood_add_features, then dogfood_record_verdicts',
  checks: 'dogfood_record_verdicts',
  audit: 'dogfood_record_verdicts',
  connections: 'dogfood_scan_page or dogfood_set_connections',
  tests: 'dogfood_run_tests',
  'ai-review': 'dogfood_ai_review',
  issues: 'dogfood_resolve_issue (after retesting the fix)',
};

function pageOutcome(page, issue) {
  const outcome = {
    page: page.id,
    name: page.name,
    status: page.progress.status,
    complete: page.progress.complete,
    changedSinceReview: page.progress.changedSinceReview,
    missing: page.progress.requirements.filter(item => !item.met).map(({ id, label, missing }) => ({ id, label, missing, tool: requirementTools[id] })),
  };
  return issue ? { ...outcome, issue } : outcome;
}

function pageOutcomeFrom(project, pageId, issue) {
  return pageOutcome(pageById(projectView(project), pageId), issue);
}

function savePage(pageId, save) {
  return pageOutcomeFrom(save(), pageId);
}

function nextPages({ project }) {
  return projectView(readProject(project)).pages.filter(page => !page.progress.complete).map(page => pageOutcome(page));
}

function createDogfoodProject(input) {
  const project = createProject(input);
  return { project: project.id, name: project.name, pageCount: project.pages.length };
}

function register({ project, page }) {
  return savePage(page.id, () => registerPage(project, page));
}

function addPageFeatures({ project, page, agent, features }) {
  return savePage(page, () => addFeatures(project, page, features, byAgent(agent)));
}

function keepExistingQuestions(audit, currentAudit) {
  return Object.fromEntries(Object.entries(audit).map(([key, rows]) => {
    const existing = currentAudit[key] ?? [];
    return [key, rows.map(row => ({ ...existing.find(item => item.id === row.id), ...row }))];
  }));
}

function checklist({ project, page, agent, audit }) {
  const current = pageById(readProject(project), page);
  return savePage(page, () => saveAudit(project, page, { audit: keepExistingQuestions(audit, current.audit), connections: current.connections }, byAgent(agent)));
}

function complete({ project, page }) {
  const current = pageById(projectView(readProject(project)), page);
  if (!current.progress.complete) {
    const missing = current.progress.requirements.filter(item => !item.met).map(item => `- ${item.id}: ${item.missing}`).join('\n');
    throw new Error(missing);
  }
  return `Page ${current.name} QA is complete with status ${current.progress.status}.`;
}

function capture({ project, page, ...input }) {
  return savePage(page, () => recordCapture(project, page, input));
}

function addIssue({ project, page, agent, severity, title, detail, attachCapture = false }) {
  const saved = createFinding(project, page, { severity, title, detail, attachCapture }, byAgent(agent));
  const finding = pageById(saved, page).findings.at(-1);
  return pageOutcomeFrom(saved, page, finding.id);
}

function resolveIssue({ project, page, agent, issue, note }) {
  return savePage(page, () => updateFinding(project, page, issue, { status: 'resolved', note }, byAgent(agent)));
}

async function runPageTests({ project, page }) {
  const { run } = await runTests(project, page);
  return { run };
}

function onboardWithOptionalReview({ confirmAiReviewUsage, ...input }) {
  return onboardProject({ ...input, aiReview: confirmAiReviewUsage === true });
}

async function scanRegisteredPage({ project, page }) {
  await scanPage(project, page);
  return pageOutcomeFrom(readProject(project), page);
}

async function scanEntireProject({ project }) {
  const result = await scanProject(project);
  return { project, scanned: result.scanned, failed: result.failed, changed: result.changed };
}

async function reviewPage({ project, page, confirmUsage }) {
  if (confirmUsage !== true) throw new Error('This review sends the screenshot to a model provider and spends usage; pass confirmUsage: true to continue.');
  return startReview(project, page);
}

const definitions = [
  {
    name: 'dogfood_onboard_project',
    description: 'Create a project from one HTTP(S) URL, discover same-site pages from rendered links and the sitemap, then scan each page into validated desktop and mobile evidence. Prefer this over manual project and page registration.',
    inputSchema: objectSchema({
      url: { type: 'string', description: 'HTTP or HTTPS URL of the product to onboard.' },
      name: { type: 'string', description: 'Optional project name; its slug becomes the project ID.' },
      id: { type: 'string', description: 'Optional project ID seed used when name is not provided.' },
      browserProfile: { type: 'string', description: 'Optional Chrome profile name such as Default for signed-in scans.' },
      confirmAiReviewUsage: { type: 'boolean', description: 'Optional: true also runs the AI review on every scanned page so each arrives with suggested features. It sends screenshots to a model provider and costs about half a cent per page.' },
    }, ['url']),
    run: onboardWithOptionalReview,
  },
  {
    name: 'dogfood_scan_page',
    description: 'Rescan one registered page at desktop and mobile sizes, save validated screenshots and measured facts, and return its compact QA outcome. Prefer this over recording captures by hand.',
    inputSchema: objectSchema(projectPageProperties, projectPageRequired),
    run: scanRegisteredPage,
  },
  {
    name: 'dogfood_scan_project',
    description: 'Rescan every page of a project at desktop and mobile sizes, and list which pages changed visually since the previous scan.',
    inputSchema: objectSchema({ project: projectPageProperties.project }, ['project']),
    run: scanEntireProject,
  },
  {
    name: 'dogfood_report',
    description: 'Get a Markdown QA report for a project: what needs attention, every page with what it still misses, open issues, and what the evidence does not prove. Use it to report QA status to a person.',
    inputSchema: objectSchema({ project: projectPageProperties.project }, ['project']),
    run: ({ project }) => projectReport(project),
  },
  {
    name: 'dogfood_projects',
    description: 'List registered dogfood projects with page totals and the number whose evidence-based QA completion gate is satisfied.',
    inputSchema: objectSchema({}, []),
    run: projectList,
  },
  {
    name: 'dogfood_create_project',
    description: 'Create an empty dogfood project from its URL before registering pages by hand. Prefer dogfood_onboard_project, which also finds and scans every page.',
    inputSchema: objectSchema({
      id: { type: 'string', description: 'Lowercase project ID using letters, numbers, and hyphens.' },
      name: { type: 'string', description: 'Human-readable product or project name.' },
      description: { type: 'string', description: 'Short description of the product being checked.' },
      url: { type: 'string', description: 'HTTP or HTTPS URL of the product.' },
      environment: { type: 'string', description: 'Environment under review, such as local, preview, or production.' },
      checkout: { type: 'string', description: 'Optional local checkout path; needed only for focused tests.' },
      browserProfile: { type: 'string', description: 'Optional Chrome profile name (for example Default) so scans see signed-in pages.' },
      guidelines: { type: 'array', items: { type: 'string' }, description: 'Optional project-specific QA guidance.' },
    }, ['id', 'name', 'url']),
    run: createDogfoodProject,
  },
  {
    name: 'dogfood_register_page',
    description: 'Register or update one page and its feature inventory, route, test plan, and explicit untested boundary before collecting QA evidence.',
    inputSchema: objectSchema({
      project: projectPageProperties.project,
      page: objectSchema({
        id: { type: 'string', description: 'Stable lowercase page ID using letters, numbers, and hyphens.' },
        name: { type: 'string', description: 'Human-readable page name.' },
        group: { type: 'string', description: 'Navigation group such as Public or Account.' },
        route: { type: 'string', description: 'Route checked within the product.' },
        url: { type: 'string', description: 'Optional full page URL when the route alone does not locate it, for example https://app.example/#/billing in a hash-routed app. Scans open this URL.' },
        features: { type: 'array', items: objectSchema({ id: { type: 'string' }, name: { type: 'string' } }, ['id', 'name']) },
        tests: { type: 'array', items: objectSchema({ id: { type: 'string' }, label: { type: 'string' }, file: { type: 'string' }, reason: { type: 'string' } }, ['id', 'label', 'file', 'reason']) },
        untestedNote: { type: 'string', description: 'A clear boundary that this page QA does not cover.' },
      }, ['id', 'name', 'group', 'route', 'features', 'untestedNote']),
    }, ['project', 'page']),
    run: register,
  },
  {
    name: 'dogfood_add_features',
    description: 'Add features to a page, for example ones dogfood_ai_review suggested; names already listed are skipped. Returns the page’s compact QA outcome.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      agent: { type: 'string', description: 'Agent name used to attribute the added features.' },
      features: {
        type: 'array',
        description: 'Features to add, each with a name and one sentence of expected behavior.',
        items: objectSchema({ name: { type: 'string' }, expected: { type: 'string' } }, ['name']),
      },
    }, ['project', 'page', 'agent', 'features']),
    run: addPageFeatures,
  },
  {
    name: 'dogfood_page',
    description: 'Read one registered page with its capture, verdicts, findings, connection map, test plan, and derived completion requirements.',
    inputSchema: objectSchema(projectPageProperties, projectPageRequired),
    run: ({ project, page }) => pageById(projectView(readProject(project)), page),
  },
  {
    name: 'dogfood_next',
    description: 'Find the next pages needing QA in registered site order and inspect each page’s status plus every missing evidence requirement.',
    inputSchema: objectSchema({ project: projectPageProperties.project }, ['project']),
    run: nextPages,
  },
  {
    name: 'dogfood_record_capture',
    description: 'Attach one absolute PNG screenshot (desktop or mobile) as page evidence, or record why capture is blocked. Prefer dogfood_scan_page, which takes both screenshots and measures the page in one step.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      device: { type: 'string', enum: devices, description: 'Which screenshot this is: desktop or mobile.' },
      file: { type: 'string', description: 'Absolute PNG path. For rendered evidence provide all rendered fields (file, sourceUrl, viewport, actor, tier, fullPage), or provide blockedReason instead.' },
      sourceUrl: { type: 'string', description: 'HTTP(S) capture URL. For rendered evidence provide all rendered fields, or provide blockedReason instead.' },
      viewport: { type: 'string', description: 'Capture viewport such as 1440 × 900. For rendered evidence provide all rendered fields, or provide blockedReason instead.' },
      actor: { type: 'string', description: 'Person or agent who captured the page. For rendered evidence provide all rendered fields, or provide blockedReason instead.' },
      tier: { type: 'string', enum: [...captureTiers], description: 'Evidence provenance tier. For rendered evidence provide all rendered fields, or provide blockedReason instead.' },
      fullPage: { type: 'boolean', description: 'Whether the screenshot covers the full page. For rendered evidence provide all rendered fields, or provide blockedReason instead.' },
      blockedReason: { type: 'string', description: 'Reason capture is blocked; provide this instead of all rendered fields (file, sourceUrl, viewport, actor, tier, fullPage).' },
    }, [...projectPageRequired, 'device']),
    run: capture,
  },
  {
    name: 'dogfood_record_verdicts',
    description: 'Record partial evidence-backed verdicts for quality checks, page features, or checklist questions; each changed verdict is attributed to the named agent.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      agent: { type: 'string', description: 'Agent name used to attribute each changed verdict.' },
      checks: objectSchema(Object.fromEntries(checkKeys.map(key => [key, verdictSchema])), []),
      features: { type: 'array', items: objectSchema({ id: { type: 'string' }, ...verdictSchema.properties }, ['id', ...verdictSchema.required]) },
      audit: auditVerdictSchema,
    }, ['project', 'page', 'agent']),
    run: ({ project, page, agent, checks, features, audit }) => savePage(page, () => recordVerdicts(project, page, { checks, features, audit }, byAgent(agent))),
  },
  {
    name: 'dogfood_set_connections',
    description: 'Map the page request and every observed API or data exchange, including method, endpoint, sent and returned information, and evidence provenance.',
    inputSchema: objectSchema({ ...projectPageProperties, connections: connectionsSchema }, ['project', 'page', 'connections']),
    run: ({ project, page, connections }) => savePage(page, () => setConnections(project, page, connections)),
  },
  {
    name: 'dogfood_set_checklist',
    description: `Edit the ${auditKeys.join(', ')} checklist questions and verdicts while retaining this page’s existing connection map; changed verdicts need agent attribution.`,
    inputSchema: objectSchema({
      ...projectPageProperties,
      agent: { type: 'string', description: 'Agent name used to attribute changed checklist verdicts.' },
      audit: objectSchema(Object.fromEntries(auditKeys.map(key => [key, {
        type: 'array',
        items: objectSchema({ id: { type: 'string' }, question: { type: 'string' }, ...verdictSchema.properties }, ['id', 'question', ...verdictSchema.required]),
      }])), auditKeys),
    }, ['project', 'page', 'agent', 'audit']),
    run: checklist,
  },
  {
    name: 'dogfood_add_issue',
    description: 'Record a reproducible page issue with priority, observed behavior, and reproduction detail, optionally attaching the current validated capture as evidence.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      agent: { type: 'string', description: 'Agent name used to attribute the finding.' },
      severity: { type: 'string', enum: severities, description: 'Issue priority.' },
      title: { type: 'string', description: 'Concise issue title.' },
      detail: { type: 'string', description: 'Observed behavior and steps to reproduce.' },
      attachCapture: { type: 'boolean', description: 'Optional, default false: attach the current desktop screenshot as evidence.' },
    }, ['project', 'page', 'agent', 'severity', 'title', 'detail']),
    run: addIssue,
  },
  {
    name: 'dogfood_resolve_issue',
    description: 'Resolve an existing page issue only after retesting it, with a written note describing the result and attribution to the named agent.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      agent: { type: 'string', description: 'Agent name used to attribute the resolution.' },
      issue: { type: 'string', description: 'Finding ID, for example QA-001.' },
      note: { type: 'string', description: 'Retest evidence explaining why the finding is resolved.' },
    }, ['project', 'page', 'agent', 'issue', 'note']),
    run: resolveIssue,
  },
  {
    name: 'dogfood_run_tests',
    description: 'Run only this page’s configured focused tests from its project checkout and return the persisted run report with case-level results.',
    inputSchema: objectSchema(projectPageProperties, projectPageRequired),
    run: runPageTests,
  },
  {
    name: 'dogfood_ai_review',
    description: 'Request a visual review of the current desktop and mobile screenshots; it returns clarity analysis plus suggested features an agent can add with dogfood_add_features. This sends the images to a model provider and spends usage, so explicit confirmation is required.',
    inputSchema: objectSchema({
      ...projectPageProperties,
      confirmUsage: { type: 'boolean', description: 'Set true to confirm sending the screenshot to a model provider and spending usage.' },
    }, ['project', 'page', 'confirmUsage']),
    run: reviewPage,
  },
  {
    name: 'dogfood_complete',
    description: 'Check whether every applicable page QA requirement has evidence; an agent must call this before reporting a page’s QA as done.',
    inputSchema: objectSchema(projectPageProperties, projectPageRequired),
    run: complete,
  },
];

const toolList = definitions.map(({ run, ...tool }) => tool);
const tools = new Map(definitions.map(definition => [definition.name, definition]));

// Checked before a tool runs, so an agent learns every missing argument at once.
function missingArguments(tool, args) {
  return tool.inputSchema.required.filter(name => args[name] === undefined || args[name] === '');
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function initialize({ protocolVersion }) {
  return {
    protocolVersion: supportedVersions.has(protocolVersion) ? protocolVersion : '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'dogfood', version: packageInfo.version },
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function toolResult(value) {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

async function runTool(tool, args) {
  const missing = missingArguments(tool, args);
  if (missing.length) throw new Error(`Missing required arguments: ${missing.join(', ')}.`);
  return tool.run(args);
}

async function callTool(request) {
  const params = request.params ?? {};
  const tool = tools.get(params.name);
  if (!tool) return rpcError(request.id, -32602, `Unknown tool: ${params.name}`);
  try {
    return { jsonrpc: '2.0', id: request.id, result: toolResult(await runTool(tool, params.arguments ?? {})) };
  } catch (error) {
    return { jsonrpc: '2.0', id: request.id, result: { ...toolResult(errorMessage(error)), isError: true } };
  }
}

function initializeResponse(request) {
  return { jsonrpc: '2.0', id: request.id, result: initialize(request.params ?? {}) };
}

function pingResponse(request) {
  return { jsonrpc: '2.0', id: request.id, result: {} };
}

function listToolsResponse(request) {
  return { jsonrpc: '2.0', id: request.id, result: { tools: toolList } };
}

const methods = new Map([
  ['tools/call', callTool],
  ['initialize', initializeResponse],
  ['ping', pingResponse],
  ['tools/list', listToolsResponse],
]);

async function responseFor(request) {
  const handler = methods.get(request.method);
  if (!handler) return rpcError(request.id, -32601, `Unknown method: ${request.method}`);
  return handler(request);
}

function parseLine(line) {
  try {
    return { request: JSON.parse(line) };
  } catch {
    return { error: rpcError(null, -32700, 'Parse error') };
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function invalidRequest(request) {
  return request === null || typeof request !== 'object' || Array.isArray(request);
}

async function processLine(line) {
  if (!line.trim()) return;
  const parsed = parseLine(line);
  if (parsed.error) return writeMessage(parsed.error);
  const request = parsed.request;
  if (invalidRequest(request)) return writeMessage(rpcError(null, -32600, 'Invalid request'));
  if (!Object.hasOwn(request, 'id')) return;
  writeMessage(await responseFor(request));
}

async function main() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) await processLine(line);
}

main().catch(error => {
  process.stderr.write(`${errorMessage(error)}\n`);
  process.exitCode = 1;
});
