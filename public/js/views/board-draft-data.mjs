import { clearImages } from './board-images.mjs';
const requestFields = ['title', 'request', 'backend', 'intent', 'pageId', 'featureId', 'taskId', 'doneWhen', 'constraints'];
const maxBytes = 64 * 1024 * 1024;
function requestDraft(value) { return value ? Object.fromEntries(requestFields.filter(key => value[key] !== undefined).map(key => [key, String(value[key] || '')])) : null; }
function storedImage(image) { return { id: image.id, file: image.file }; }
export function draftSnapshot(board) {
  const images = Object.fromEntries(Object.entries(board.images).filter(([, values]) => values.length).map(([id, values]) => [id, values.map(storedImage)]));
  const replies = Object.fromEntries(Object.entries(board.replies).filter(([id, text]) => text.trim() || images[id]));
  const snapshot = { version: 1, draft: requestDraft(board.draft), replies, images, note: { ...board.note }, commentAttempts: { ...board.commentAttempts }, formOpen: board.formOpen, selected: board.selected };
  validateDraftSnapshot(snapshot);
  return snapshot;
}
export function validateDraftSnapshot(value) {
  if (value?.version !== 1) throw new Error('This saved draft format is unavailable.');
  const images = Object.values(value.images).flat();
  validateDraftCount(value);
  validateDraftSize(value, images);
}
function validateDraftCount(value) {
  if (Object.keys(value.replies).length > 50 || Object.keys(value.images).length > 50) throw new Error('Keep up to 50 unsent request replies on this device. Send or discard an older draft first.');
}
function validateDraftSize(value, images) {
  if (images.reduce((total, image) => total + image.file.size, 0) > maxBytes) throw new Error('Unsent images exceed 64 MB for this project. Send or discard an older image draft first.');
  if (JSON.stringify({ ...value, images: {} }).length > 1_000_000) throw new Error('Saved draft text exceeds this project’s 1 MB limit.');
}
function restoredImage(image) { return { ...image, preview: URL.createObjectURL(image.file) }; }
export function restoreDraftSnapshot(board, value) {
  validateDraftSnapshot(value);
  clearImages(board);
  Object.assign(board, { draft: value.draft, replies: value.replies, note: value.note, commentAttempts: value.commentAttempts, images: Object.fromEntries(Object.entries(value.images).map(([id, images]) => [id, images.map(restoredImage)])) });
  restoreDraftLocation(board, value);
}
function restoreDraftLocation(board, value) {
  if (board.selected) return;
  if (value.formOpen && value.draft) { board.formOpen = true; return; }
  if (value.selected) { board.selected = value.selected; board.section = 'requests'; }
}
