import { escapeHtml } from '../format.mjs';

const maxBytes = 8 * 1024 * 1024;
const types = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function draftImages(board, card) { return board.images?.[card] || []; }
export function hasImageDrafts(board) { return Object.values(board.images || {}).some(images => images.length > 0); }
export function firstImageDraft(board) { return Object.keys(board.images || {}).find(id => board.images[id].length) || ''; }
function release(images) { images.forEach(image => URL.revokeObjectURL(image.preview)); }
export function clearImages(board, card) {
  if (card) { release(draftImages(board, card)); delete board.images[card]; return; }
  Object.values(board.images || {}).forEach(release); board.images = {};
}
function validateFiles(files, count) {
  if (files.length + count > 4) throw new Error('Attach up to 4 images per comment.');
  if (files.some(file => !types.has(file.type))) throw new Error('Choose PNG, JPEG or WebP images.');
  if (files.some(file => !file.size || file.size > maxBytes)) throw new Error('Each image must be between 1 byte and 8 MB.');
}
export function addImages(board, card, files) {
  const images = draftImages(board, card);
  validateFiles(files, images.length);
  board.images ??= {};
  board.images[card] = [...images, ...files.map(file => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))];
}
export function removeImage(board, card, id) {
  const images = draftImages(board, card);
  release(images.filter(image => image.id === id));
  board.images[card] = images.filter(image => image.id !== id);
}
function draftMarkup(image, disabled) {
  const name = escapeHtml(image.file.name);
  return `<li class="board-image-draft"><img src="${escapeHtml(image.preview)}" alt="Preview of ${name}"><span title="${name}">${name}</span><button type="button" class="text-button" data-board-action="remove-image" data-image-id="${image.id}" aria-label="Remove ${name}" ${disabled ? 'disabled' : ''}>Remove</button></li>`;
}
export function attachmentComposer(images, disabled, previewsOnly = false) {
  const previews = images.length ? `<ul class="board-image-previews" aria-label="Images to attach">${images.map(image => draftMarkup(image, disabled)).join('')}</ul>` : '';
  if (previewsOnly) return previews;
  const disabledAttribute = disabled ? 'disabled' : '';
  return `<div class="board-image-composer"><div id="board-image-drafts" aria-live="polite">${previews}</div><input id="board-image-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden ${disabledAttribute}><button type="button" class="text-button board-attach-button" data-board-action="attach-images" ${disabledAttribute}>Attach images</button><span class="field-hint">or paste a screenshot · 4 images, 8 MB each</span></div>`;
}
function safeImage(image) {
  return types.has(image.mimeType) && /^\/api\/projects\/[a-z0-9-]+\/board\/cards\/[a-z0-9-]+\/attachments\/[a-z0-9-]+\.(png|jpg|webp)$/.test(image.url);
}
function attachedMarkup(image) {
  return `<li><a class="board-attached-image" href="${escapeHtml(image.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(image.name)} full size"><img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name)}" loading="lazy"><span>${escapeHtml(image.name)} <span aria-hidden="true">↗</span></span></a></li>`;
}
export function attachmentGallery(images = []) {
  const valid = images.filter(safeImage);
  return valid.length ? `<ul class="board-comment-images" aria-label="Comment images">${valid.map(attachedMarkup).join('')}</ul>` : '';
}
function readImage(image) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: image.file.name, data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error(`Could not read ${image.file.name}. Remove it and choose the image again.`));
    reader.readAsDataURL(image.file);
  });
}
export function imagePayload(images) { return Promise.all(images.map(readImage)); }
export function clipboardImages(clipboard) { return [...(clipboard?.files || [])].filter(file => file.type.startsWith('image/')); }

// A failed response may follow a successful write. Retry that same draft only once.
export function commentIdentity(board, card, input, images) {
  board.commentAttempts ??= {};
  const signature = JSON.stringify([input.text, input.send, images.map(image => image.id)]);
  if (board.commentAttempts[card]?.signature !== signature) board.commentAttempts[card] = { signature, id: crypto.randomUUID() };
  return board.commentAttempts[card].id;
}
