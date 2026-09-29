# Plan

1. Start before an app exists: checkout-first setup, CLI and environment diagnosis.
   Check: `node --test scripts/cli.test.mjs`
2. Work through bounded outcomes: dependencies, atomic ownership, native check receipts, explicit recovery and durable handoff.
   Check: `node --test scripts/tasks.test.mjs scripts/cli.test.mjs`
3. Inspect the plan and QA: add/edit/claim/verify/accept in Plan, addressable views and clear audit versus acceptance.
   Check: `node tests/acceptance/task-plan.mjs` and `node tests/acceptance/ui.mjs`
   Visible: at 1280 and 390 wide, task outcome, owner, next action and missing acceptance evidence are readable without sideways scrolling.
4. Trust the evidence: underlying coverage, stale source/environment checks, failed-scan invalidation and race protection.
   Check: `node --test scripts/completion.test.mjs scripts/recheck.test.mjs`
5. Ship only after independent review, a fresh-agent skill trial, unit/browser checks and local runtime verification.

Scope: plain Node modules, JSON workflow data, existing browser and MCP tools. No new runtime dependencies or orchestrator.
