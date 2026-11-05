import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentOutcome, storedOutcome } from '../lib/agent-results.mjs';
import { resultInstructions } from '../lib/agent-context.mjs';

const result = {status:'ready_for_review',summary:'Updated phase 2 and preserved prior context.',decision:null,checks:[{command:'node verify.mjs codex',result:'exit 0; prior context preserved',evidence:'proof-codex.json'}],previewUrl:null,unverified:['Operator acceptance and browser QA']};
const fence = (value, label = 'json') => `\`\`\`${label}\n${JSON.stringify(value)}\n\`\`\``;

test('a strict final generic JSON result retains checks as agent-reported claims', () => {
  const outcome = agentOutcome(`## What changed\nUpdated phase 2.\n\n${fence(result)}\n`);
  assert.equal(outcome.structured, true); assert.equal(outcome.summary, result.summary);
  assert.equal(outcome.checks[0].command, result.checks[0].command);
  assert.equal(outcome.checks[0].provenance, 'agent-reported');
  assert.equal(outcome.provenance, 'agent-reported');
  assert.deepEqual(outcome.unverified, result.unverified);
  const blocked = agentOutcome(fence({...result,status:'needs_input',decision:'Which account?'}));
  assert.equal(blocked.status, 'needs_input'); assert.equal(blocked.decision, 'Which account?');
});

test('generic unrelated, partial, malformed and example JSON never becomes a result', () => {
  const replies = [
    fence({status:'ready_for_review',summary:'An unrelated application response.'}),
    fence({...result,extra:'unrelated field'}),
    fence({...result,checks:[{command:'node verify.mjs',result:0,evidence:'proof.json'}]}),
    fence({...result,unverified:'not a list'}),
    fence({...result,status:'needs_input',decision:null}),
    '```json\n{broken}\n```',
    `Example result:\n${fence(result)}`,
    `${fence(result)}\nThis was an example, not my result.`,
  ];
  for (const reply of replies) {
    const outcome = agentOutcome(reply);
    assert.equal(outcome.structured, false, reply); assert.deepEqual(outcome.checks, []);
  }
});

test('explicit dogfood-result retains precedence over a final generic block', () => {
  const explicit = {...result,summary:'The explicit outcome.',checks:[]};
  const outcome = agentOutcome(`${fence(explicit,'dogfood-result')}\n${fence(result)}`);
  assert.equal(outcome.summary, explicit.summary); assert.deepEqual(outcome.checks, []);
});

test('fallback summary skips progress chatter, section headings and code', () => {
  const reply = 'I will inspect the files.\n\n## What changed\n**Changes**\nWhat changed\n```json\n{"heading":"fixture"}\n```\nUpdated phase 2 and preserved the prior screenshot.\n\n## How verified\nThe check passed.';
  assert.equal(agentOutcome(reply).summary, 'Updated phase 2 and preserved the prior screenshot.');
});

test('cached unstructured outcomes are recovered without rewriting the old receipt', () => {
  const previous = {summary:'What changed',structured:false,checks:[]};
  const card = {result:fence(result),outcome:previous};
  assert.equal(storedOutcome(card).summary, result.summary);
  assert.equal(card.outcome, previous); assert.equal(card.outcome.summary, 'What changed');
  const structured = agentOutcome(fence(result,'dogfood-result'));
  assert.equal(storedOutcome({...card,outcome:structured}), structured);
});

test('result instructions include a literal named fence and one valid status', () => {
  const match = resultInstructions.match(/```dogfood-result\n([^\n]+)\n```/);
  assert.ok(match); assert.equal(JSON.parse(match[1]).status, 'ready_for_review');
  assert.match(resultInstructions, /agent-reported, not independent receipts/);
});
