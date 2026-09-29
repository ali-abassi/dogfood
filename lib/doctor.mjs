import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkoutRevision } from './revision.mjs';
import { dataDir, root } from './paths.mjs';
import { readProject } from './store.mjs';

function browserVersion() {
  try { return execFileSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim(); }
  catch { return null; }
}

function writableData() {
  let directory = dataDir;
  while (!existsSync(directory)) directory = dirname(directory);
  try { accessSync(directory, constants.W_OK); return true; } catch { return false; }
}

function revisionAvailable(project) {
  return Boolean(project?.source.checkout && checkoutRevision(resolve(root, project.source.checkout)).revision);
}

export function doctor(projectId) {
  const project = projectId ? readProject(projectId) : null;
  const browser = browserVersion();
  const node = Number(process.versions.node.split('.')[0]) >= 20;
  const writable = writableData();
  return {
    ok: node && writable,
    node: { version: process.versions.node, ok: node },
    data: { path: dataDir, writable },
    browser: { installed: Boolean(browser), version: browser, requiredFor: 'Page scans; task planning and native checks work without it.' },
    checkout: { revisionAvailable: revisionAvailable(project), requiredFor: 'Task verification needs a Git checkout with a commit; planning does not.' },
    project: project ? { id: project.id, checkout: project.source.checkout ?? null, url: project.source.url, environment: project.source.environment } : null,
    optional: { aiReviewConfigured: Boolean(process.env.DEEPSEEK_API_KEY), qaAgentConfigured: Boolean(process.env.DOGFOOD_QA_AGENT) },
  };
}
