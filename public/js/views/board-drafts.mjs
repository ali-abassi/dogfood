import { readJson } from '../api.mjs';
import { draftSnapshot, restoreDraftSnapshot } from './board-draft-data.mjs';
import { readStoredDraft, writeStoredDraft } from './board-draft-store.mjs';

const controllers = new WeakMap();
const pending = new Set();
function notify(controller) { controller.changed(); }
function setStatus(controller, status, error = '') { controller.status = status; controller.error = error; notify(controller); }
function controllerFor(board) { return controllers.get(board); }
function recordKey(identity, project) {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error('Could not identify this Dogfood data store.');
  return `${identity}:${project}`;
}
function applyStored(board, controller, stored) {
  controller.revision = stored?.revision || null;
  if (!stored) return;
  if (controller.generation) throw new Error('Draft restoration arrived after editing began. Copy the current draft before reloading.');
  restoreDraftSnapshot(board, stored.value);
}
async function restore(board, controller) {
  try {
    const health = await readJson('/api/health');
    controller.key = recordKey(health.dataStoreIdentity, board.key);
    applyStored(board, controller, await readStoredDraft(controller.key));
    controller.loaded = true;
    setStatus(controller, 'saved');
  } catch (error) { setStatus(controller, 'error', error.message); }
}
export function prepareBoardDrafts(board, changed) {
  if (controllers.has(board)) return;
  const controller = { status: 'loading', error: '', key: '', revision: null, loaded: false, generation: 0, saved: 0, timer: null, chain: Promise.resolve(), changed };
  controllers.set(board, controller);
  controller.ready = restore(board, controller);
}
export async function waitForBoardDrafts(board) { await controllerFor(board)?.ready; }
export function draftStorageLoading(board) { return controllerFor(board)?.status === 'loading'; }
export function draftStorageStatus(board) {
  const controller = controllerFor(board);
  if (!controller) return '';
  if (controller.status === 'loading') return 'Restoring drafts…';
  if (controller.status === 'error') return `Draft not saved. Keep this tab open. ${controller.error}`;
  return controller.status === 'saving' ? 'Saving draft…' : 'Draft saved on this device';
}
export function draftStorageError(board) { return controllerFor(board)?.status === 'error'; }
async function saveSnapshot(board, controller, generation, value) {
  if (!controller.loaded) throw new Error('Draft storage could not be restored. Copy unsent work before reloading.');
  const record = { key: controller.key, revision: crypto.randomUUID(), updatedAt: Date.now(), value };
  controller.revision = await writeStoredDraft(controller.revision, record);
  controller.saved = generation;
  if (controller.generation === generation) { pending.delete(board); setStatus(controller, 'saved'); }
}
export function flushBoardDrafts(board) {
  const controller = controllerFor(board);
  if (!controller) return Promise.resolve(false);
  clearTimeout(controller.timer);
  let value;
  try { value = draftSnapshot(board); }
  catch (error) { setStatus(controller, 'error', error.message); return Promise.resolve(false); }
  const generation = controller.generation;
  controller.chain = controller.chain.then(() => saveSnapshot(board, controller, generation, value)).then(() => true, error => { setStatus(controller, 'error', error.message); return false; });
  return controller.chain;
}
export function saveBoardDrafts(board) {
  const controller = controllerFor(board);
  if (!controller) return;
  pending.add(board);
  controller.generation += 1;
  setStatus(controller, 'saving');
  clearTimeout(controller.timer);
  controller.timer = setTimeout(() => void flushBoardDrafts(board), 150);
}
export function pendingDraftWrite() { return pending.size > 0; }
export function protectPendingDraft(event) {
  if (!pendingDraftWrite()) return;
  event.preventDefault(); event.returnValue = '';
  pending.forEach(board => void flushBoardDrafts(board));
}
