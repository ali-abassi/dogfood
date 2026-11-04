import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';

const data = mkdtempSync(join(tmpdir(), 'dogfood-attachments-'));
process.env.DOGFOOD_DATA = data;
const store = await import('../lib/store.mjs');
const board = await import('../lib/agent-board.mjs');
const images = await import('../lib/agent-attachments.mjs');
const originalCwd = process.cwd();
store.createProject({ id: 'images', name: 'Image review', url: 'http://127.0.0.1:4321' });
store.createProject({ id: 'other', name: 'Other project', url: 'http://127.0.0.1:4321' });
const make = project => board.createAgentCard(project, { title: 'Review image', request: 'Review screenshot.', backend: 'codex' });
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const attachment = name => ({ name, data: pixel });
const saved = id => board.agentBoard('images').cards.find(card => card.id === id);
after(() => { process.chdir(originalCwd); rmSync(data, { recursive: true, force: true }); });

test('image-only comments persist immutable scoped receipts and return exact verified bytes', () => {
  const card = make('images');
  const result = board.commentAgentCard('images', card.id, { send: false, attachments: [attachment('../../<screen>.png')] });
  const entry = result.comments.at(-1), image = entry.attachments[0];
  assert.equal(entry.text, ''); assert.equal(entry.by, 'person'); assert.equal(result.queued, false);
  assert.equal(image.name, '<screen>.png'); assert.equal(image.mimeType, 'image/png');
  assert.equal(image.width, 1); assert.equal(image.height, 1); assert.equal(image.size, Buffer.from(pixel, 'base64').length);
  assert.match(image.sha256, /^[a-f0-9]{64}$/);
  assert.equal(board.agentCardAttachment('images', card.id, image.id, 'png').toString('base64'), pixel);
  assert.equal(saved(card.id).comments.at(-1).attachments[0].path, image.path);
  assert.throws(() => board.agentCardAttachment('other', card.id, image.id, 'png'), /does not exist/);
  assert.throws(() => board.agentCardAttachment('images', make('images').id, image.id, 'png'), /not found/);
  assert.throws(() => board.agentCardAttachment('images', card.id, image.id, 'jpg'), /not found/);
});

test('comment retry keys save exactly one set of images and reject changed content', () => {
  const card = make('images'), input = { text: 'Look here', send: false, clientRequestId: randomUUID(), attachments: [attachment('screen.png')] };
  const first = board.commentAgentCard('images', card.id, input), second = board.commentAgentCard('images', card.id, input);
  assert.deepEqual(second.comments, first.comments);
  assert.equal(readdirSync(join(data, 'agent-attachments', 'images', card.id)).length, 1);
  assert.throws(() => board.commentAgentCard('images', card.id, { ...input, text: 'Different' }), /different content/);
  assert.throws(() => board.commentAgentCard('images', card.id, { ...input, clientRequestId: 'bad' }), /UUID/);
});

