import assert from 'node:assert/strict';
import test from 'node:test';
import { viewportFacts } from '../lib/scanner.mjs';

const page = { url: 'http://127.0.0.1:8992/nope', loadMs: 20, horizontalOverflow: false, seo: {}, accessibility: {} };
const requests = [
  { url: 'http://127.0.0.1:8992/nope', status: 404, method: 'GET', resourceType: 'document' },
  { url: 'http://127.0.0.1:8992/missing.png', status: 404, method: 'GET', resourceType: 'image' },
];

test('a page registered to answer 404 does not count its own document as a failed request', () => {
  const failed = viewportFacts(page, requests, [], [], 404).failedRequests.map(request => request.url);
  assert.deepEqual(failed, ['http://127.0.0.1:8992/missing.png']);
});

test('without an expected status, the 404 document still counts as a failure', () => {
  assert.equal(viewportFacts(page, requests, [], []).failedRequests.length, 2);
});
