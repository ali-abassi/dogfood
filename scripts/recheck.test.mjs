import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerWords, displayAnswerStatus } from '../public/js/state.mjs';

const changed = '2026-09-25T21:42:22.970Z';
const before = '2026-09-25T20:00:00.000Z';
const after = '2026-09-25T23:38:12.000Z';
const page = (changedSinceReview, lastChangedAt = changed) => ({ scan: { lastChangedAt }, progress: { changedSinceReview } });
const answer = (status, parts) => ({ status, parts });

test('a Good answer reads Recheck only when its evidence predates the visual change', () => {
  const verdict = at => ({ status: 'pass', source: 'verdict', at });
  assert.equal(displayAnswerStatus(page(true), answer('pass', [verdict(before)])), 'recheck');
  assert.equal(displayAnswerStatus(page(true), answer('pass', [verdict(after)])), 'pass');
  assert.equal(displayAnswerStatus(page(true), answer('pass', [{ status: 'pass', source: 'verdict' }])), 'recheck', 'evidence without a time cannot prove it is fresh');
  assert.equal(displayAnswerStatus(page(true), answer('pass', [verdict(after), { status: 'pass', source: 'scan', at: after }])), 'pass');
  assert.equal(displayAnswerStatus(page(true), answer('pass', [verdict(before), { status: 'pass', source: 'scan', at: after }])), 'recheck', 'one stale part taints the answer');
  assert.equal(displayAnswerStatus(page(true), answer('pass', [{ status: 'pass', source: 'scan', at: after }])), 'pass', 'measurements come from the current scan');
});

test('other answers and unchanged pages keep their state', () => {
  const verdict = { status: 'pass', source: 'verdict', at: before };
  assert.equal(displayAnswerStatus(page(true), answer('needs_work', [verdict])), 'needs_work');
  assert.equal(displayAnswerStatus(page(true), answer('partial', [verdict])), 'partial');
  assert.equal(displayAnswerStatus(page(true), answer('untested', [verdict])), 'untested');
  assert.equal(displayAnswerStatus(page(false), answer('pass', [verdict])), 'pass');
  assert.equal(displayAnswerStatus({ scan: null, progress: {} }, answer('pass', [verdict])), 'pass');
});

test('Recheck has a plain word like every other answer state', () => {
  assert.equal(answerWords.recheck, 'Recheck');
});
