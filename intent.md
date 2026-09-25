# Current outcome — dogfood owned end to end

- **User-stated, 2026-09-25:** "Continue, you own this project." Ali is focused on dogfood the tool, not on any one project's QA progress.
- **Agent-selected working policy:** pick the next most valuable improvement, record it here, build it (PAL workers on Muse or Claude while Codex is out), verify it with an acceptance suite, push to `main`, and continue.

## Shipped under ownership (2026-09-25, through `a1b1bc6`)

1. Protection: the acceptance suites live in `tests/acceptance/` (8 suites, 115 checks), `npm run lint` enforces complexity 5, and GitHub CI runs unit tests, checks, lint, and the MCP suite on every push.
2. Know what changed since you last checked: each scan compares every screenshot with the previous one and stores a diff; pages reviewed before a visual change are flagged "Changed since review" until reviewed again; Scan all pages (app, `npm run scan`, `dogfood_scan_project`). On AI Social Team it caught the phone layout fixes on Schedule and Competitor research.
3. Onboarding can also run the AI review (opt-in, about half a cent per page) so pages arrive with suggested features.
4. A Markdown QA report (`npm run report`, `dogfood_report`, Download report in the app) that leads with what needs attention and states what is not proven.
5. Removing a page registered by mistake, with a reason on record (`dogfood_remove_page`, Remove page… in the app).
6. The app split from one 1,450-line file into 13 ES modules, with all 32 demo views byte-identical before and after.
7. The app reopens the last project; unchanged screenshots collapse to one line in Visual changes.

## Decisions

- "Changed since review" is informational (orange), not a completion gate; revisit if real regressions are missed.
- A visual change is a size change or more than 0.5% of pixels differing beyond a small tolerance.
- The AI review and anything else that costs money is always an explicit opt-in.

## Next, in order

1. Review AI-suggested features across a whole project in one pass (onboarding leaves every page's feature list to fill in, one page at a time today).
2. Refresh the README screenshots to show the overview with changes and the See page's visual changes.
3. Run the browser acceptance suites in CI (install agent-browser and Chrome on the runner).
4. Consider evidence age: how old a scan or verdict may be before it no longer counts, if people start relying on stale evidence.
