import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { capturePathPattern } from './schema.mjs';

const pngSignature = '89504e470d0a1a0a';
const maximumBytes = 25_000_000;
const channels = { 2: 3, 6: 4 };
// A capture taken with the wrong device pixel ratio draws the page into the top-left
// quarter and leaves the right and bottom strips blank. A real page, even a sparse one,
// almost never leaves both strips a single colour.
const blankShare = 0.45;

export function readPng(file) {
  const bytes = readFileSync(file);
  if (bytes.length > maximumBytes) throw new Error('Capture exceeds the 25 MB limit.');
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) throw new Error('Capture is not a PNG image.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { bytes, sha256, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function readCapture(dataDir, path) {
  if (!capturePathPattern.test(path)) throw new Error('Capture path is invalid.');
  return { path, ...readPng(join(dataDir, path.slice(1))) };
}

// Returns why a capture cannot serve as page evidence, or '' when it can.
export function captureProblem(bytes) {
  const image = decodePng(bytes);
  if (typeof image === 'string') return image;
  const left = Math.floor(image.width * (1 - blankShare));
  const top = Math.floor(image.height * (1 - blankShare));
  const blank = regionIsBlank(image, left, 0) && regionIsBlank(image, 0, top);
  if (!blank) return '';
  return 'The page fills only the top-left of the screenshot; the right and bottom are blank. This usually means the wrong device pixel ratio; capture the page again.';
}

// True when every pixel right of `left` and below `top` matches the bottom-right pixel.
function regionIsBlank(image, left, top) {
  const { width, height, bpp, pixels } = image;
  const reference = pixels.subarray(pixels.length - bpp);
  for (let y = top; y < height; y += 1) {
    const row = y * width * bpp;
    for (let x = left; x < width; x += 1) {
      if (!samePixel(pixels, row + x * bpp, reference)) return false;
    }
  }
  return true;
}

function samePixel(pixels, offset, reference) {
  return reference.every((value, channel) => Math.abs(pixels[offset + channel] - value) <= 3);
}

function pngChunks(bytes) {
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    chunks.push({ type: bytes.toString('latin1', offset + 4, offset + 8), data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
  }
  return chunks;
}

// Returns the image layout, or why the PNG is outside what the validity check reads.
function pngLayout(header) {
  if (!header) return 'Capture has no PNG header.';
  const [bitDepth, colorType, , , interlace] = header.subarray(8, 13);
  const bpp = channels[colorType];
  if (bitDepth !== 8 || !bpp || interlace !== 0) return 'Capture must be a non-interlaced 8-bit RGB or RGBA PNG.';
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4), bpp };
}

function decodePng(bytes) {
  const chunks = pngChunks(bytes);
  const layout = pngLayout(chunks.find(chunk => chunk.type === 'IHDR')?.data);
  if (typeof layout === 'string') return layout;
  const data = inflateSync(Buffer.concat(chunks.filter(chunk => chunk.type === 'IDAT').map(chunk => chunk.data)));
  return { ...layout, pixels: unfilter(data, layout.width, layout.height, layout.bpp) };
}

function unfilter(data, width, height, bpp) {
  const stride = width * bpp;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = data[y * (stride + 1)];
    const source = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    unfilterRow(filter, source, pixels, y * stride, stride, bpp);
  }
  return pixels;
}

function unfilterRow(filter, source, pixels, start, stride, bpp) {
  for (let x = 0; x < stride; x += 1) {
    pixels[start + x] = (source[x] + predictor(filter, ...neighbours(pixels, start + x, stride, bpp, x >= bpp))) & 0xff;
  }
}

// PNG treats bytes before the first pixel or above the first row as zero.
function neighbours(pixels, offset, stride, bpp, hasLeft) {
  const hasUp = offset >= stride;
  return [hasLeft ? pixels[offset - bpp] : 0, hasUp ? pixels[offset - stride] : 0, hasLeft && hasUp ? pixels[offset - stride - bpp] : 0];
}

function predictor(filter, left, up, upLeft) {
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return (left + up) >> 1;
  if (filter === 4) return paeth(left, up, upLeft);
  return 0;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const [a, b, c] = [left, up, upLeft].map(value => Math.abs(estimate - value));
  if (a <= b && a <= c) return left;
  return b <= c ? up : upLeft;
}
