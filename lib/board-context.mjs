import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dataDir } from './paths.mjs';
import { requestSummary } from './agent-results.mjs';

const directory = join(dataDir, 'agent-board');
function document(projectId) {
  const file = join(directory, `${projectId}.json`);
  if (!existsSync(file)) return { cards: [] };
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (value.projectId !== projectId || !Array.isArray(value.cards)) throw new Error('Unsupported agent board format.');
  return value;
}
function compact(card) {
  return { id: card.id, title: card.title, status: card.status, backend: card.backend, intent: card.intent || 'build', pageId: card.pageId, taskId: card.taskId, summary: requestSummary(card), queued: Boolean(card.queued), pendingCount: card.pending?.length || 0, updatedAt: card.updatedAt, url: `/?project=${encodeURIComponent(card.projectId)}&view=board&card=${encodeURIComponent(card.id)}` };
}

export function requestContext(projectId) {
  const cards = document(projectId).cards.filter(card => card.status !== 'done').map(card => compact({ ...card, projectId }));
  const summary = Object.fromEntries(['todo', 'running', 'attention', 'review'].map(status => [status, cards.filter(card => card.status === status).length]));
  return { cards, summary };
}
export function requestNextAction(requests) {
  const card = requests.cards.find(card => card.status === 'attention') || requests.cards.find(card => card.status === 'review');
  if (!card) return null;
  return { kind: card.status === 'attention' ? 'answer_request' : 'review_request', id: card.id, title: card.title, summary: card.summary, url: card.url };
}

function within(checkout, path) {
  try { const part = relative(realpathSync(checkout), path); return part === '' || (!part.startsWith('..') && !part.startsWith('/')); } catch { return false; }
}
export function requestProjectFromCheckout(path) {
  if (!existsSync(directory)) return null;
  for (const file of readdirSync(directory).filter(name => /^[a-z0-9-]+\.json$/.test(name))) {
    const projectId = file.slice(0, -5);
    if (mappedCheckout(projectId, path)) return projectId;
  }
  return null;
}
function mappedCheckout(projectId, path) {
  try { return document(projectId).cards.some(card => card.checkout && within(card.checkout, path)); }
  catch { return false; }
}
