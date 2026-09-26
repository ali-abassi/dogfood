import { crc32, deflateSync } from 'node:zlib';
import { decodePng } from './capture.mjs';

// A page counts as visually changed when its size changed or more than this share of
// pixels differ; below it, clocks, counters, and anti-aliasing would flag every rescan.
export const changeThreshold = 0.005;
const tolerance = 8;

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * image.bpp;
  return image.pixels.subarray(offset, offset + 3);
}

function differs(a, b) {
  return Math.abs(a[0] - b[0]) > tolerance || Math.abs(a[1] - b[1]) > tolerance || Math.abs(a[2] - b[2]) > tolerance;
}

function faded(value) {
  return 255 - Math.round((255 - value) * 0.25);
}

// Paints one pixel of the diff image: changed pixels red, everything else a faded copy of the current page.
function paintPixel(diff, offset, pixel, changed) {
  diff.set(changed ? [230, 30, 40] : [faded(pixel[0]), faded(pixel[1]), faded(pixel[2])], offset);
}

function inside(image, x, y) {
  return x < image.width && y < image.height;
}

// A pixel only one screenshot has is a change; the base is the current page where it exists.
function comparedPixel(previous, current, x, y) {
  const both = inside(previous, x, y) && inside(current, x, y);
  const base = inside(current, x, y) ? pixelAt(current, x, y) : pixelAt(previous, x, y);
  return { changed: !both || differs(pixelAt(previous, x, y), pixelAt(current, x, y)), base };
}

function decodedPair(previousBytes, currentBytes) {
  const pair = [decodePng(previousBytes), decodePng(currentBytes)];
  if (pair.some(image => typeof image === 'string')) throw new Error('Screenshots must be 8-bit RGB or RGBA PNGs to compare.');
  return pair;
}

// Paints the diff image over the larger of the two screenshots, so nothing either one shows is cut
// off, and counts changed pixels in the same pass.
function paintDifference(previous, current, width, height) {
  const diff = Buffer.alloc(width * height * 3);
  let changedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const { changed, base } = comparedPixel(previous, current, x, y);
      changedPixels += Number(changed);
      paintPixel(diff, (y * width + x) * 3, base, changed);
    }
  }
  return { diff, changedPixels };
}

// Compares two screenshots of the same page and draws where the current one differs.
export function imageDifference(previousBytes, currentBytes) {
  const [previous, current] = decodedPair(previousBytes, currentBytes);
  const width = Math.max(previous.width, current.width);
  const height = Math.max(previous.height, current.height);
  const { diff, changedPixels } = paintDifference(previous, current, width, height);
  const sizeChanged = previous.width !== current.width || previous.height !== current.height;
  const changedShare = changedPixels / (width * height);
  return { sizeChanged, changedShare, changed: sizeChanged || changedShare > changeThreshold, png: encodePng(width, height, diff) };
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])));
  return Buffer.concat([length, Buffer.from(type), body, checksum]);
}

// Minimal 8-bit RGB PNG writer: every row uses filter 0, and zlib does the compression.
export function encodePng(width, height, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) rgb.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
