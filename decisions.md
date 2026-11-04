# Decisions

## 2026-11-03 — agent requests in the project workbench

- Ali authorized a kanban that sends work and feedback to Claude Code or Codex. Implement one complete request/conversation/review loop first; keep the broader discovery/map/annotation/goal work as later scope.
- Reuse local PAL native sessions instead of adding provider API credentials or a second conversation runtime. Start an isolated worktree at the registered checkout's committed revision; expose the worktree and session in card details.
- Keep implementation plans and QA acceptance authoritative. Board requests may link them but never silently claim, verify, accept, merge or deploy them.
- Independent review found stop/result races and hidden-draft loss. Keep every unread native result retryable, retain discarded-feedback history, and guard all unsent drafts before navigation. On phones the selected conversation leads; empty lanes use compact headers.
- Preserve the current brand and native UI. Surface state, conversation and page context before additional dashboards or decorative progress metrics.
- Reconcile the local and published histories by a merge that preserves both histories and retains the published portability changes; never force-push.

## 2026-10-01 — improve Dogfood with Hill Climber

- Target an observed discovery failure: “coverage inspect” could not find Overview's “Inspect page coverage and acceptance” feature. Routes and open bug identifiers were also absent from the matcher. Improving this existing control avoids adding another screen or search system.
- Use a frozen behavioral evaluator: 34 public development cases, 39 different private cases outside the repository, compatibility gates and all existing native tests. An always-empty negative control fails both score and compatibility. Three candidates in one round suffice because the selected patch passes both panels; don't spend another round against a disclosed holdout.
- Keep deterministic all-term substring matching and site order. Search only names and identifiers people see; exclude expected/detail prose and resolved bugs. Preserve the existing blog menu policy. No fuzzy ranking, caching or dependency is needed for this small local menu.
- Prior art: [cmdk's matcher](https://github.com/dip/cmdk/blob/main/cmdk/src/command-score.ts) joins aliases and normalizes inputs. Retain that simple corpus idea, explicitly add Unicode accent folding, and skip its recursive fuzzy ranker. The accessible search name now describes routes and open bugs.
- A preflight format error was corrected before any model generation. The first generation attempt then retained the baseline because bundled Codex 0.149.0 rejected the current configuration schema; no holdout ran. The successful experiment uses the real SDK with `codexPathOverride` pointing at the installed authenticated CLI 0.159.3 through an external adapter. Global configuration and credentials were preserved. All three successful candidate turns have real SDK traces and reported usage.
- Candidate count and timeouts bound this pilot. The 150,000-token threshold is checked between rounds, so the in-flight round exceeded it: reported usage was 868,347 input tokens (748,160 cached) and 6,970 output tokens. Completed runtime was 336.696 seconds. This is evidence of this bounded correctness gain; it is not proof of cheap or universal optimization.
- The search passed CI, but an existing guide-security fixture failed twice on Node 22 after synchronous browser commands. The same suite reproduced locally on Node 22. A two-request transport proof shows server-closed keepalive sockets reused after the blocked event loop (`ECONNRESET`); draining bodies alone does not fix it. Close native fixture connections and consume readiness responses rather than retrying the assertion. All nineteen guide/UI checks now pass on Node 22; response CSP and inline-script/event assertions remain unchanged.

## 2026-09-29 — agent workflow
- Keep Dogfood a local workspace; coding agents build with their existing tools. This preserves its lightweight purpose.
- Store executable tasks once in `data/workflows`, separate from Markdown intent and page manifests. Native argv checks accommodate different stacks without adding adapters.
- Distinguish an answered audit from acceptance. Recorded failures can complete an audit; accepted work requires current passing evidence and resolved findings.
- Bind receipts to source and task definitions, and record explicit abandoned-claim recovery. No silent owner replacement.
- Require remote checkout mappings to be declared. A local fingerprint cannot prove a remote deployment.
- Use the current checkout for Docs so a person sees the plan the agent is actually following.
- Keep the existing visual direction. The new Plan view uses the current typography, spacing and restrained controls.
- Independent Opus review and a scratch-project skill trial check both failure paths and fresh-session usability. Evidence is in local `data/reviews`; these are verification artifacts rather than public customer data.
- Preserve historical audit coverage after a source change, but show old positive answers as Recheck until revalidated. This deliberately favors evidence freshness over guessing whether a documentation or backend edit is harmless. The separate Checked and Accepted labels explain why an answered audit may require new acceptance evidence; all repository content remains covered.
- Require an attached project URL before page acceptance, with explicit page URLs on the same origin as that declared environment. A loopback page alone does not define the project's runtime; attach its URL first.
- Reuse the nearest registered checkout when `init` has no explicit ID. Explicit IDs can register separate packages in a monorepo; native checks keep that package directory while evidence covers the repository.

## 2026-09-29 — whole-app clarity

Ali approved Plan as the visual direction and requested the rest of the app improved. Preserve its native utility grammar, native controls, readable outcomes and separate evidence states. Remove repeated setup copy and human-facing API names. Keep optional onboarding settings behind disclosure. The project selector gets exactly one inset chevron while retaining native selection. Record this correction in the QA skill. Keep backend semantics and zero runtime dependencies.

Prior art: Primer CSS `src/forms/form-select.scss` (MIT, active 2026-09-29) uses appearance:none, reserved text padding and an inset background indicator. Borrow the mechanism, not its code or palette. MDN Advanced form styling confirms the native appearance constraint. The rendered Linear reference uses a compact source list next to real work; retain this relationship but use Dogfood’s light/dark tokens and plain QA vocabulary. No new dependency was needed.

### 2026-09-29 — whole-app review corrections

Preserve all provenance-labelled product intent and append the user’s new plan/build/check/resume scope. Consolidate lane styles into the existing stylesheet; remove the extra asset routes and dead feature bars. Distinguish action fills from link blue in dark mode, including the generated brand guide. Treat standalone project HTML as untrusted: its response has a CSP sandbox without script permission, verified by inline-script and inline-event exploit fixtures. Wrap long phone finding metadata and retain optional-settings expansion across re-renders.

The acceptance-count test changed only to reflect removal of decorative dot separators; count semantics and exact values stay asserted. The visual contract’s36 locked check IDs were preserved. Corrected proof selectors to target visible document actions rather than the hidden phone sidebar; corrected the saved-research failed-read fixture to use its real loadError branch.


## 2026-09-29 — daily workflow evidence

Agent-selected implementation of Ali's eight reported friction points: keep bounded audit fact snapshots and original attribution; use five objective measurement rows so scans cannot invent keyboard/security/contrast or indexing intent; track deploy-only feature debt explicitly, activate it only from a recorded deployment, and require a later exact live scan before closure. A source watcher plus fresh short-lived MCP workers preserves the protocol connection and reloads transitive modules without extra runtime dependencies. Native tests use owned local fixtures and profiles; a chosen Chrome profile does not prove authentication, and recorded deployment revisions remain reported rather than remotely verified.

Independent daily-use review tightened freshness to the existing visual-difference threshold rather than PNG byte equality. Each device keeps a visual baseline; changed relevant facts and URL/role/fixture context still invalidate dependent answers. Measured candidates disappear after attribution, and duplicate failed-request measurement was removed because Works already reports it. Live mode is explicit; ordinary configured remote and LAN projects retain their original acceptance rules. Fixtures run once per scan invocation. Historical captures retain their own context and URL; legacy history remains unknown.

The final UI review also proved save → leave → reopen → reload, unchecked suggestions surviving refresh, and Cancel returning to Overview. Task saves now show Saving and retain the visible form/error on failure; rebuilding the form after an error discarded its draft. On phones the screenshot History toolbar gets its own full-width row and exposes a scrollbar for longer date sets. Configured remote evidence is labelled Configured environment, reserving Local for loopback and Live for explicit deployed checks.

The release recheck keeps screenshot age on its own unclipped line; the report adds a context label only for Live, Mock or a configured remote environment. Full provenance stays in Screens and About. Task raw fields, selections and errors now live in the existing workflow state so unrelated renders during a pending or failed save preserve the draft; new/cancel/success/project switch clear it. Native checks at 1280 and 390 prove both retry and reset.

## 2026-09-29 — custom audit reuse

Review advised against an all-facts fallback for arbitrary custom questions: it could not observe an unspecified external condition, missed load time, and treated unknown null links as measured. Keep explicit reviewer-selected dependencies and narrow canonical defaults. Make missing dependencies visible in MCP/API acknowledgements and the question view; add measured load-time dependencies and fail closed on unknown links/timing. A rewritten question drops prior dependencies unless its reviewer explicitly selects them again; Good answers alone need the reuse warning. Freshly review the twelve affected legacy rows with their actual evidence; preserve their attribution on later unchanged scans.

## 2026-09-29 — review toolbar alignment

Give shared link-style controls inline flex alignment so anchors and buttons center their text in the same minimum-height box. The report’s Open page label sat about five pixels above its neighboring buttons despite matching outer boxes. Check text geometry, phone wrapping and keyboard focus when reviewing mixed controls. The actual accepted-state check also found Good text at 4.39:1; mixing its green slightly toward the theme ink brings the small label above 4.5:1 without changing the semantic palette.


## 2026-11-03 — selected dog mark and native request setup

Ali selected logo direction 1: the front-facing folded-ear dog on a flat blue tile. Use the actual selected vector for the shared navigation, mobile toolbar, favicon and brand guide. Keep system typography and functional blue. After rendered review, lighten the canvas/navigation, remove heavy lane fills, and constrain request conversations to a readable measure. Preserve existing status meaning, data and page/task acceptance.

Expose board operations through the existing CLI/MCP implementation rather than introducing a second runner. Save requests by default; require explicit start/send and retain notes. Doctor separates installation, local sign-in and dispatcher reachability, with an explicit agent readiness exit gate. Keep the existing global executable and MCP pointers; sync maintained skills without changing account configuration. Real CLI proof uses a disposable fixture and isolated native worktree. See docs/cli.md and docs/design/design-cli-2026-11-03.md.

Doctor must verify the same canonical data store as the server before calling native requests ready. A project ID can exist in different stores, so a reachable board alone is insufficient. Compare a local store identity without exposing authentication output. Terminal close/reopen actions must not dispatch unrelated queued work; an unconfirmed stop is a failed command.

## 2026-11-03 — discovery through reviewed changes

The app's main question is now “What needs attention next?” Overview combines agent requests, planned work and outstanding QA, using actual counts and the project's stated outcome/proof rather than invented KPI scores. Preserve the chosen dog mark, system type and functional blue. Keep page reports compact enough for all six answer rows at the established desktop viewport.

New ideas start in a managed local Git workspace with three discovery rounds. They require material answers, planned pages and observable feature expectations, resolved material questions, Vision/Plan and an attributed review of the current scope before build requests start. Discovery and QA requests remain available while build is gated. Existing imported projects remain explicitly uncertified and usable. Reviewed scope tracks the committed documents, so ordinary implementation changes do not invalidate it.

The product map derives relationships from planned/registered pages, features, tasks, requests and evidence. Read existing bounded Graphify output when available and label its age; do not imply a graph extraction ran. Screenshot pins are QA findings with immutable capture bytes, position, device and capture hash. Creating a request from a pin saves it for explicit start and retains its model choice.

Agent review shows concise outcomes separately from chatter, reported checks and unverified claims. Inspect actual bounded text patches and inert before/after HTML previews, explicitly apply the reviewed fingerprint to a clean same-base source, then explicitly save that exact staged source as a local commit. No auto-deploy or QA acceptance. Advance the agent's isolated branch/index without overwriting its working files, allowing the same conversation to continue. Native agents cannot invoke these operator source actions. Source saves use Git index locks and compare-and-swap HEAD updates with hooks/signing disabled.

Native prompts carry stable project/request IDs, linked task and feature expectations, current discovery contract, source boundaries and the designated existing browser session. URL-only QA gets an audit workspace rather than a false application checkout. Replace the legacy arbitrary QA shell command with the same durable native board lifecycle. Visual AI opinions bind to prompt/schema, brand, guidelines and available devices; missing phone evidence cannot earn a phone pass. Historical opinions may therefore require review after this upgrade; never run paid rechecks automatically.

Handle external Git work explicitly: reconcile only an exact single-parent commit of the reviewed tree, or release an abandoned integration only after source is back at its exact clean base. Preserve receipt history and the agent worktree; never restore/reset source automatically. Refuse new agent turns while an unsaved integration is active so they cannot invalidate the reviewed snapshot.

The real Codex continuation probe showed the shell retained DOGFOOD_NATIVE_REQUEST but its MCP child reached the idle-card guard instead of the native-context guard. Explicitly forward the five Dogfood context variable names in Codex's existing MCP entry; PAL's config is a symlink to that same file. Preserve command/account settings and credentials. This is a runtime setup correction supported by an actual harmless invalid-fingerprint probe, not an assumption about Codex's inherited environment.

Overview status polling must update its own panel rather than replace the app. A real Linux CI search failure caught the lost-input race; deterministic delayed-response proof now covers it at desktop and phone widths. Defer the panel swap while it owns focus, preserving keyboard interaction, and retain open outcome disclosure across background updates.

## 2026-11-03 — active portfolio and native app QA

The current-project dashboard answers “What is being built, and what needs attention?” Its primary action opens the selected project. Use a quiet two-column list at desktop and one column on a phone, with truthful counts rather than invented KPI scores. Selection lives in a revisioned sidecar; omitted projects remain in History with their evidence.

Use explicit platform/device profiles. Normal web projects retain computer and phone requirements; projects with a written desktop scope may select desktop only. Native iOS captures occupy one mobile slot and bind to bundle, screen, version/build, Simulator, current source and executable evidence. Preserve operator attribution: a matching file hash alone is not automatic installed-app attestation. Unknown installed source, unmeasured launch timing, missing accessibility checks and absent logs remain visible gaps. No HTTP/SEO facts are fabricated for native screens.

The selected portfolio contains Learn Quran, Scarlet, AI Money Team, AI Social Team and Blog Dawg. Preserve existing native records and historical findings; use separate current web QA environments where older records mix source versions, production URLs and retired scope. Review web apps in isolated local data with publishing/providers disabled, preserve the existing Simulator, and keep generated CLI publication proof separate from public delivery. Project-level green acceptance is not a consequence of registering a project.

Public GitHub should explain the scope → agent work → feedback → evidence workflow with a tested zero-key demo and conceptual SVG, while keeping private project screenshots, credentials and QA artifacts local.

A configured browser session is shared operator state. Scans reuse `DOGFOOD_BROWSER_SESSION`, never close it during completion/failure/shutdown, and never inject a saved state into it. Without that setting, scans retain their owned temporary-session lifecycle. Keep explicit profile selection and name actual authentication evidence accurately. The existing local deployment records its designated session/profile in ignored environment settings.

## 2026-11-03 — final workflow clarity

Keep the existing blue dog mark, system type, restrained surfaces and native-app layout. The main question is what needs attention and what happens next. Improve the explanation at the point of action instead of adding dashboards, vanity scores or decorative graphics. A persistent How Dogfood works view gives the four-step process, separate completion meanings and a project-specific agent prompt.

Expose build, discovery and QA intents in request creation. Put a required decision and its evidence in the result; keep the machine packet in a closed disclosure and preserve the full conversation. Queue cancellation and progress labels must reflect actual state. Keep open review disclosures stable during board refresh. A QA intent cannot apply or save application source; start a build request for changes. Remove the arbitrary conversation count cap because a bookkeeping limit must not prevent a completed run or source-save receipt from being recorded.

## 2026-11-04 — Agent work is a core product surface

Ali clarified that agentic engineering is half the product and that every required QA item must be
checked. Treat partial coverage as unfinished work, not a completed audit. Connect the existing task
engine to the board instead of building a second acceptance system. Claim linked builds atomically,
respect dependencies, display current delivery evidence, and preserve operator review before source
integration. Keep conversation closure separate from verified delivery.

Design review: the board must answer “What needs my attention, and what has actually been verified?”
Keep the established Apple/system type, dog mark and blue action. Three changes: visible delivery
requirements on each card; ready tasks and incomplete QA becoming concrete requests; searchable
quiet lanes with neutral closed state. No invented productivity KPIs or optimistic agent scores.

Prior-art check used the GitHub research skill. Vibe Kanban at 08064e043c2d78ad123b473257ed867e7ce74768
(Apache-2.0, repo updated 2026-11-03) has separate StartReview, ToggleChangesMode and TogglePreviewMode
in packages/web-core/src/shared/actions/index.ts. Adopt the separation of conversation, review and
preview actions; Dogfood already has isolated worktrees and patch inspection. Add evidence-bound
acceptance using Dogfood's existing gates. No third-party code copied or dependency added.

## 2026-11-04 — Make the board readable without nested disclosures

Ali found the board's collapsible sections difficult to understand. The main question remains: what work needs attention, and what should I do next? Requests, ready planned tasks and outstanding page QA now have named views instead of stacked accordions. The QA view uses a page list and a visible requirements sheet; a labeled page selector replaces the list on phones. Task links, required commands, agent-reported checks, unresolved gaps and related page acceptance stay visible. Long briefs, old conversations and raw technical artifacts retain disclosures.

Preserved the existing Dogfood logo, system typography, neutral navigation and blue actions; no new visual system or decorative metrics. The three priorities were discoverable work, visible requirements, and less vertical travel on phones. AGENTS.md records this rule for future interface changes.

## 2026-11-04 — Page reports as a single review sheet

Ali still found the pages complex after the board navigation change. The page report now answers two questions together: what does this page look like, and what needs attention? Desktop places the real preview beside plain review results on one sheet. Phone keeps the preview before the results. A short status line preserves page health and acceptance as distinct facts; What remains opens the complete acceptance gaps.

Supporting metadata, measured answers and page removal move to Page details with keyboard return focus. Required checks remain available directly; no evidence or ability is removed. Existing Dogfood branding and real screenshots are retained. Single-device scan handling is corrected: desktop-only and mobile-only evidence can both describe links and page metadata without crashing.

## 2026-11-04 — Durable context and visual task evidence

Ali asked for robust task-connected agents and screenshots in Kanban comments, using Paperclip as prior art. Adopted its durable bounded handoff and task-scoped attachment patterns after reading source at52b4b3c; see docs/research/paperclip-agent-context.md. Retained PAL's existing conversations and Dogfood's separate source/task/page gates instead of adding another agent framework.

Each turn now has a hashed immutable context manifest. The prompt carries fresh task context, earlier sent steering, the prior structured result and exact retrieval paths when a section exceeds its inline budget. Unsent/discarded feedback is excluded. The latest manifest means prepared context, not proof the model read it. Parse results before display truncation, release failed prompt reservations, and require the expected PAL turn/session/isolated worktree before acknowledging feedback.

Images belong beside the comment that explains them. Use one Attach images control and paste support, removable drafts, full-size originals and native CLI/MCP posting. Bound raster uploads, scope files to requests, verify integrity and deduplicate uncertain retries. Keep current-turn agent evidence visible with its final answer. Drafts survive polling and request switching, but remain in memory until posted; a full tab reload does not persist unsent files. No automatic QA acceptance comes from a screenshot.

Background QA/suggestion responses must update their visible consumer instead of redrawing unrelated navigation. Fixed the sidebar-search race exposed by the broader acceptance run with targeted rendering, and added response-controlled checks rather than arbitrary waits or weaker assertions.
