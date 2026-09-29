import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const data = mkdtempSync(join(tmpdir(), 'dogfood-qa-agent-'));
process.env.DOGFOOD_DATA = data;
process.env.DOGFOOD_QA_AGENT = ''; // Set, so the developer's .env cannot switch it on.
const store = await import('../lib/store.mjs');
const agent = await import('../lib/qa-agent.mjs');
after(() => rmSync(data, { recursive: true, force: true }));

// A stand-in agent: writes the arguments it was started with, so the test can read the brief.
const fakeAgent = join(data, 'fake-agent.mjs');
writeFileSync(fakeAgent, "import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));");
const seen = join(data, 'seen.json');

store.createProject({ id: 'shop', name: 'Shop', url: 'https://shop.example', browserProfile: 'Default' });
store.registerPage('shop', { id: 'cart', name: 'Cart', group: 'Public', route: '/cart', features: [{ id: 'pay', name: 'Pay' }] });

test('without DOGFOOD_QA_AGENT there is no QA agent to ask', async () => {
  assert.equal(agent.qaAgentConfigured(), false);
  await assert.rejects(() => agent.startQaAgent('shop', 'cart'), /DOGFOOD_QA_AGENT/);
});

test('the QA agent starts with the page, a run id and a brief naming what the page still needs', async () => {
  process.env.DOGFOOD_QA_AGENT = `node ${fakeAgent} ${seen} {project} {page} {run} {workdir}`;
  const runs = await agent.startQaAgent('shop', 'cart');
  const [project, page, run, workdir, brief] = JSON.parse(readFileSync(seen, 'utf8'));
  assert.deepEqual([project, page, run, workdir], ['shop', 'cart', runs.cart.run, runs.cart.workdir]);
  assert.match(brief, /Finish page QA for the page "Cart" \(cart\) at https:\/\/shop\.example\/cart/);
  assert.match(brief, /scripts\/gate\.mjs shop cart/);
  assert.match(brief, /- Desktop and phone screenshots: /);
  assert.match(brief, /--profile Default/);
  assert.match(brief, /never .*type a password/i);
  assert.deepEqual(Object.keys(agent.qaAgentRuns('shop')), ['cart']);
});

test('a start command that fails says so and records no run', async () => {
  process.env.DOGFOOD_QA_AGENT = 'node -e process.exit(3)';
  store.registerPage('shop', { id: 'home', name: 'Home', group: 'Public', route: '/', features: [] });
  await assert.rejects(() => agent.startQaAgent('shop', 'home'), /could not start \(exit 3\)/);
  assert.equal(agent.qaAgentRuns('shop').home, undefined);
});
