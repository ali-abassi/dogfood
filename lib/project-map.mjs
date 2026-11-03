import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { readProject, projectView } from './store.mjs';
import { root } from './paths.mjs';
import { workflow } from './tasks.mjs';
import { agentBoard } from './agent-board.mjs';
import { checkoutRevision } from './revision.mjs';
import { projectReadiness } from './project-readiness.mjs';

const maximumGraphBytes = 5_000_000;
function unsafePart(part) { return ['..', '.git'].includes(part) || part.startsWith('.env'); }
function safeRelative(value) {
  if (typeof value !== 'string' || value.length > 400) return false;
  return !value.startsWith('/') && !value.split(/[\\/]/).some(part => unsafePart(part));
}
function graphFile(project) {
  if (!project.source.checkout) return null;
  const directory = realpathSync(resolve(root, project.source.checkout));
  const file = join(directory, 'graphify-out', 'graph.json'), stat = lstatSync(file);
  if (!stat.isFile() || stat.size > maximumGraphBytes) throw new Error('Graphify file exceeds the safe import limit or is not a regular file.');
  if (!realpathSync(file).startsWith(`${directory}${sep}`)) throw new Error('Graphify file must remain inside the project checkout.');
  return { file, directory };
}
function graphState(graph, directory) {
  const revision = checkoutRevision(directory);
  if (!graph.built_at_commit) return 'unknown';
  return graph.built_at_commit === revision.revision && revision.dirty === false ? 'current' : 'stale';
}
function validateGraph(graph) {
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 5000) throw new Error('Graphify import accepts at most 5,000 nodes.');
}
function graphImport(project) {
  try {
    const found = graphFile(project);
    if (!found) return { status: 'absent', message: 'Connect the checkout to read a saved Graphify graph.', files: [] };
    const graph = JSON.parse(readFileSync(found.file, 'utf8'));
    validateGraph(graph);
    return graphMetadata(graph, found.directory);
  } catch (error) { return { status: error.code === 'ENOENT' ? 'absent' : 'unavailable', message: error.message, files: [] }; }
}
function graphMetadata(graph, directory) {
  const status = graphState(graph, directory);
  const files = [...new Set(graph.nodes.map(node => node.source_file).filter(safeRelative))];
  const message = status === 'current' ? 'Saved Graphify graph matches the clean checkout revision.' : 'Saved Graphify graph is stale or has no revision. Code references are historical, not current proof.';
  return { status, message, builtAtCommit: graph.built_at_commit || null, nodeCount: graph.nodes.length, files };
}
function scopeMatches(file, scope) { return scope.some(area => file === area || file.startsWith(`${area.replace(/\/$/, '')}/`)); }
function codeFor(tasks, graph) {
  const scope = tasks.flatMap(task => task.scope).filter(safeRelative);
  return graph.files.filter(file => scopeMatches(file, scope)).slice(0, 12).map(file => ({ file, relation: 'Linked task scope', graphStatus: graph.status }));
}
function featureMap(planned, registered) {
  const ids = [...new Set([...(planned?.features || []).map(feature => feature.id), ...(registered?.features || []).map(feature => feature.id)])];
  return ids.map(id => mergeFeature(id, planned, registered));
}
function expectedChanged(definition, tested) {
  if (!definition || !tested) return false;
  return definition.expected !== tested.expected;
}
function featureStatus(tested, changed) {
  if (changed) return 'scope_changed';
  return tested?.status || 'planned';
}
function testedExpected(tested) { return tested?.expected || null; }
function mergeFeature(id, planned, registered) {
  const definition = planned?.features.find(feature => feature.id === id);
  const tested = registered?.features.find(feature => feature.id === id);
  const changed = expectedChanged(definition, tested);
  return { ...tested, ...definition, id, status: featureStatus(tested, changed), expectationChanged: changed, registeredExpected: testedExpected(tested) };
}
function pageStatus(registered) {
  if (!registered) return 'planned';
  return registered.progress.accepted ? 'accepted' : registered.progress.status;
}
function requestsFor(id, tasks, cards) {
  const ids = new Set(tasks.map(task => task.id));
  return cards.filter(card => card.pageId === id || ids.has(card.taskId)).map(requestSummary);
}
function requestSummary(card) { return { id: card.id, title: card.title, status: card.status, taskId: card.taskId, pageId: card.pageId }; }
function mapPage(id, planned, project, tasks, cards, graph) {
  const definition = planned.find(page => page.id === id), registered = project.pages.find(page => page.id === id);
  const linked = tasks.filter(task => task.pageIds.includes(id));
  const features = featureMap(definition, registered);
  return pageResult(id, definition, registered, features, linked, cards, graph);
}
function pageIdentity(definition, registered) { return { name: registered?.name || definition.name, route: registered?.route || definition.route }; }
function mappedStatus(registered, changed) { return changed ? 'scope_changed' : pageStatus(registered); }
function pageResult(id, definition, registered, features, linked, cards, graph) {
  const changed = features.some(feature => feature.expectationChanged);
  const proof = evidence(registered);
  return { id, ...pageIdentity(definition, registered), registered: Boolean(registered), status: mappedStatus(registered, changed), features, tasks: linked.map(taskSummary), requests: requestsFor(id, linked, cards), code: codeFor(linked, graph), evidence: { ...proof, accepted: proof.accepted && !changed, scopeChanged: changed } };
}
function taskSummary(task) { return { id: task.id, title: task.title, status: task.status, outcome: task.outcome, scope: task.scope, receipt: task.receipt ? { passed: task.receipt.passed, current: task.receipt.current, verifiedAt: task.receipt.verifiedAt } : null }; }
function evidence(page) {
  if (!page) return { accepted: false, captures: [], scannedAt: null };
  const captures = Object.entries(page.captures).filter(([, capture]) => capture.state === 'rendered').map(([device, capture]) => ({ device, path: capture.path, capturedAt: capture.capturedAt }));
  return { accepted: page.progress.accepted, captures, scannedAt: page.scan?.scannedAt || null, openFindings: page.findings.filter(item => item.status === 'open').length };
}
export function projectMap(projectId) {
  const project = projectView(readProject(projectId)), brief = projectReadiness(projectId);
  const tasks = workflow(projectId).tasks, cards = agentBoard(projectId).cards, graph = graphImport(project);
  const ids = [...new Set([...brief.pages.map(page => page.id), ...project.pages.map(page => page.id)])];
  const pages = ids.map(id => mapPage(id, brief.pages, project, tasks, cards, graph));
  return { projectId, readiness: { stage: brief.stage, ready: brief.ready, label: brief.label }, pages, unlinkedTasks: tasks.filter(task => !task.pageIds.length).map(taskSummary), unlinkedRequests: cards.filter(card => !card.pageId && !card.taskId).map(requestSummary), graphify: { ...graph, files: undefined }, totals: { pages: pages.length, features: pages.reduce((sum, page) => sum + page.features.length, 0), tasks: tasks.length, requests: cards.length, acceptedPages: pages.filter(page => page.evidence.accepted).length } };
}
export function projectMapRoutes() { return [['GET', '/api/projects/([a-z0-9-]+)/map', ([id]) => projectMap(id)]]; }
export const projectMapTools = [{ name: 'dogfood_project_map', description: 'Read the actual page → feature → task → request → evidence map, including bounded explicitly scoped Graphify file references and stale graph warnings.', inputSchema: { type: 'object', properties: { project: { type: 'string' } }, required: ['project'], additionalProperties: false }, run: input => projectMap(input.project) }];
