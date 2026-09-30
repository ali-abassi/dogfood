# Decisions

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
