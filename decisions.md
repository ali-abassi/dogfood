# Decisions

## 2026-10-01 — improve Dogfood with Hill Climber

- Target an observed discovery failure: “coverage inspect” could not find Overview's “Inspect page coverage and acceptance” feature. Routes and open bug identifiers were also absent from the matcher. Improving this existing control avoids adding another screen or search system.
- Use a frozen behavioral evaluator: 34 public development cases, 39 different private cases outside the repository, compatibility gates and all existing native tests. An always-empty negative control fails both score and compatibility. Three candidates in one round suffice because the selected patch passes both panels; don't spend another round against a disclosed holdout.
- Keep deterministic all-term substring matching and site order. Search only names and identifiers people see; exclude expected/detail prose and resolved bugs. Preserve the existing blog menu policy. No fuzzy ranking, caching or dependency is needed for this small local menu.
- Prior art: [cmdk's matcher](https://github.com/dip/cmdk/blob/main/cmdk/src/command-score.ts) joins aliases and normalizes inputs. Retain that simple corpus idea, explicitly add Unicode accent folding, and skip its recursive fuzzy ranker. The accessible search name now describes routes and open bugs.
- A preflight format error was corrected before any model generation. The first generation attempt then retained the baseline because bundled Codex 0.149.0 rejected the current configuration schema; no holdout ran. The successful experiment uses the real SDK with `codexPathOverride` pointing at the installed authenticated CLI 0.159.3 through an external adapter. Global configuration and credentials were preserved. All three successful candidate turns have real SDK traces and reported usage.
- Candidate count and timeouts bound this pilot. The 150,000-token threshold is checked between rounds, so the in-flight round exceeded it: reported usage was 868,347 input tokens (748,160 cached) and 6,970 output tokens. Completed runtime was 336.696 seconds. This is evidence of this bounded correctness gain; it is not proof of cheap or universal optimization.

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
