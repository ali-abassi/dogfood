import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { dataDir } from './paths.mjs';
import { validationError } from './store.mjs';

export const attachmentLimit = 8 * 1024 * 1024;
export const commentBodyLimit = Math.ceil(attachmentLimit * 4 * 4 / 3) + 100_000;
export const attachmentTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const fail = (message, status = 400) => Object.assign(validationError(message), { status });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validId = id => typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id);

function scope(project, card) {
  if (!validId(project) || !validId(card)) throw fail('Invalid attachment scope.');
  return ['agent-attachments', project, card];
}
function name(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240) throw fail('Image name must be 1–240 characters.');
  return basename(value.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '_');
}
function attachmentObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Invalid image attachment.');
  if (Object.keys(input).some(key => !['name', 'data'].includes(key))) throw fail('Image attachments accept only name and base64 data.');
}
function payload(input) {
  attachmentObject(input);
  if (typeof input.data !== 'string' || input.data.length > Math.ceil(attachmentLimit / 3) * 4) throw fail('Each image must be no larger than 8 MiB.');
  return input.data;
}
function base64(input) {
  const encoded = payload(input);
  if (!encoded.length || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw fail('Image data must be valid base64.');
  return encoded;
}
function bytes(input) {
  const encoded = base64(input);
  const value = Buffer.from(encoded, 'base64');
  if (value.toString('base64') !== encoded) throw fail('Image data must be canonical base64.');
  if (value.length > attachmentLimit) throw fail('Each image must be no larger than 8 MiB.');
  if (value.length < 24) throw fail('Image data is incomplete.');
  return value;
}
function dimensions(width, height, extension) {
  if (![width, height].every(size => size > 0 && size <= 32768) || width * height > 100_000_000) throw fail('Image dimensions must be valid and no larger than 100 megapixels.');
  return { width, height, extension, mimeType: attachmentTypes[extension] };
}
function pngChunks(value) {
  const types = []; let offset = 8;
  while (offset + 12 <= value.length) {
    const length = value.readUInt32BE(offset);
    if (offset + length + 12 > value.length) throw fail('PNG chunk is incomplete.');
    types.push(value.toString('ascii', offset + 4, offset + 8)); offset += length + 12;
  }
  if (offset !== value.length || !types.includes('IDAT')) throw fail('PNG has no complete image data.');
}
function png(value) {
  if (value.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  if (value.readUInt32BE(8) !== 13 || value.toString('ascii', 12, 16) !== 'IHDR') throw fail('Invalid PNG header.');
  if (value.toString('hex', value.length - 12) !== '0000000049454e44ae426082') throw fail('PNG image is incomplete.');
  pngChunks(value);
  return dimensions(value.readUInt32BE(16), value.readUInt32BE(20), 'png');
}
const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function jpegFrame(value, offset) {
  const length = value.readUInt16BE(offset + 2);
  if (length < 2 || offset + 2 + length > value.length) throw fail('JPEG image is incomplete.');
  if (!frameMarkers.has(value[offset + 1])) return { next: offset + 2 + length };
  if (length < 8) throw fail('Invalid JPEG frame.');
  return { image: dimensions(value.readUInt16BE(offset + 7), value.readUInt16BE(offset + 5), 'jpg') };
}
function jpeg(value) {
  if (value.readUInt16BE(0) !== 0xffd8) return null;
  if (value.readUInt16BE(value.length - 2) !== 0xffd9) throw fail('JPEG image is incomplete.');
  return jpegDimensions(value);
}
function jpegDimensions(value) {
  let offset = 2, image;
  while (offset + 9 < value.length) {
    if (value[offset] !== 0xff) throw fail('Invalid JPEG marker.');
    const result = jpegFrame(value, offset);
    image = result.image || image;
    if (value[offset + 1] === 0xda) return jpegScan(image);
    offset += value.readUInt16BE(offset + 2) + 2;
  }
  throw fail('JPEG has no image frame.');
}
function jpegScan(image) {
  if (!image) throw fail('JPEG has no image frame before its scan.');
  return image;
}
function webpChunks(value) {
  const types = []; let offset = 12;
  while (offset + 8 <= value.length) {
    const length = value.readUInt32LE(offset + 4);
    if (offset + length + 8 > value.length) throw fail('WebP chunk is incomplete.');
    types.push(value.toString('ascii', offset, offset + 4)); offset += length + 8 + (length % 2);
  }
  if (offset !== value.length || !types.some(type => ['VP8 ', 'VP8L', 'ANMF'].includes(type))) throw fail('WebP has no complete image data.');
}
function webpFrame(value, kind) {
  if (kind === 'VP8X') return dimensions(value.readUIntLE(24, 3) + 1, value.readUIntLE(27, 3) + 1, 'webp');
  if (kind === 'VP8L') {
    if (value[20] !== 0x2f) throw fail('Invalid WebP lossless frame.');
    const bits = value.readUInt32LE(21);
    return dimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, 'webp');
  }
  if (kind === 'VP8 ') return webpLossy(value);
  throw fail('Invalid WebP image frame.');
}
function webpLossy(value) {
  if (value.toString('hex', 23, 26) !== '9d012a') throw fail('Invalid WebP image frame.');
  return dimensions(value.readUInt16LE(26) & 0x3fff, value.readUInt16LE(28) & 0x3fff, 'webp');
}
function webp(value) {
  if (value.toString('ascii', 0, 4) !== 'RIFF' || value.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (value.length < 30 || value.readUInt32LE(4) !== value.length - 8) throw fail('WebP image is incomplete.');
  webpChunks(value);
  return webpFrame(value, value.toString('ascii', 12, 16));
}
function image(value) {
  const result = png(value) || jpeg(value) || webp(value);
  if (!result) throw fail('Attach a PNG, JPEG or WebP image. SVG and other files are not supported.');
  return result;
}
export function prepareAttachments(input = []) {
  if (!Array.isArray(input) || input.length > 4) throw fail('Attach up to four images per comment.');
  return input.map(item => { const content = bytes(item); return { name: name(item.name), content, size: content.length, sha256: digest(content), ...image(content) }; });
}
function safeDirectory(project, card) {
  mkdirSync(dataDir, { recursive: true });
  let path = realpathSync(dataDir);
  for (const part of scope(project, card)) {
    path = join(path, part);
    if (!lstatSync(path, { throwIfNoEntry: false })) mkdirSync(path, { mode: 0o700 });
    if (!lstatSync(path).isDirectory()) throw fail('Image storage must be a real directory.', 409);
  }
  return path;
}
export function saveAttachments(project, card, prepared, created) {
  if (!prepared.length) return [];
  const directory = safeDirectory(project, card);
  return prepared.map(item => {
    const id = randomUUID(), file = `${id}.${item.extension}`, path = join(directory, file);
    const { content, extension, ...metadata } = item;
    writeFileSync(path, content, { flag: 'wx', mode: 0o600 }); created.push(path);
    return { id, ...metadata, path, url: `/api/projects/${project}/board/cards/${card}/attachments/${file}` };
  });
}
export function removeAttachments(paths) { for (const path of paths) rmSync(path, { force: true }); }
function storedPath(project, card, attachment, extension) {
  scope(project, card);
  if (!validId(attachment.id) || attachmentTypes[extension] !== attachment.mimeType) throw fail('Image not found.', 404);
  let directory = realpathSync(dataDir);
  for (const part of scope(project, card)) {
    directory = join(directory, part);
    if (!lstatSync(directory).isDirectory()) throw fail('Invalid image storage.', 409);
  }
  return join(directory, `${attachment.id}.${extension}`);
}
export function readAttachment(project, card, attachment, extension) {
  const path = storedPath(project, card, attachment, extension);
  const handle = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(handle);
    if (!stat.isFile() || stat.size > attachmentLimit || stat.size !== attachment.size) throw fail('Stored image size changed.', 409);
    const content = readFileSync(handle);
    if (digest(content) !== attachment.sha256) throw fail('Stored image integrity check failed.', 409);
    return content;
  } finally { closeSync(handle); }
}