test('untrusted paths, malformed images, oversized bytes and excessive image counts never add comments', () => {
  const card = make('images');
  const rejected = [
    [{ name: 'file.png', path: '/etc/passwd', data: pixel }],
    [{ name: 'file.svg', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64') }],
    [{ name: 'file.png', data: 'data:image/png;base64,' + pixel }],
    [{ name: 'file.png', data: Buffer.alloc(images.attachmentLimit + 1).toString('base64') }],
    Array.from({ length: 5 }, () => attachment('screen.png')),
    [{ name: 'empty.png', data: '' }],
  ];
  for (const attachments of rejected) assert.throws(() => board.commentAgentCard('images', card.id, { text: 'bad', send: false, attachments }));
  assert.equal(saved(card.id).comments.length, 0);
  assert.equal(existsSync(join(data, 'agent-attachments', 'images', card.id)), false);
});

test('stored bytes and path symlinks are checked before serving', () => {
  const card = make('images');
  const result = board.commentAgentCard('images', card.id, { send: false, attachments: [attachment('screen.png')] });
  const image = result.comments[0].attachments[0];
  writeFileSync(image.path, Buffer.alloc(image.size));
  assert.throws(() => board.agentCardAttachment('images', card.id, image.id, 'png'), /integrity/);
  rmSync(image.path); const external = join(data, 'external.png'); writeFileSync(external, Buffer.from(pixel, 'base64')); symlinkSync(external, image.path);
  assert.throws(() => board.agentCardAttachment('images', card.id, image.id, 'png'));
});

test('a symlinked storage directory is refused without writing external files or comments', () => {
  const card = make('images'), external = join(data, 'external'); mkdirSync(external);
  symlinkSync(external, join(data, 'agent-attachments', 'images', card.id));
  assert.throws(() => board.commentAgentCard('images', card.id, { send: false, attachments: [attachment('screen.png')] }), /real directory/);
  assert.deepEqual(readdirSync(external), []); assert.equal(saved(card.id).comments.length, 0);
});

test('CLI attaches local screenshots without sending or starting an agent', () => {
  const card = make('images'), path = join(data, 'cli.png'); writeFileSync(path, Buffer.from(pixel, 'base64'));
  const result = JSON.parse(execFileSync(process.execPath, ['bin/dogfood.mjs', 'board', 'comment', card.id, '--project', 'images', '--attach', path, '--note', '--json'], { cwd: originalCwd, encoding: 'utf8' }));
  assert.equal(result.queued, false); assert.equal(result.comments[0].attachments[0].name, 'cli.png');
  assert.equal(result.comments[0].text, '');
});

function nativeCard() {
  const card = make('images'), checkout = join(data, 'native-checkout'); mkdirSync(checkout);
  const file = join(data, 'agent-board', 'images.json'), document = JSON.parse(readFileSync(file, 'utf8'));
  Object.assign(document.cards.find(item => item.id === card.id), { checkout, lastLaunchedTurn: 2 }); writeFileSync(file, JSON.stringify(document));
  return { card, checkout };
}
test('native agents attach evidence only on their own request and cannot recursively send', () => {
  const { card, checkout } = nativeCard(), other = make('images');
  process.chdir(checkout); process.env.DOGFOOD_NATIVE_REQUEST = '1'; process.env.DOGFOOD_PROJECT = 'images'; process.env.DOGFOOD_REQUEST_ID = card.id;
  try {
    const input = { text: 'Verified screenshot', send: false, attachments: [attachment('proof.png')] };
    const result = board.commentAgentCard('images', card.id, input);
    assert.equal(result.comments[0].by, 'agent'); assert.equal(result.comments[0].turn, 2);
    const proof = join(checkout, 'proof.png'); writeFileSync(proof, Buffer.from(pixel, 'base64'));
    const cli = JSON.parse(execFileSync(process.execPath, [resolve(originalCwd, 'bin/dogfood.mjs'), 'board', 'comment', card.id, '--project', 'images', '--attach', proof, '--note', '--json'], { cwd: checkout, encoding: 'utf8' }));
    assert.equal(cli.comments.at(-1).by, 'agent'); assert.equal(cli.comments.at(-1).attachments[0].name, 'proof.png');
    assert.throws(() => board.commentAgentCard('images', other.id, input), /own request/);
    assert.throws(() => board.commentAgentCard('images', card.id, { ...input, send: true }), /cannot send/);
    assert.throws(() => board.commentAgentCard('other', make('other').id, input), /own project/);
  } finally { process.chdir(originalCwd); delete process.env.DOGFOOD_NATIVE_REQUEST; delete process.env.DOGFOOD_PROJECT; delete process.env.DOGFOOD_REQUEST_ID; }
});

// Tiny raster fixtures generated once from a solid 2x3 image; no image library required at runtime.
const rasterFixtures = {"JPEG": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDs6KKK6zzD/9k=", "WEBP": "UklGRjIAAABXRUJQVlA4ICYAAABwAQCdASoCAAMAAUAmJYgCdAFAAAD+8SksCStWbp+6PrL76fuAAA=="};
test('JPEG and WebP bytes determine MIME and dimensions regardless of filename', () => {
  for (const [format, data] of Object.entries(rasterFixtures)) {
    const value = images.prepareAttachments([{ name: 'misleading.png', data }])[0];
    assert.equal(value.mimeType, format === 'JPEG' ? 'image/jpeg' : 'image/webp');
    assert.equal(value.width, 2); assert.equal(value.height, 3);
  }
});
test('PNG dimensions and chunk bounds are validated and 8 MiB decoding remains bounded', () => {
  const source = Buffer.from(pixel, 'base64');
  const huge = Buffer.from(source); huge.writeUInt32BE(0xffffffff, 16);
  assert.throws(() => images.prepareAttachments([{ name: 'large.png', data: huge.toString('base64') }]), /dimensions/);
  const broken = Buffer.from(source); broken.writeUInt32BE(0xffffff, 33);
  assert.throws(() => images.prepareAttachments([{ name: 'broken.png', data: broken.toString('base64') }]), /chunk/);
  assert.throws(() => images.prepareAttachments([{ name: 'large.png', data: Buffer.alloc(images.attachmentLimit).toString('base64') }]), /Attach a PNG/);
});

test('HTTP comment and image routes keep large bodies limited to comments and return exact MIME bytes', async () => {
  const card = make('images'); let receivedLimit;
  const routes = board.agentBoardRoutes(async (_request, limit) => { receivedLimit = limit; return { send: false, attachments: [attachment('http.png')] }; });
  const commentUrl = `/api/projects/images/board/cards/${card.id}/comment`;
  const commentRoute = routes.find(([method, pattern]) => method === 'POST' && new RegExp(`^${pattern}$`).test(commentUrl));
  const value = await commentRoute[2](['images', card.id], {});
  assert.equal(receivedLimit, images.commentBodyLimit);
  const receipt = value.comments[0].attachments[0];
  const route = routes.find(([method, pattern]) => method === 'GET' && new RegExp(`^${pattern}$`).test(receipt.url));
  assert.ok(route); assert.equal(route[4], 'image/png');
  assert.equal(route[2](['images', card.id, receipt.id]).toString('base64'), pixel);
});
