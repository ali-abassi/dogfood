import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const fixture = mkdtempSync(join(tmpdir(), 'dogfood-retire-'));
mkdirSync(join(fixture, 'projects'));
copyFileSync(fileURLToPath(new URL('../demo/projects/tidepool.json', import.meta.url)), join(fixture, 'projects/tidepool.json'));
process.env.DOGFOOD_DATA = fixture;
const { readProject, retireFeature } = await import('../lib/store.mjs');
after(() => rmSync(fixture, { recursive: true, force: true }));

const home = () => readProject('tidepool').pages.find(page => page.id === 'home');

test('a retired feature leaves the page and is kept with who retired it and why', () => {
  retireFeature('tidepool', 'home', 'book', 'The booking form moved to its own page.', 'agent:lead');
  assert.equal(home().features.some(feature => feature.id === 'book'), false);
  assert.deepEqual(home().retiredFeatures.map(({ id, reason, by }) => ({ id, reason, by })),
    [{ id: 'book', reason: 'The booking form moved to its own page.', by: 'agent:lead' }]);
});

test('retiring needs a real reason and an existing feature', () => {
  assert.throws(() => retireFeature('tidepool', 'home', home().features[0].id, 'gone', 'agent:lead'), /12/);
  assert.throws(() => retireFeature('tidepool', 'home', 'no-such-feature', 'The booking form moved away.', 'agent:lead'), /does not exist/);
});
