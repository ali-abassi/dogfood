# Progress

## 2026-09-29 — agent workflow

Implemented and verified checkout-first initialization, CLI/MCP tasks, dependencies and atomic claims, Plan UI, native check receipts, explicit recovery, resume handoffs and separate audit/acceptance gates. No runtime dependencies were added.

Evidence: 102 unit tests, syntax checks, lint and 30 MCP protocol checks passed. The existing full browser suite passed; final focused Plan, acceptance explanation, recovery and runner-status regressions passed, with desktop 1280 and mobile 390 inspection. Independent Opus review passed after repairing its findings. A separate fresh agent built and accepted persisted-note storage through the skill and left the dependent task ready with a usable handoff.

The local release target is http://127.0.0.1:4322. Actual runtime verification and the release revision are recorded in local `data/reviews/agent-workflow-2026-09-29/release.json`; Dogfood's own registered pages and tasks carry the current evidence. Real model/provider integrations and production deployments of other projects remain outside this release's checks.
