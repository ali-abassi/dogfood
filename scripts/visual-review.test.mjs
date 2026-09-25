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
    { location: 'desktop top', observation: 'The heading says Gallery.' },
    { location: 'mobile middle', observation: 'The page shows a card grid.' },
  ],
  improvements: ['Make the archive purpose more specific.'],
  suggestedFeatures: [
    { name: 'Search archived ads', expected: 'Typing a query filters the grid to matching ads.' },
    { name: 'Open an ad', expected: 'Selecting a card shows the full ad.' },
  ],
};

function fixtureCaptures(root) {
  mkdirSync(join(root, 'captures', 'fixture'), { recursive: true });
  writeFileSync(join(root, 'captures', 'fixture', 'gallery.png'), png);
  writeFileSync(join(root, 'captures', 'fixture', 'gallery-mobile.png'), png);
  const sourceUrl = 'https://example.com/#/gallery';
  return {
    desktop: { state: 'rendered', fullPage: true, path: '/captures/fixture/gallery.png', sourceUrl },
    mobile: { state: 'rendered', fullPage: true, path: '/captures/fixture/gallery-mobile.png', sourceUrl },
  };
}

function stubProvider(content) {
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'fixture-key';
  let outbound;
  globalThis.fetch = async (_url, options) => {
    outbound = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: 'fixture-response', model: 'google/gemini-3.8-flash', choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 200, completion_tokens: 100, cost: 0.001 } }), { status: 200 });
  };
  return { oldKey, oldFetch, outbound: () => outbound };
}

function restoreProvider({ oldKey, oldFetch }) {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = oldKey;
}

test('visual review judges both screenshots, suggests features, and becomes stale when either changes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-'));
  const captures = fixtureCaptures(root);
  const page = { id: 'gallery', name: 'Gallery', captures };
  const provider = stubProvider(analysis);
  try {
    const result = await runVisualReview(root, { id: 'fixture' }, page);
    const content = provider.outbound().messages[0].content;
    assert.equal(content.length, 5);
    assert.equal(content[1].text, 'Desktop screenshot (1440 × 900):');
    assert.equal(content[2].image_url.url, `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(content[3].text, 'Mobile screenshot (390 × 844):');
    assert.equal(content[4].image_url.url, `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(result.review.promptVersion, 'visual-clarity-v2');
    assert.equal(result.review.analysis.clarityRating, 8);
    assert.deepEqual(result.review.analysis.suggestedFeatures, analysis.suggestedFeatures);
    assert.equal(result.review.usage.reportedCostUsd, 0.001);
    assert.ok(result.review.captures.desktop.sha256);
    assert.ok(result.review.captures.mobile.sha256);
    assert.equal(result.review.capture, undefined);
    assert.equal(latestVisualReview(root, 'fixture', 'gallery', captures).stale, false);
    writeFileSync(join(root, 'captures', 'fixture', 'gallery-mobile.png'), Buffer.concat([png, Buffer.from('changed')]));
    assert.equal(latestVisualReview(root, 'fixture', 'gallery', captures).stale, true);
    writeFileSync(join(root, 'captures', 'fixture', 'gallery-mobile.png'), png);
    writeFileSync(join(root, 'captures', 'fixture', 'gallery.png'), Buffer.concat([png, Buffer.from('changed')]));
    assert.equal(latestVisualReview(root, 'fixture', 'gallery', captures).stale, true);
    const directory = join(root, 'visual-reviews', 'fixture', 'gallery');
    assert.doesNotMatch(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'), /fixture-key/);
  } finally {
    restoreProvider(provider);
    rmSync(root, { recursive: true, force: true });
  }
});

test('a blocked mobile capture sends only the desktop screenshot and records a null mobile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-mobile-blocked-'));
  const captures = fixtureCaptures(root);
  captures.mobile = { state: 'blocked', reason: 'The page needs a signed-in session on mobile.' };
  const provider = stubProvider(analysis);
  try {
    const result = await runVisualReview(root, { id: 'fixture' }, { id: 'gallery', name: 'Gallery', captures });
    assert.equal(provider.outbound().messages[0].content.length, 3);
    assert.equal(result.review.captures.mobile, null);
    assert.equal(latestVisualReview(root, 'fixture', 'gallery', captures).stale, false);
  } finally {
    restoreProvider(provider);
    rmSync(root, { recursive: true, force: true });
  }
});

test('reviews saved before mobile screenshots are ignored', () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-legacy-'));
  try {
    const captures = fixtureCaptures(root);
    const directory = join(root, 'visual-reviews', 'fixture', 'legacy');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, '2026-01-01T00-00-00.000Z-legacy.json'), JSON.stringify({ capture: { sha256: 'legacy' }, analysis }));
    assert.equal(latestVisualReview(root, 'fixture', 'legacy', captures).review, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('visual review rejects unsupported numeric precision, missing evidence, and invalid suggested features', () => {
  assert.throws(() => validateAnalysis({ ...analysis, dimensions: { ...analysis.dimensions, purpose: { score: 7.25, reason: 'Not a half point.' } } }), /dimensions/);
  assert.throws(() => validateAnalysis({ ...analysis, evidence: [] }), /evidence/);
  assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: undefined }), /suggested features/);
  assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: Array.from({ length: 9 }, (_, index) => ({ name: `Feature ${index}`, expected: 'It works.' })) }), /suggested features/);
  assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: [{ name: '', expected: 'It works.' }] }), /suggested features/);
  assert.throws(() => validateAnalysis({ ...analysis, suggestedFeatures: [{ name: 'Search', expected: 'x'.repeat(201) }] }), /suggested features/);
  assert.deepEqual(validateAnalysis({ ...analysis, suggestedFeatures: [] }).suggestedFeatures, []);
});

test('provider failure keeps an attempt receipt without creating a review', async () => {
  const root = mkdtempSync(join(tmpdir(), 'qa-visual-failed-'));
  const oldKey = process.env.OPENROUTER_API_KEY;
  const oldFetch = globalThis.fetch;
  mkdirSync(join(root, 'captures', 'fixture'), { recursive: true });
  writeFileSync(join(root, 'captures', 'fixture', 'gallery.png'), png);
  process.env.OPENROUTER_API_KEY = 'fixture-key';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Provider unavailable' } }), { status: 503 });
  try {
    const captures = { desktop: { state: 'rendered', fullPage: true, path: '/captures/fixture/gallery.png', sourceUrl: 'https://example.com/#/gallery' }, mobile: { state: 'blocked', reason: 'Not captured yet.' } };
    await assert.rejects(runVisualReview(root, { id: 'fixture' }, { id: 'gallery', name: 'Gallery', captures }), /Provider unavailable/);
    assert.equal(latestVisualReview(root, 'fixture', 'gallery', captures).review, null);
    const directory = join(root, 'visual-reviews', 'fixture', 'gallery', 'failed-attempts');
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
