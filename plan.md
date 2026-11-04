# Plan

10. Give agents work and feedback from the project board.
    Outcome: a person creates a linked request, starts Claude Code or Codex, continues the same conversation, and reviews its result in Dogfood.
    Check: `node --test scripts/agent-board.test.mjs` and `npm run check`; real two-turn native-agent proof and rendered request/thread checks recorded in progress.md.
    Visible: at 1280 and 390, truthful lane counts, usable request and comment forms, linked page context, preserved drafts, actionable failures, and explicit Review versus Done.
    Scope: board persistence/dispatch, native runner adapter, project navigation, page request entry, documentation and focused verification. Existing task and page acceptance do not change.

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

9. Find pages from routes, feature words and open bug identifiers.
   Check: `node --test scripts/search.test.mjs`, `node tests/acceptance/search.mjs`, `npm test`, `npm run check`, `npm run lint`.
   Visible: at 1280 and 390, reordered words locate a page, routes and open bug IDs work, an unmatched query explains the empty result, typing retains focus/caret, and choosing a result opens its report without sideways scrolling.
   Scope: pure sidebar matching, its accessible label and independent regressions. Preserve filters, order, blog-menu policy and QA semantics; no dependency or server changes. Select source through a fixed Hill Climber experiment with a separate private panel.


## 2026-11-03 — brand and terminal controls

Outcome: the selected dog logo, calm shared working screens, and one usable native request loop from dashboard, CLI and MCP. Scope: public assets/styles, board/page views, CLI, doctor, board tools and health endpoint. Decisions: preserve the stack, native accounts, isolated worktrees and separate QA acceptance.

Check: `npm test`, `npm run check`, `npm run lint`, `node tests/acceptance/mcp.mjs`, and `DOGFOOD_BROWSER_SESSION=dogfood-discussion node tests/acceptance/agent-board.mjs`. At 1280 and 390 wide, inspect empty/populated board, request form, conversation, Overview, Plan and report in light/dark; verify the selected logo, readable hierarchy, keyboard controls, preserved drafts and no horizontal page overflow. Prove a terminal request reaches a real native agent and returns a reviewable result. Ship through the existing local runtime and keep installation pointers current.

## 2026-11-03 — complete the reviewed product workflow

Outcome: a new idea becomes reviewed scope and a page/feature map; linked native requests return inspectable changes; screenshot feedback becomes a durable request; Overview explains the actual next action. Scope: managed project creation, readiness/docs/baseline, map, board context/results/diff/apply/save, pins, visual freshness, QA lifecycle, CLI/MCP/skill. Preserve existing acceptance gates, browser session, brand and source history.

Check: `npm test`, `npm run check`, `npm run lint`, full `npm run test:acceptance`; independent code review; fresh-project discovery/baseline and native continuation; screenshot pin/request and diff/apply/save through the existing browser. At 1280 and 390, review Discovery, map, Overview, Plan, agent conversation and pinned screenshot in light/dark, with readable controls, preserved drafts, keyboard access and no sideways page scrolling. Re-run the established local release and source-bound QA gates; record remaining unproven outcomes explicitly.

## 2026-11-03 — active portfolio and native app evidence

- Select the active project list without deleting historical audits. Show actual coverage and open findings, with clear project navigation at1280/390.
- Add an explicit web/iOS/CLI source profile. Preserve responsive web defaults; iOS uses real mobile frames and declared bundle/device/build evidence. Unknown installed builds cannot accept.
- Onboard the five selected products with current source mappings and representative real-flow QA. Keep external services and protected journeys explicitly unverified.
- Present a concise public GitHub with a verified no-key demo, accessible workflow artwork, CLI and native-app setup documentation.
- Check: `npm test`, `npm run check`, `npm run lint`, and `node tests/acceptance/platform-portfolio.mjs`. Retain scoped real-product evidence locally and review before shipping.
