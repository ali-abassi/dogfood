# Daily workflow corrections — 2026-09-29

Ali reports eight daily-use problems, in priority order: unchanged rescan facts stale every audit answer; deploy-only features stay blocked; measured answers require manual entry; audit-only writes require connections; feature expectations cannot be edited and MCP tools stay cached; no explicit live/profile scan mode; pages need roles/fixtures; gate output is too long. Keep expectedStatus and exact hash URLs.

## Implementation boundaries

- Carry audit verdicts only when their declared, bounded evidence dependencies and scan context match. Keep original attribution/date; expose `carriedFrom`. Do not infer security, contrast, keyboard behavior or arbitrary custom questions from title/overflow. Legacy verdicts need a valid old evidence snapshot before carrying; otherwise remain unknown.
- Explicit one-click measured-answer acceptance records objective facts as verified by scan. Measurement candidates are offered without a write; accepting records them in one transaction. No paid/provider calls.
- `awaiting_live` is available only for features that require post-deploy proof, with a reason and durable debt. It can pass the local release gate with visible debt; it is never displayed as a proven Good feature. Recording a deploy makes that debt an untested to-do; a fresh live scan and explicit verification are needed to close it. Ordinary blocked/needs-work failures remain gate failures.
- Audit-only updates preserve connections when omitted. Feature edits preserve ID/history but invalidate materially changed expected behavior; existing retirement stays available.
- Live scan options preserve local configuration and exact query/hash paths, record live provenance, and never pretend the local checkout proves a remote deployed revision.
- Role/fixture prerequisites are explicit and verified; absent or mismatched prerequisites fail with a setup requirement, never accept the wrong-role page. Fixtures are opt-in local setup, not arbitrary hidden account switching or credentials.
- Gate defaults to one line per page with stale and debt counts; --verbose retains full reasons and existing exit semantics.
- No new runtime dependencies; Node modules, transactional JSON store, native CLI/MCP/UI.

## Shared lane interfaces

Persistence lane owns `lib/store.mjs`, `lib/schema.mjs`, new audit-evidence module and focused persistence tests. Provide exports `acceptMeasuredAnswers(projectId,pageId,by)`, `updateFeature(projectId,pageId,featureId,input,by)`, `recordDeployment(projectId,input,by)`. Scan evidence may include `environment` (local/live/mock), `requiredRole`, `fixture`, `verifiedRole`. Standardize feature `liveDebt` as `{state:'awaiting_deploy'|'pending'|'verified', reason, by, at, deploymentId?, activatedAt?, verifiedAt?}`. Declaring awaiting_live records awaiting_deploy; recordDeployment preserves source.url and resets those feature statuses to untested/pending. Passing pending debt requires the page's latest scan to be live and later than the recorded deploy; retain its receipt/provenance. Expose measured candidates and carried metadata in projectView without silently recording verdicts.

Gate lane owns `lib/completion.mjs`, `lib/answers.mjs`, `lib/report.mjs`, `scripts/gate.mjs`, `scripts/check-projects.mjs` and focused gate/answer tests. Audit evidence freshness uses exported `auditRowFresh(page,row,fingerprint)` from the new evidence module. Awaiting live only satisfies feature/Works requirements when valid awaiting_deploy debt is present, stays explicit in answer/status/progress and is counted as debt; activated/pending debt blocks again. `pagesGate(pages,mode,{verbose=false})` gives compact lines by default. Root wires CLI and visible states.

Scanner lane owns `lib/scanner.mjs`, `lib/scans.mjs`, `scripts/scan.mjs`, focused scanner/live/role tests. Keep existing scanPage/scanProject callers compatible; options are a final argument for explicit `{liveUrl,browserProfile,requiredRole,fixtures}`. Expose safe helpers/option contracts to root; coordinate persistence metadata with its owner. Verify role via explicit bounded visible DOM evidence and named fixtures configured with argv arrays in the local checkout; refuse fixture execution on live targets. Do not launch paid integrations or write production data.

Root owns MCP/CLI/server/frontend integration, supporting skill/docs, final acceptance and shipping. Lanes work in isolated worktrees, do not push/deploy/stash, and accommodate each other rather than reverting edits.

## Source-checked implementation mechanics

- MCP protocol 2025-11-25 requires declaring `tools.listChanged` and specifies `notifications/tools/list_changed`: https://modelcontextprotocol.io/specification/2025-11-25/server/tools . Source inspected in the maintained TypeScript SDK (2026-09-29, commit 7f4c12a6ae6b8f22411f7772c88036e1c8055423), `packages/server/src/server/server.ts::sendToolListChanged`; its license was read. Borrow the protocol message, not the SDK dependency.
- Use Node's existing child-process and filesystem primitives: one fresh worker per MCP tools/list or tools/call request reloads the whole module graph without ESM cache tricks. Arguments travel over stdin. A debounced source watcher validates the new tool list before notification; broken source fails closed rather than running a stale writer. Native persistent-connection test proves added tools and changed transitive implementations without session restart.
- Objective measurement rows are separate from human semantic questions. A known absence (no robots/canonical) is a measured value; an omitted structural fact is unknown and cannot fabricate a passing answer.

## Independent review corrections

Human capture dependencies use per-device visual baselines under the existing comparison threshold, including pixel-identical recompression and insignificant noise. A real visual change or scan-context change requires review; a standalone capture replacement remains stale. Carry markers are removed as soon as their facts change. Reaccepting unchanged measurements is refused and preserves the original attribution. Failed requests remain the existing automatic Works measurement.

Configured URL-only and LAN projects keep the base configured-environment acceptance path. Only an explicit live target requires a reported deployment receipt. Requested local fixture setup runs once per invocation, while every page still validates its own prerequisites. Screenshot history records its original environment and source URL; missing legacy metadata is explicitly unknown. Project-level deployment and fixture writes retry bounded concurrent conflicts without losing other writers.

## Continued daily rescan check

A real MCP rescan of the eleven accepted Dogfood pages preserved all sixteen audit rows on each of six unchanged pages. Five pages changed visibly as recorded QA/task state updated, so human screenshot-dependent answers correctly required review. Twelve legacy customized questions on three pages had no dependency snapshot; their fresh review must explicitly select the facts actually checked. Arbitrary custom questions do not receive an inferred dependency set. Page reads and compact verdict acknowledgements now expose `auditReuseWarnings`, with plain review-each-check feedback in the question view.

Null links and load times represent unmeasured values and cannot carry across rescans. Null canonical URLs or individual headers remain known absence. Custom performance questions may select `loadMs`; a changed value invalidates their answer. A missing checkout fingerprint retains the existing URL-only/live boundary and never proves deployed source. No old verdict is backfilled or upgraded by this repair.
