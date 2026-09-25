# Current outcome — public QA with a macOS design

- **User-stated, 2026-09-25:** Make QA a public repository, give it a clean logo, and design it like a Mac app: clean, crisp, purposeful.
- **Agent-selected scope:** Keep every behavior (page status, checks, reviews, issues, focused runs, AI screenshot review). Move all personal project data into a git-ignored `data/` folder, bundle a fictional demo, redesign the interface on the Apple system in `design.md`, add an app icon, and publish a fresh history that contains no private data.
- **Acceptance:**
  - `npm run demo` opens the Tidepool demo from a clean clone with no install step; `npm test` and `npm run check` pass.
  - At 1440 × 900 and 390 × 844, in light and dark, every view renders without horizontal overflow; all five views stay reachable on a phone; the Pages sheet opens and closes by keyboard.
  - The public repository contains no files from `data/`, no local paths, no credentials, and no private screenshots in any commit.
- **Boundary:** The AI screenshot review was not re-run for this change. The demo has no focused tests, so Run checks shows its empty state there.
