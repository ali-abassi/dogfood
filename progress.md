# Progress

## 2026-11-03 — agent requests and feedback

Implemented the project Agent board: five execution lanes, Claude Code/Codex selection,
optional page/feature/task links, durable isolated native sessions, ordered followups,
notes, stop/retry, lossless feedback discard, results/change summaries and explicit review.
Existing task and page QA acceptance remain separate. The primary action is New request;
mobile puts the selected conversation first and compacts empty lanes.

Evidence: 177 native tests, syntax checks, complexity lint and 37 MCP protocol checks pass.
Six browser checks cover the request loop, draft retention through result updates, safe result
rendering, notes, explicit completion, reload/mobile and hidden-draft navigation. Actual Codex
completed two turns in one card/session and changed the disposable fixture as requested;
actual Claude Code completed a separate requested change. Independent Opus review passed
after stop/result recovery and hidden-draft fixes. The rendered phone board has zero axe
violations. Local receipts are in `data/reviews/agent-board-20261103/`.

Release target: the existing local app at http://127.0.0.1:4322. Requests leave source changes
in their worktree for review; finishing a request never merges, deploys or accepts QA.
Discovery interviews, Graphify/product maps, screenshot-position annotations and ongoing
KPI goals are later milestones, outside this release.

## 2026-10-01 — Hill Climber page search

Hill Climber generated three real GPT-6.1 Sol candidates and selected the smallest patch. Development search outcomes improved from 19/34 to 34/34; a separate private panel improved from 18/39 to 39/39 with every compatibility gate passing. The selected matcher searches page identifiers, routes, feature names and open bug IDs/titles using every query word, independent of order, case or accents. Resolved bug text and explanatory prose stay excluded; filters, ordering and QA rules retain their existing behavior. No dependency or server change was needed.

Permanent evidence includes twelve native search regressions and eleven browser checks at 1280 and 390. They prove same-page matching, literal punctuation, Unicode, current-data reads, preserved input focus/caret, report navigation and no sideways overflow. An independent review passed the bounded source/test review. Final source, native checks, browser evidence and task/page acceptance are recorded locally in `data/reviews/hillclimb-search-2026-10-01/release.json`.

CI also exposed an existing Node 22 guide-test transport failure, reproduced locally and with an isolated two-request proof. Closing the native fixture connections fixes it without changing runtime code or weakening the guide's security checks; the focused nineteen-check suite passes on Node 22.

The fixed experiment remains at `/home/user/experiments/dogfood-search-climb-live-20261001`; its verified receipt records promotion with `applied:false` because the owner integrated the winning patch after review. These scores measure the defined page-search cases, not overall product quality or search relevance across arbitrary datasets.

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

The first follow-up CI run exposed fixed-delay and offscreen-click assumptions in the report-card acceptance test. A detailed native repro showed the save completed, but the Back button's center was above the viewport; the browser command missed it. The test now waits for the saved question view and scrolls Back into view before clicking. Its persistence and navigation assertions stay intact. Final CI results are recorded in the same release receipt.

## 2026-09-29 — review toolbar alignment

Corrected the Open page link’s vertical alignment with adjacent review actions using the shared link-button style. Desktop, phone and wrapped-toolbar evidence and final release status are recorded in `data/reviews/toolbar-alignment-2026-09-29/release.json`.


## 2026-11-03 — brand and CLI refinement

Implemented Ali's selected front-facing dog logo, a lighter shared app shell, flat board lanes, readable conversations and mobile branding. Added direct board CLI controls, complete MCP card/actions and truthful native readiness diagnostics.

Candidate validation: 182 native tests, syntax/data check, ESLint, 37 MCP protocol checks and six existing-session browser regressions passed. Desktop 1280 and phone 390 review covers light/dark board, conversation, Overview, Plan and report; no page overflow or axe violations. Axe leaves symbol-only status marks for manual contrast review; measured composed-color ratios are at least 4.52:1 in light and 5.00:1 in dark. A real CLI request reached Claude Code, created the exact requested fixture file in an isolated worktree, returned to Review and was explicitly closed from the CLI. The existing real Codex board proof remains recorded separately.

Independent Opus review passed after correcting data-store readiness and CLI lifecycle findings. Final source, installation checks, current QA and runtime release evidence are kept in local data/reviews/design-cli-20261103/release.json. This release targets the established local dashboard on port 4322. Unrelated page QA remains due for review where fingerprints have changed.

## 2026-11-03 — workflow improvement candidate

Implemented managed new ideas and staged Discovery, reviewed Vision/Plan scope, planned page/feature maps with optional saved Graphify context, screenshot pins linked to findings and requests, unified next actions, and fuller native request context. Review now exposes actual patches, inert HTML previews, explicit apply and an exact local source-save action; the same native conversation can continue afterward. QA requests use the durable native board. Visual AI freshness includes the full judgment contract and device coverage.

Candidate evidence: 228 native tests pass. A real new-project browser journey completed three discovery rounds, created missing documents, reviewed scope and saved its baseline. All existing browser acceptance suites pass, including the 36-check report contract. Eight headed board checks prove two Inspect → preview → Apply → Save turns in one session. Six new workflow checks cover discovery, map, pins, model choice and stale feedback recovery. Syntax/data checks and complexity lint pass. Independent Opus review passes after source-save continuation and external-Git recovery fixes. Discovery and map have zero axe violations in the rendered candidate checks. Local deployment, real native continuation and source-bound acceptance are still in progress. Release evidence is under local `data/reviews/workflow-20261103/`. Historical AI opinions can show Recheck under the new contract; no paid re-evaluation runs automatically. Ongoing autonomous KPI goal execution remains outside this release.

Runtime update: ca66c7f was pushed to main and deployed on the established port4322. Both native logins, global CLI, matching data store and dispatcher pass Doctor. A real Codex build returned the linked page; the operator inspected its actual patch/HTML preview, applied and saved it through the dashboard, then independently passed the browser behavior check from saved source. A second turn confirmed the source/worktree revision and reviewed readiness. That real probe exposed Codex MCP environment filtering; the existing MCP entry now forwards the five Dogfood context variables, with a bounded native retest and release QA receipts kept in the same local evidence directory. Task/page QA remain separate from request completion.

Hosted CI confirmed the report first-fold fix, then exposed a search race: Overview's asynchronous status response re-rendered the entire app during typing. Update only the current-work panel, preserve an open outcome disclosure, and defer its swap while focus is inside it. A deterministic delayed-response browser regression preserves search-node identity, focus, text and matched results at1280/390; all13 search checks pass. Independent review passes. The native MCP forwarding retest now returns the explicit native-context refusal, with source/worktree clean; full receipts remain local.
