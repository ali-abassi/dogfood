# Current outcome — know what changed since you last checked

Previous outcomes (mobile and desktop evidence, measured scans, one-step onboarding, AI review v2 with suggested features, tamper-evidence, MCP guidance) shipped through `e84c3fb`.

- **User-stated, 2026-09-25:** "Continue, you own this project." Ali is focused on dogfood the tool.
- **Agent-selected objective, 2026-09-25:** after a deploy, the question a QA owner asks is *what changed, and which of my verdicts are now out of date?* dogfood already rescans pages; it now compares each scan with the previous one and says so.

## Scope (agent-selected)

1. Protect what exists: the acceptance suites live in `tests/acceptance/` (they only lived in a temporary folder), `npm run lint` enforces complexity 5, and GitHub CI runs the unit tests, checks, lint, and the MCP suite on every push. Done in `02cc4d9`.
2. Each scan compares every screenshot with the one it replaced (pixel share and size) and stores a diff image. A page is "changed since review" when it was reviewed and a later scan found it looks different; the flag stays until the page is reviewed again. Done in `b0baab0` and `e84c3fb`.
3. Scan all pages from the overview (a background job), `npm run scan`, and `dogfood_scan_project`; the overview counts and marks pages changed since review; See page shows previous, current, and diff images.

## Decisions

- A change is a size change or more than 0.5% of pixels differing by more than a small tolerance, so clocks and anti-aliasing do not flag every rescan.
- "Changed since review" is informational (orange), not a completion gate: dynamic pages change a little on every scan, and gating on it would make completion churn. Revisit if people miss real regressions.

## Acceptance

- `tests/acceptance/changes.mjs`: a fixture site is onboarded, reviewed, changed, and rescanned; the job reports the changed page, only the reviewed changed page is flagged, the images load, and the overview, filter, See page, and MCP agree.
- Every earlier suite still passes; CI is green.
