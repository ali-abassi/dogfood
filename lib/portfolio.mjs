import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './paths.mjs';
import { listProjects, projectView, readProject, validationError } from './store.mjs';
import { assertSourceOperator } from './source-operator.mjs';

const path = join(dataDir, 'portfolio.json');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function document() {
  if (!existsSync(path)) return { version: 1, projects: [], updatedAt: null, by: null };
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.version !== 1 || !Array.isArray(value.projects)) throw validationError('Unsupported portfolio record.');
  return value;
}
function summarizedProject(id) {
  const project = projectView(readProject(id)), pages = project.pages;
  return { id, name: project.name, description: project.description, platform: project.source.platform || 'web', environment: project.source.environment, pages: pages.length, accepted: pages.filter(p => p.progress.accepted).length, needsWork: pages.filter(p => p.progress.status === 'needs_work').length, blocked: pages.filter(p => p.progress.status === 'blocked').length, findings: pages.flatMap(p => p.findings).filter(f => f.status === 'open').length, url: `/?project=${encodeURIComponent(id)}&view=overview` };
}
function projectSummary(id) {
  try { return summarizedProject(id); } catch (error) {
    const known = listProjects().find(project => project.id === id);
    return { id, name: known?.name || id, description: `This project could not be read: ${error.message}`, platform: 'unknown', environment: 'Check project setup', pages: null, accepted: null, needsWork: 0, blocked: 1, findings: null, unavailable: true };
  }
}
export function portfolio() {
  const value = document(), projects = listProjects();
  return { configured: existsSync(path), revision: hash(value), ...value, active: value.projects.map(projectSummary), history: projects.filter(project => !value.projects.includes(project.id) && project.id !== 'dogfood').map(({ id, name }) => ({ id, name })) };
}
function validatedProjects(input) {
  if (!Array.isArray(input.projects) || !input.projects.length || input.projects.length > 50) throw validationError('Choose between one and 50 registered projects.');
  if (new Set(input.projects).size !== input.projects.length) throw validationError('Current project IDs must be unique.');
  input.projects.forEach(id => readProject(id));
  return input.projects;
}
function writePortfolio(value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
function savePortfolio(input, by) {
  const previous = document();
  if (existsSync(path) && input.expectedRevision !== hash(previous)) throw Object.assign(validationError('The portfolio changed; read it again before saving.'), { status: 409 });
  const projects = validatedProjects(input);
  writePortfolio({ version: 1, projects, updatedAt: new Date().toISOString(), by });
}
export function setActiveProjects(input, by = 'person') {
  assertSourceOperator();
  if (Object.keys(input).some(key => !['projects', 'expectedRevision'].includes(key))) throw validationError('Unknown portfolio field.');
  mkdirSync(dataDir, { recursive: true });
  let handle;
  try { handle = openSync(`${path}.lock`, 'wx', 0o600); } catch { throw Object.assign(validationError('Another portfolio update is in progress. If its process has stopped, confirm no save is running before removing portfolio.json.lock from the data folder.'), { status: 409 }); }
  try { savePortfolio(input, by); } finally { closeSync(handle); rmSync(`${path}.lock`); }
  return portfolio();
}
const object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
export const portfolioTools = [
  { name: 'dogfood_portfolio', description: 'Read current project coverage, platforms and open findings, plus historical project links. Does not accept QA, launch agents or discard history.', inputSchema: object({}, []), run: () => portfolio() },
  { name: 'dogfood_set_active_projects', description: 'Set the operator-selected current project IDs in order. Other projects remain available in history with their complete evidence. Does not delete projects or change application source; recognized native worker contexts are refused.', inputSchema: object({ agent: { type: 'string' }, input: object({ projects: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string' } }, expectedRevision: { type: 'string' } }, ['projects']) }, ['agent', 'input']), run: value => setActiveProjects(value.input, `agent:${value.agent}`) },
];
export function portfolioRoutes(readBody) { return [['GET', '/api/portfolio', () => portfolio()], ['PUT', '/api/portfolio', async (params, request) => setActiveProjects(await readBody(request))]]; }
