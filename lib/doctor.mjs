import { execFile, execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { checkoutRevision } from './revision.mjs';
import { dataDir, root } from './paths.mjs';
import { readProject } from './store.mjs';
import { dataStoreIdentity } from './store-identity.mjs';

const run = promisify(execFile);
const localHosts = new Set(['localhost', '127.0.0.1']);

function browserVersion() {
  try { return execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim(); }
  catch { return null; }
}

function executable(binary) {
  const paths = isAbsolute(binary) ? [binary] : (process.env.PATH || '').split(delimiter).map(directory => join(directory, binary));
  return paths.find(path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } }) || null;
}

function writableData() {
  let directory = dataDir;
  while (!existsSync(directory)) directory = dirname(directory);
  try { accessSync(directory, constants.W_OK); return true; } catch { return false; }
}

function revisionAvailable(project) {
  return Boolean(project?.source.checkout && checkoutRevision(resolve(root, project.source.checkout)).revision);
}

function authState(authenticated) { return authenticated ? 'authenticated' : 'not_authenticated'; }
function claudeAuth(stdout) {
  const value = JSON.parse(stdout);
  return typeof value.loggedIn === 'boolean' ? authState(value.loggedIn) : 'unknown';
}
function codexAuth(output) {
  if (/not logged in/i.test(output)) return 'not_authenticated';
  return /logged in/i.test(output) ? 'authenticated' : 'unknown';
}
function authFailure(backend, error) {
  if (backend === 'codex') return codexAuth(`${error.stdout || ''}\n${error.stderr || ''}`);
  try { return claudeAuth(error.stdout); } catch { return 'unknown'; }
}
async function authentication(backend, path) {
  const args = backend === 'claude' ? ['auth', 'status', '--json'] : ['login', 'status'];
  try {
    const { stdout, stderr } = await run(path, args, { encoding: 'utf8', timeout: 3000, maxBuffer: 100_000 });
    return backend === 'claude' ? claudeAuth(stdout) : codexAuth(`${stdout}\n${stderr}`);
  } catch (error) { return authFailure(backend, error); }
}
async function nativeAgent(backend) {
  const path = executable(backend);
  const auth = path ? await authentication(backend, path) : 'unavailable';
  return { installed: Boolean(path), path, authentication: auth, ready: auth === 'authenticated', note: 'Local sign-in status only; provider access, quota and PAL account selection are confirmed by an actual request. Unrecognized output or a 3-second timeout means unknown, not signed out.' };
}

function localOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:') throw new Error('Use an http://localhost or http://127.0.0.1 server URL.');
  if (!localHosts.has(url.hostname) || url.username || url.password) throw new Error('Dogfood readiness only probes localhost or a loopback address, without URL credentials.');
  return url.origin;
}
function runtimeOrigins() {
  if (process.env.DOGFOOD_SERVER_URL) return [localOrigin(process.env.DOGFOOD_SERVER_URL)];
  if (process.env.DOGFOOD_PORT) return [localOrigin(`http://127.0.0.1:${process.env.DOGFOOD_PORT}`)];
  return ['http://127.0.0.1:4322', 'http://127.0.0.1:4321'];
}
async function localJson(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(800) });
  if (!response.ok) throw new Error('The local server did not answer this readiness check.');
  return response.json();
}
async function selectedBoard(origin, projectId) {
  if (!projectId) return null;
  try {
    const value = await localJson(`${origin}/api/projects/${encodeURIComponent(projectId)}/board`);
    return Array.isArray(value.cards) && Array.isArray(value.agents);
  } catch { return false; }
}
async function probeRuntime(origin, projectId) {
  const health = await localJson(`${origin}/api/health`);
  if (health.app !== 'dogfood') throw new Error('The local port is serving a different app.');
  const dataStoreMatches = health.dataStoreIdentity === dataStoreIdentity();
  const selectedProjectReachable = dataStoreMatches ? await selectedBoard(origin, projectId) : false;
  return { url: origin, reachable: true, dispatcher: health.agentBoardDispatcher === true, dataStoreMatches, selectedProjectReachable, ...storeDiagnosis(health, dataStoreMatches) };
}
function storeDiagnosis(health, matches) {
  if (matches) return {};
  if (!health.dataStoreIdentity) return { reason: 'This running server cannot identify its data store. It may be an older version.', nextStep: 'Restart Dogfood after updating, using the same DOGFOOD_DATA and existing server port.' };
  return { reason: 'The running server uses a different data folder and will not reconcile this CLI request store.', nextStep: 'Use the same DOGFOOD_DATA for the CLI and server, or set DOGFOOD_SERVER_URL to the server for this data folder.' };
}
function unavailableRuntime(reason) {
  return { url: null, reachable: false, dispatcher: false, dataStoreMatches: false, selectedProjectReachable: false, reason, nextStep: 'Start the Dogfood web server, or restart it after updating if an older server is running. Set DOGFOOD_SERVER_URL to its local address and use the same DOGFOOD_DATA. Keep it running to reconcile results and queued feedback.' };
}
async function runtimeStatus(projectId) {
  let origins;
  try { origins = runtimeOrigins(); } catch (error) { return unavailableRuntime(error.message); }
  for (const origin of origins) {
    try { return await probeRuntime(origin, projectId); } catch { /* Try the other established local port. */ }
  }
  return unavailableRuntime('No compatible Dogfood server answered at the configured local address.');
}
function requestsReady(base, checkout, runner, agents, runtime) {
  const backend = Object.values(agents).some(agent => agent.ready);
  return [base, checkout, runner.installed, backend, runtime.dispatcher, runtime.dataStoreMatches, runtime.selectedProjectReachable].every(Boolean);
}
function readiness(base, checkout, runner, agents, runtime) {
  return { planning: base, verification: base && checkout, agentRequests: requestsReady(base, checkout, runner, agents, runtime) };
}

function projectStatus(project) {
  if (!project) return null;
  return { id: project.id, checkout: project.source.checkout ?? null, url: project.source.url, environment: project.source.environment };
}

export async function doctor(projectId) {
  const project = projectId ? readProject(projectId) : null;
  const [codex, claude, runtime] = await Promise.all([nativeAgent('codex'), nativeAgent('claude'), runtimeStatus(projectId)]);
  const browser = browserVersion();
  const node = Number(process.versions.node.split('.')[0]) >= 20;
  const writable = writableData();
  const revision = revisionAvailable(project);
  const pal = executable(process.env.DOGFOOD_PAL_BIN || 'pal');
  const runner = { installed: Boolean(pal), path: pal, requiredFor: 'Starting native agents from the board; planning and checks work without it.' };
  const agents = { codex, claude };
  const ok = node && writable;
  return {
    ok,
    readiness: readiness(ok, revision, runner, agents, runtime),
    node: { version: process.versions.node, ok: node },
    data: { path: dataDir, writable },
    browser: { installed: Boolean(browser), version: browser, requiredFor: 'Page scans; task planning and native checks work without it.' },
    checkout: { revisionAvailable: revision, requiredFor: 'Task verification needs a Git checkout with a commit; planning does not.' },
    project: projectStatus(project),
    runner, agents, runtime,
    optional: { aiReviewConfigured: Boolean(process.env.DEEPSEEK_API_KEY), qaAgentConfigured: Boolean(process.env.DOGFOOD_QA_AGENT) },
  };
}
