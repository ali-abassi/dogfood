import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSnapshot, restoreDraftSnapshot, validateDraftSnapshot } from '../public/js/views/board-draft-data.mjs';
import { addImages, clearImages, commentIdentity, releaseImagePreviews } from '../public/js/views/board-images.mjs';

function board() { return { draft: null, replies: {}, images: {}, note: {}, commentAttempts: {}, formOpen: false, selected: '' }; }
function image() { return new File(['pixel'], 'screen.png', { type: 'image/png' }); }

test('draft snapshots preserve File blobs, notes and retry identities without object URLs', () => {
  const source = board();
  source.replies.card = 'Review this screen'; source.note.card = true;
  addImages(source, 'card', [image()]);
  const attempt = commentIdentity(source, 'card', { text: source.replies.card, send: false }, source.images.card);
  const snapshot = draftSnapshot(source);
  assert.equal(snapshot.images.card[0].file.name, 'screen.png');
  assert.equal(snapshot.images.card[0].preview, undefined);
  assert.equal(snapshot.commentAttempts.card.id, attempt);
  source.note.card = false;
  assert.equal(snapshot.note.card, true);
  clearImages(source);
});

test('a seeded request keeps absent fields absent so UI defaults still apply', () => {
  const source = board(); source.draft = { pageId: 'home' }; source.formOpen = true;
  assert.deepEqual(draftSnapshot(source).draft, { pageId: 'home' });
});

test('restoration recreates usable image previews and keeps the current URL selection', async () => {
  const source = board(); source.selected = 'old'; source.replies.old = 'Saved text'; source.note.old = true;
  addImages(source, 'old', [image()]);
  const restored = board(); restored.selected = 'current';
  restoreDraftSnapshot(restored, draftSnapshot(source));
  assert.equal(restored.selected, 'current');
  assert.equal(restored.replies.old, 'Saved text');
  assert.equal(restored.note.old, true);
  assert.notEqual(restored.images.old[0].preview, source.images.old[0].preview);
  assert.equal(await (await fetch(restored.images.old[0].preview)).text(), 'pixel');
  clearImages(source); clearImages(restored);
});

test('released previews cannot be fetched but files remain available to a pending save', async () => {
  const source = board(); addImages(source, 'card', [image()]);
  const preview = source.images.card[0].preview;
  releaseImagePreviews(source);
  await assert.rejects(fetch(preview));
  assert.equal(await source.images.card[0].file.text(), 'pixel');
});

test('new request location restores only when no URL selection overrides it', () => {
  const source = board(); source.draft = { title: 'New feature' }; source.formOpen = true;
  const restored = board(); restoreDraftSnapshot(restored, draftSnapshot(source));
  assert.equal(restored.formOpen, true);
  assert.equal(restored.draft.title, 'New feature');
});

test('draft bounds reject excess text, replies and aggregate image bytes', () => {
  const value = draftSnapshot(board());
  assert.throws(() => validateDraftSnapshot({ ...value, replies: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [i, 'draft'])) }), /50 unsent/);
  assert.throws(() => validateDraftSnapshot({ ...value, draft: { request: 'x'.repeat(1_000_001) } }), /1 MB/);
  assert.throws(() => validateDraftSnapshot({ ...value, images: { card: [{ file: { size: 65 * 1024 * 1024 } }] } }), /64 MB/);
});
