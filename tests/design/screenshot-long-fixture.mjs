// Use actual full-page local brand-guide captures as explicitly synthetic screenshot-view content.
import { resolve } from 'node:path';
import { readPng } from '../../lib/capture.mjs';
const data = resolve(process.argv[2] || 'data/polish-fixture-final');
if (!data.includes('polish-fixture')) throw new Error('Requires an isolated polish fixture.');
process.env.DOGFOOD_DATA = data;
const store = await import('../../lib/store.mjs');
const id = 'classes-long';
const project = store.readProject('tidepool');
if (!project.pages.some(page => page.id === id)) store.registerPage('tidepool', {
  id, name: 'Long screenshot fixture: the complete local Dogfood brand guide', group: 'Synthetic fixtures', route: '/fixture/long-guide',
});
for (const [device, size, viewport] of [['desktop', 'default', '1280 × 900'], ['mobile', 'minimum', '390 × 844']]) {
  const file = resolve(`data/reviews/app-polish-2026-09-29/guide/normal-${size}-full.png`);
  const image = readPng(file);
  if (image.height < image.width * 4) throw new Error('The long fixture must contain a truly tall full-page capture.');
  store.recordCapture('tidepool', id, { device, file, viewport, fullPage: true, tier: 'mock', environment: 'mock',
    actor: 'Synthetic long-screen fixture', sourceUrl: 'http://127.0.0.1:4433/?project=dogfood-preview&view=guide' });
}
console.log('Tall screenshot fixture seeded from complete local guide captures.');
