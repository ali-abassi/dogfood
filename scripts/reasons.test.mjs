import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortReason } from '../public/js/format.mjs';

test('a leading rule enumeration is dropped, keeping the observation', () => {
  assert.equal(
    shortReason('DESIGN rules 1, 2, 3 and 11: recent tiles retain distinct normal photos, readable titles and a visible next step; evidence/FIXES12/dashboard-1280.png and dashboard-390.png.'),
    'recent tiles retain distinct normal photos, readable titles and a visible next step.',
  );
});

test('evidence paths and file names disappear without leaving holes', () => {
  assert.equal(
    shortReason('Schedule next step and Recent work show what to do and what was made; evidence/FIXES12/dashboard-1280.png.'),
    'Schedule next step and Recent work show what to do and what was made.',
  );
  assert.equal(
    shortReason('Current local signed-in page scan: /home/user/dogfood/data/captures/shop/home.png.'),
    'Current local signed-in page scan.',
  );
  assert.equal(
    shortReason('The notice wording changed (web/src/pages/StrategyStates.tsx UpgradeLine, rendered via AnalysisViews.tsx).'),
    'The notice wording changed (UpgradeLine, rendered via).',
  );
  assert.equal(
    shortReason('TileImage.test.ts covers mismatched images; normal photos fill tiles.'),
    'covers mismatched images; normal photos fill tiles.',
  );
  assert.equal(
    shortReason('The ranked rows retain clear hierarchy at both widths. Evidence: evidence/FIXES11/pain-points-full-1280.png.'),
    'The ranked rows retain clear hierarchy at both widths.',
  );
});

test('plain words, product names, and simple pairs survive', () => {
  assert.equal(shortReason('The headline, lede, and single Book button make the next step obvious.'), 'The headline, lede, and single Book button make the next step obvious.');
  assert.equal(shortReason('The color-contrast rule passes.'), 'The color-contrast rule passes.');
  assert.equal(shortReason('Runs on Node.js 20.'), 'Runs on Node.js 20.');
  assert.equal(shortReason('Search and/or filter controls remain readable at 390px.'), 'Search and/or filter controls remain readable at 390px.');
  assert.equal(shortReason('See https://example.com/docs for the flow.'), 'See https://example.com/docs for the flow.');
});

test('notes collapse to one line, and a note that is only a path falls back to itself', () => {
  assert.equal(shortReason('First line.\nSecond  line.'), 'First line. Second line.');
  assert.equal(shortReason('evidence/FIXES12/dashboard-1280.png'), 'evidence/FIXES12/dashboard-1280.png');
  assert.equal(shortReason(''), '');
  assert.equal(shortReason(null), '');
});
