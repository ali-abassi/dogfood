# Progress

## 2026-09-29 — agent workflow

Implemented and verified checkout-first initialization, CLI/MCP tasks, dependencies and atomic claims, Plan UI, native check receipts, explicit recovery, resume handoffs and separate audit/acceptance gates. No runtime dependencies were added.

Evidence: 102 unit tests, syntax checks, lint and 30 MCP protocol checks passed. The existing full browser suite passed; final focused Plan, acceptance explanation, recovery and runner-status regressions passed, with desktop 1280 and mobile 390 inspection. Independent Opus review passed after repairing its findings. A separate fresh agent built and accepted persisted-note storage through the skill and left the dependent task ready with a usable handoff.

The local release target is http://127.0.0.1:4322. Actual runtime verification and the release revision are recorded in local `data/reviews/agent-workflow-2026-09-29/release.json`; Dogfood's own registered pages and tasks carry the current evidence. Real model/provider integrations and production deployments of other projects remain outside this release's checks.


## 2026-09-29 — daily QA and the complete interface

Implemented the eight daily-use corrections: evidence-dependent carry-forward using visual baselines, explicit postdeploy debt, one-click objective answers, optional audit connections, editable/retired features and fresh MCP tools, explicit live/profile scans, role/fixture prerequisites and compact gate output. Configured remote/LAN projects retain their existing acceptance behavior. No runtime dependencies were added.

Candidate evidence: 145 unit tests pass; native MCP has 33 checks and the two-origin scanner has 10 checks. The interface has 140 recorded fixture states at 1280 and 390, 48 zero-violation surface axe reports and 12 caption-context reports with separate graphic contrast checks, current 640/DPR2 reduced-motion captures, and independent reviews for all 12 surfaces. A 29-page rescan/deploy regression preserves attribution, stales only changed facts and activates deployment debt. Pixel-identical recompression, noise, concurrency and historical capture context have targeted native regressions. Task-save failures retain raw fields, selections and visible retry feedback through unrelated renders; successful retry and project switches clear the draft. Screenshot times remain fully readable at phone width.

The release target remains http://127.0.0.1:4322. Final source, native receipts, registered-page gates and runtime evidence are recorded locally in `data/reviews/app-polish-2026-09-29/release.json` and Dogfood's `app-polish` / `daily-workflow` tasks. Those receipts distinguish release checks from candidate UI fixtures. Paid model/provider integrations, authenticated Chrome and remote production revisions are outside this local release. Existing MCP connections that predate the reload implementation need one restart to install it; later source/schema changes reload and notify without restarting the connection.

## 2026-09-29 — continued real daily rescan

The running-app MCP rescan preserved all sixteen audit answers on each of six unchanged pages. Five pages changed visually after QA/task-state updates and correctly need a new human review. The follow-up makes explicit custom dependencies discoverable, treats unknown null links/timing as unmeasured, and supports measured `loadMs` dependencies. It preserves canonical defaults, measured answers and source/role/visual freshness boundaries. Candidate validation passes 155 unit tests, 37 native MCP checks, syntax checks and ESLint. Final tests, native MCP/UI feedback, repeated real custom-question rescans and the accepted task receipt are recorded locally in `data/reviews/daily-rescan-2026-09-29/release.json`.
