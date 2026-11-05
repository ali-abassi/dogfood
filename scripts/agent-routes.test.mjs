import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentRoute } from '../lib/agent-routes.mjs';
test('operator can select a bounded lower-cost native Codex route without bypassing PAL quota', () => {
  const original = process.env.DOGFOOD_CODEX_ROUTE;
  try {
    delete process.env.DOGFOOD_CODEX_ROUTE;
    assert.equal(agentRoute('codex'), 'gpt6.1-terra-xhigh');
    process.env.DOGFOOD_CODEX_ROUTE = 'gpt6-luna-xhigh';
    assert.equal(agentRoute('codex'), 'gpt6-luna-xhigh');
    process.env.DOGFOOD_CODEX_ROUTE = '--over-quota';
    assert.throws(() => agentRoute('codex'), /must be one of/);
  } finally {
    if (original === undefined) delete process.env.DOGFOOD_CODEX_ROUTE;
    else process.env.DOGFOOD_CODEX_ROUTE = original;
  }
});
