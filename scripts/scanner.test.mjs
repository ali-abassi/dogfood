import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainFailure } from '../lib/scanner.mjs';

test('a page that cannot be opened is explained in plain words, with the browser code kept for agents', () => {
  assert.equal(plainFailure('Navigation failed: net::ERR_CONNECTION_REFUSED'), 'dogfood could not open this page: nothing answered at its address. Check that the app is running, then check again. (Navigation failed: net::ERR_CONNECTION_REFUSED)');
  assert.match(plainFailure('net::ERR_NAME_NOT_RESOLVED'), /^dogfood could not open this page: its address does not exist\./);
  assert.match(plainFailure('Timeout 30000ms exceeded'), /took too long to load/);
  assert.match(plainFailure('something unexpected'), /the browser could not load it.*\(something unexpected\)$/);
});
