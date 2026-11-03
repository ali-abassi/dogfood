import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.mjs';
import { initProject } from './project-init.mjs';
import { saveProjectBrief } from './project-readiness.mjs';
import { validationError } from './store.mjs';

function words(value, label, max) {
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > max) throw validationError(`${label} must contain 3–${max} characters.`);
  return value.trim();
}
function workspace(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'project';
  const id = `${slug}-${randomUUID().slice(0, 8)}`, checkout = join(dataDir, 'workspaces', id);
  mkdirSync(checkout, { recursive: true });
  return { id, checkout };
}
function initialize(checkout, name) {
  writeFileSync(join(checkout, 'README.md'), `# ${name}\n\nProject discovery workspace. Implementation starts after scope review.\n`, { flag: 'wx' });
  const git = args => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', timeout: 10_000 });
  git(['init', '-q']); git(['add', '--', 'README.md']);
  git(['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Dogfood', '-c', 'user.email=dogfood@localhost', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'Start project discovery']);
}
export function startProject(input, actor = 'person') {
  if (Object.keys(input).some(key => !['name', 'idea'].includes(key))) throw validationError('Only a project name and idea are accepted.');
  const name = words(input.name, 'Project name', 120), idea = words(input.idea, 'Idea', 10000);
  const created = workspace(name);
  initialize(created.checkout, name);
  initProject({ ...created, name });
  saveProjectBrief(created.id, { mode: 'new', answers: { idea } }, actor);
  return { project: created.id, name, checkout: created.checkout, view: 'discovery' };
}
export function newProjectRoutes(readBody) { return [['POST', '/api/projects', async (_, request) => startProject(await readBody(request))]]; }
export const newProjectTools = [{ name: 'dogfood_start_project', description: 'Start an idea in a new managed local Git workspace and enter discovery. Never overwrites an existing checkout or starts an agent.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, idea: { type: 'string' }, agent: { type: 'string' } }, required: ['name', 'idea', 'agent'], additionalProperties: false }, run: ({ agent, ...input }) => startProject(input, agent) }];
