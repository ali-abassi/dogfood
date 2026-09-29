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
