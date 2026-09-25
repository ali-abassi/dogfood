import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { latestVisualReview, runVisualReview, validateAnalysis } from '../lib/visual-review.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGxoAAAAASUVORK5CYII=', 'base64');
const analysis = {
  pagePurpose: 'A library of archived ads for browsing.',
  primaryAction: 'Search archived ads.',
  dimensions: {
    purpose: { score: 8, reason: 'The heading names the archive.' },
    nextAction: { score: 7.5, reason: 'Search is visible near the top.' },
    hierarchy: { score: 7, reason: 'The image grid dominates the page.' },
    copy: { score: 9, reason: 'Controls use specific labels.' },
  },
  evidence: [
    { location: 'top', observation: 'The heading says Inspo.' },
    { location: 'middle', observation: 'The page shows a card grid.' },
  ],
  improvements: ['Make the archive purpose more specific.'],
};

test('visual review uses the saved full-page PNG and becomes stale when it changes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-'));
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldFetch = globalThis.fetch;
  const file = join(root, 'captures', 'fixture', 'inspo.png');
  mkdirSync(join(root, 'captures', 'fixture'), { recursive: true });
  writeFileSync(file, png);
  const capture = { state: 'rendered', fullPage: true, path: '/captures/fixture/inspo.png', sourceUrl: 'https://example.com/#/inspo' };
  const page = { id: 'inspo', name: 'Inspo', captures: { desktop: capture } };
  process.env.OPENROUTER_API_KEY = 'fixture-key';
  let outbound;
  globalThis.fetch = async (_url, options) => {
    outbound = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'fixture-response', model: 'google/gemini-3.8-flash', choices: [{ message: { content: JSON.stringify(analysis) } }], usage: { prompt_tokens: 200, completion_tokens: 100, cost: 0.001 } }), { status: 200 });
  };
  try {
    const result = await runVisualReview(root, { id: 'fixture' }, page);
    assert.equal(outbound.messages[0].content[1].image_url.url, `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(result.review.analysis.clarityRating, 8);
    assert.equal(result.review.usage.reportedCostUsd, 0.001);
    assert.equal(latestVisualReview(root, 'fixture', 'inspo', capture).stale, false);
    writeFileSync(file, Buffer.concat([png, Buffer.from('changed')]));
    assert.equal(latestVisualReview(root, 'fixture', 'inspo', capture).stale, true);
    const directory = join(root, 'visual-reviews', 'fixture', 'inspo');
    assert.doesNotMatch(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'), /fixture-key/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
    rmSync(root, { recursive: true, force: true });
  }
});

test('visual review rejects unsupported numeric precision and missing evidence', () => {
  assert.throws(() => validateAnalysis({ ...analysis, dimensions: { ...analysis.dimensions, purpose: { score: 7.25, reason: 'Not a half point.' } } }), /dimensions/);
  assert.throws(() => validateAnalysis({ ...analysis, evidence: [] }), /evidence/);
});

test('provider failure keeps an attempt receipt without creating a review', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-failed-'));
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldFetch = globalThis.fetch;
  mkdirSync(join(root, 'captures', 'fixture'), { recursive: true });
  writeFileSync(join(root, 'captures', 'fixture', 'inspo.png'), png);
  process.env.OPENROUTER_API_KEY = 'fixture-key';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Provider unavailable' } }), { status: 503 });
  try {
    const capture = { state: 'rendered', fullPage: true, path: '/captures/fixture/inspo.png', sourceUrl: 'https://example.com/#/inspo' };
    await assert.rejects(runVisualReview(root, { id: 'fixture' }, { id: 'inspo', name: 'Inspo', captures: { desktop: capture } }), /Provider unavailable/);
    assert.equal(latestVisualReview(root, 'fixture', 'inspo', capture).review, null);
    const directory = join(root, 'visual-reviews', 'fixture', 'inspo', 'failed-attempts');
    const receipt = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'));
    assert.equal(receipt.response.error.message, 'Provider unavailable');
    assert.doesNotMatch(JSON.stringify(receipt), /fixture-key/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = oldKey;
    rmSync(root, { recursive: true, force: true });
  }
});
