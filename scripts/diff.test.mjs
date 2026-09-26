import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePng } from '../lib/capture.mjs';
import { encodePng, imageDifference } from '../lib/diff.mjs';

const plain = (width, height) => encodePng(width, height, Buffer.alloc(width * height * 3, 255));

test('the difference covers both screenshots when their widths differ, so nothing is cut off', () => {
  const result = imageDifference(plain(12, 4), plain(8, 4));
  const drawn = decodePng(result.png);
  assert.deepEqual([drawn.width, drawn.height], [12, 4]);
  assert.equal(result.sizeChanged, true);
  assert.equal(result.changedShare, 16 / 48, 'the four columns only the wider screenshot has are the change');
});
