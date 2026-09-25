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

## Shipped next (2026-09-26)

1. Review AI-suggested features across a whole project in one pass (overview line, Review view, one-request add, `dogfood_suggestions`).
2. README screenshots from a demo that tells the story: its latest deploy fixed the phone layout, dogfood flags the two reviewed pages that changed, and 14 real AI suggestions are waiting.
3. Every acceptance suite runs in CI in headless Chrome (9 suites, 127 checks).

## Decided: no evidence age limit for now

Change detection already catches the failure that matters, evidence describing a page that no longer looks like it; a month-old scan of an unchanged page is still true. Age alone is a weak proxy. Revisit if someone relies on an old scan of a page that changed without being rescanned; the change would be a per-project `staleAfterDays` that turns old scans back into a completion requirement.

## Shipped next (2026-09-26): six answers for a non-technical owner

1. Every page is a report card: computer and phone screenshots, then six plain answers (Looks right, Clear purpose, Easy to use, Safe, Fast & findable, Works as expected), each opening to its evidence. The tabs and the requirement list are gone.
2. The overview answers "Is <app> working?" in one sentence and shows each page's six marks.
3. `skills/dogfood/SKILL.md` lets a person's coding agent set dogfood up, add the app, write each page's criteria, try everything, and answer the six questions; `node mcp.mjs <tool> '<json>'` works before an MCP client loads dogfood.
4. Proof: `tests/acceptance/report-card.mjs` runs the 33 locked checks of `docs/design/interface-contract.md` v2 (30 there, SG-1–3 in the suggestions suite), and CI keeps a video of it and every suite's result.
5. The AI check found that the committed demo Home screenshot showed raw HTML, because the one-off demo scan served `/` as plain text; the demo was recaptured.

## Next

- Watch real use (AI Social Team and AI Money Team are live in dogfood) and fix what slows people or agents down.
