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

6. Extend the approved Plan across the whole app and correct project selection.
   Check: `npm run check`, `npm run lint`, `npm test`, `npm run test:acceptance`.
   Visible: at 1280 and 390 wide, one inset project arrow, readable documents and research, complete long evidence, preserved drafts and choices, and actionable loading/error/empty states.
   Scope: native controls, shared tokens, project/QA views and their supporting brand guide; acceptance and ownership semantics remain server-backed.

7. Remove daily QA friction without weakening proof.
   Check: `node --test scripts/daily-evidence.test.mjs scripts/daily-gates.test.mjs scripts/daily-scanner.test.mjs scripts/daily-workflow.test.mjs scripts/mcp-reload.test.mjs` and `node tests/acceptance/daily-scanner.mjs`.
   Visible: at 1280 and 390, current measured answers can be accepted in one action, original carried attribution remains visible, and postdeploy debt is clearly distinct from Good.
   Scope: bounded scan facts/context, feature/deployment lifecycle, live role/fixture scans, CLI/MCP/UI and skill; no runtime dependencies, provider calls or production-data changes.

8. Make custom audit reuse explicit and safe.
   Check: `node --test scripts/daily-evidence.test.mjs scripts/daily-gates.test.mjs`, `node tests/acceptance/mcp.mjs`, `npm run check`, `npm run lint`.
   Visible: at 1280 and 390, custom answers without selected evidence explain that they require review after each check; selected known evidence carries unchanged answers and original attribution.
   Scope: dependency completeness, API/MCP feedback, question feedback and supporting skill; no automatic guesses or old-verdict backfill.
