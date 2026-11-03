import { join } from 'node:path';
import { dataDir } from './paths.mjs';
import { readProject, pageById, createFinding, updateFinding, validationError } from './store.mjs';
import { createAgentCard, agentBoard, dispatchAgentBoard } from './agent-board.mjs';
function page(project, id) { return pageById(readProject(project), id); }
function annotationView(finding, current) {
  return { ...finding.annotation, findingId: finding.id, title: finding.title, comment: finding.detail, status: finding.status, by: finding.by, at: finding.at, stale: current.captures[finding.annotation.device]?.sha256 !== finding.annotation.capture.sha256 };
}
export function annotations(projectId, pageId) {
  const current = page(projectId, pageId), cards = agentBoard(projectId).cards;
  return current.findings.filter(finding => finding.annotation).map(finding => ({ ...annotationView(finding, current), request: cards.find(card => card.annotationId === finding.annotation.id) || null }));
}
export function addAnnotation(projectId, pageId, input, actor = 'person') {
  const allowed = ['device', 'x', 'y', 'captureSha256', 'title', 'comment'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw validationError('Unknown feedback field.');
  if (annotations(projectId, pageId).filter(item => item.status === 'open').length >= 40) throw validationError('This page has reached its 40-pin limit. Resolve and review existing feedback first.');
  createFinding(projectId, pageId, { title: input.title, detail: input.comment, severity: 'P2', attachCapture: false, annotation: { device: input.device, x: input.x, y: input.y, captureSha256: input.captureSha256 } }, actor);
  return annotations(projectId, pageId);
}
function selected(projectId, pageId, id) {
  const value = annotations(projectId, pageId).find(item => item.id === id);
  if (!value) throw validationError('Pinned feedback no longer exists.');
  return value;
}
export async function annotationRequest(projectId, pageId, id, input) {
  const pin = selected(projectId, pageId, id);
  if (pin.request) return { annotation: pin, card: pin.request };
  if (Object.keys(input).some(key => !['backend', 'start'].includes(key))) throw validationError('Choose an agent and whether to start.');
  const request = `Address this pinned page feedback.\nAnnotation ID: ${pin.id}\n${pin.device} at ${Math.round(pin.x * 100)}% across, ${Math.round(pin.y * 100)}% down.\nScreenshot file: ${join(dataDir, pin.capture.path.slice(1))}\nScreenshot URL path: ${pin.capture.path}\nScreenshot revision: ${pin.capture.sha256}, captured ${pin.capture.capturedAt}.\nPage URL: ${pin.capture.sourceUrl}\n${pin.comment}\nThis is feedback on a specific historical capture; inspect current source and current page before changing it. Do not resolve the finding without fresh retest evidence.`;
  const card = createAgentCard(projectId, { title: pin.title, request, backend: input.backend, pageId, annotationId: pin.id, start: input.start === true });
  if (input.start === true) await dispatchAgentBoard(projectId);
  return { annotation: pin, card: agentBoard(projectId).cards.find(item => item.id === card.id) };
}
export function resolveAnnotation(projectId, pageId, id, input, actor = 'person') {
  const pin = selected(projectId, pageId, id);
  updateFinding(projectId, pageId, pin.findingId, { status: 'resolved', note: input.note }, actor);
  return annotations(projectId, pageId);
}
export function annotationRoutes(readBody) {
  const path = '/api/projects/([a-z0-9-]+)/pages/([a-z0-9-]+)/annotations';
  return [['GET', path, ([project, page]) => annotations(project, page)], ['POST', path, async ([project, page], request) => addAnnotation(project, page, await readBody(request))], ['POST', `${path}/([a-f0-9-]+)/request`, async ([project, page, id], request) => annotationRequest(project, page, id, await readBody(request))], ['POST', `${path}/([a-f0-9-]+)/resolve`, async ([project, page, id], request) => resolveAnnotation(project, page, id, await readBody(request))]];
}
const string = { type: 'string' }, base = { project: string, page: string }, object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
export const annotationTools = [
  { name: 'dogfood_annotations', description: 'Read pinned screenshot feedback, immutable capture revision, current/stale state, QA finding and linked agent request.', inputSchema: object(base, ['project', 'page']), run: value => annotations(value.project, value.page) },
  { name: 'dogfood_add_annotation', description: 'Pin feedback to the exact current screenshot. Positions are fractions0–1. Creates an open QA finding and preserves immutable image evidence; does not start work.', inputSchema: object({ ...base, agent: string, input: object({ device: { type: 'string', enum: ['desktop', 'mobile'] }, x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 }, captureSha256: string, title: string, comment: string }, ['device', 'x', 'y', 'captureSha256', 'title', 'comment']) }, ['project', 'page', 'agent', 'input']), run: value => addAnnotation(value.project, value.page, value.input, value.agent) },
  { name: 'dogfood_annotation_request', description: 'Create a page-linked native request from pinned feedback. Saves by default; start:true requires user delegation authority. Reuses an existing linked request.', inputSchema: object({ ...base, annotation: string, backend: { type: 'string', enum: ['codex', 'claude'] }, start: { type: 'boolean' } }, ['project', 'page', 'annotation', 'backend']), run: value => annotationRequest(value.project, value.page, value.annotation, { backend: value.backend, start: value.start }) },
  { name: 'dogfood_resolve_annotation', description: 'Resolve pinned feedback with a concrete fresh retest note; does not accept the page or finish the linked request.', inputSchema: object({ ...base, annotation: string, agent: string, note: string }, ['project', 'page', 'annotation', 'agent', 'note']), run: value => resolveAnnotation(value.project, value.page, value.annotation, { note: value.note }, value.agent) },
];
