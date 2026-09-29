import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerWords, displayAnswerStatus } from '../public/js/state.mjs';

test('the UI displays backend freshness without inventing a second gate', () => {
  for (const status of ['pass', 'needs_work', 'partial', 'untested', 'blocked', 'recheck']) {
    assert.equal(displayAnswerStatus({ progress: { changedSinceReview: true } }, { status }), status);
  }
});

test('Recheck has a plain word like every other answer state', () => {
  assert.equal(answerWords.recheck, 'Recheck');
});
