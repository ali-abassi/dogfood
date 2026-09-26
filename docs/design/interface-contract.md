# dogfood interface contract — six answers redesign, 2026-09-26

Project: dogfood, the open-source AI QA system at the repository root (public at https://github.com/ali-abassi/dogfood)
Artifact/register: product UI; a calm, native-feeling macOS-style report served locally in the browser, read far more than it is edited
Audience and usage context: a non-technical person who built an app with an AI coding agent ("vibe-coded") and wants to know, page by page, whether it works; their agent fills dogfood in through the MCP tools and the dogfood skill, and the person opens the app to read the result on a laptop, occasionally on a phone
Design argument / generative thesis / taste read: For a non-technical builder asking "is my app working?", dogfood feels like a checkup report in a first-party Mac utility: every page shows how it looks on a computer and a phone, then six plain answers with one clear mark each, so they know what is good and what to fix without meeting a technical word. It prioritises the answer over the process (requirements, checklists, scans, and attribution stay one tap behind the answer), expressed through large screenshots, six icon-led rows, grouped white panels on a soft canvas, and colour only for the answer. It succeeds when a non-technical person can say, within five seconds of opening a page, whether it works and which of the six things needs fixing.
Approved references + qualities to borrow: PageSpeed Insights report, https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fwww.apple.com%2F&form_factor=mobile, rendered 2026-09-25 at 1440 × 900: one plain verdict sentence leads ("Assessment: Passed", only the verdict word coloured) and the diagnosis sits below it; GitHub Actions run summary, https://github.com/ali-abassi/dogfood/actions (run for ffe4bf1), rendered 2026-09-25: a one-word status beside a large state icon, then one row per check with an icon, a plain name, and one fact, each row opening its detail; macOS System Settings: a list of rows that drills into one detail with a back control, so the list stays short; the project's design system in design.md (tokens, one blue pill per view, colour only for state)
Anti-references + failures to avoid: the current page view (a "What QA still needs" list in internal vocabulary: requirements, checklists, connections, "AI review of the current screenshots", five tabs, and multi-line evidence notes with worker URLs on first view); PageSpeed's acronym metrics (LCP, INP, CLS) and gauges; GitHub's developer vocabulary and annotation dumps; per-page numeric scores; status dots with no words
Source list / artifact manifest: https://github.com/ali-abassi/dogfood/blob/main/design.md; https://github.com/ali-abassi/dogfood/blob/main/vision.md; https://github.com/ali-abassi/dogfood/blob/main/intent.md; https://github.com/ali-abassi/dogfood/blob/main/lib; https://github.com/ali-abassi/dogfood/blob/main/public/js; https://github.com/ali-abassi/dogfood/blob/main/public/styles.css; https://github.com/ali-abassi/dogfood/blob/main/tests/design/design-fixture.mjs; https://github.com/ali-abassi/dogfood/blob/main/tests/design/design-capture.mjs; https://github.com/ali-abassi/dogfood/blob/main/tests/acceptance
Direction decision (use / avoid / prove): use: the six answers in the owner's words (Looks right, Clear purpose, Easy to use, Safe, Fast & findable, Works as expected), the words Good, Needs work, and Not checked, large side-by-side screenshots, one list of six rows that drills into one answer's evidence, the existing tokens and one blue pill per view; avoid: tabs on the page, requirement lists, internal terms on the report (requirement, verdict, audit, checklist, connection, capture, scan, P0–P3), numeric scores, and more than one line of text per row; prove: after-screenshots of every surface at 1440 × 900 and 390 × 844 with the Tidepool demo and the Northwind long-content fixture, the locked checks run as the acceptance suite tests/acceptance/report-card.mjs, and recordings of answering, reporting a bug, and navigating by keyboard
Fixed constraints: no framework, no build step, no dependencies; the data the agent records (features, checklists, issues, tests, connections, scans, screenshots, AI reviews) keeps its shape; every acceptance behaviour that still exists keeps a passing check (moved checks are logged below); complexity 5 or less per function; the MCP completion gate reads the same six answers as the app
Non-goals: dark-mode redesign beyond parity, marketing pages, new kinds of evidence, changing how scans or AI reviews are produced beyond the three judged questions
Shared type / spacing / color / shape / imagery / motion rules: system SF stack at 400–600; 28px page titles, 17px panel titles, 15px row titles, 13–14px answers and body, 12px meta; spacing on the 4/8/12/16/24/32 scale; canvas #f5f5f7 and white 12px panels; blue #0071e3 only for the one primary action, links, and focus; green for Good, red for Needs work, grey for Not checked, orange only for "Changed since last check"; every mark pairs its colour with a shape (check, exclamation, dash) and a word or accessible name; radii 12/8/6 and full pills for buttons; imagery is only the product's own screenshots; motion only for disclosure chevrons, at most 150 ms, none under reduced motion
Shared interaction and feedback rules: a row is one button that opens its answer; Back returns to the report and puts keyboard focus on the row that was opened; a click never leaves a stray focus ring; every save confirms in the same words as its label and updates the mark in place; an unchanged form closes silently, a changed one asks Save or Discard inline; nothing reflows sideways when something opens; destructive actions stay grey until the confirming step
Default viewport: 1440 × 900
Minimum viewport: 390 × 844
Handoff path: docs/design/interface-contract.md
Evidence directory: design-evidence (after-evidence in design-evidence/after, recordings in design-evidence/recordings, reviews in design-evidence/reviews)
Locked checks version / date: v2, 2026-09-26
Required reviewer assignments: one independent reviewer, on a different model from the builder, per surface (dogfood-rv-overview, dogfood-rv-report, dogfood-rv-answer, dogfood-rv-works, dogfood-rv-screens, dogfood-rv-add-project, dogfood-rv-suggestions, dogfood-rv-navigation), one cross-surface consistency reviewer (dogfood-rv-consistency), and the lead as final approver

---

## Surface: Overview (is this app working?)

- **Register and usage moment:** product report; the first screen when a project opens, read to decide which page to fix
- **Primary user job:** know whether the app works and which pages need fixing
- **Observable successful outcome:** the person names a page that needs work and which of the six answers is wrong, then opens it in one click
- **Entry / exit:** entry from app start, the sidebar Overview item, or after adding a project; exit by opening a page row, Review suggestions, Add project, or Check all pages
- **Critical information, ordered:** one sentence answering "Is Tidepool working?" with counts of pages that are good, need work, and are not checked; what changed since the last check; each page with its six marks in the fixed order
- **Primary actions:** Check all pages
- **Secondary actions:** Download report, Review suggested features, open a page
- **Composition and hierarchy:** title with the answer sentence under it and the actions on the right; one white panel listing pages by site section, each row: page name and route on the left, six marks aligned under six short column headings on the right
- **Interaction and feedback rules:** a row is one button opening that page's report; Check all pages shows progress in its own label and ends by naming what changed
- **Normal state:** Tidepool demo: 5 pages, one needing work, two changed since last check, suggestions waiting
- **Empty state:** a project with no pages says so in plain words and offers Add project
- **Long / maximum-content state:** the Northwind fixture: a 52-character project name, 60-character page names, a 90-character route
- **Loading state:** the suggestions line appears when loaded without moving the page list
- **Error / degraded / disabled state:** a failed suggestions load says so in place of its line; Check all pages is disabled with progress while running
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind long-content fixture
- **Surface-specific anti-slop risks:** metric-card sprawl, scores, status dots without words, repeating the same status in three places
- **Acceptance checks:**
  - `OV-1` — the overview opens with one sentence stating how many pages are good, need work, and are not checked | Tidepool demo | 1440 × 900 | screenshot + DOM
  - `OV-2` — every page row shows six marks in the report's order under six column headings, and each mark's accessible name names the answer and its state, for example "Safe: Not checked" | Tidepool demo | 1440 × 900 | screenshot + DOM
  - `OV-3` — at phone width each row shows the page name and its six marks with no sideways scrolling, and the column meaning is still available | Tidepool demo | 390 × 844 | screenshot + DOM
  - `OV-4` — long page names wrap to at most two lines while long routes stay on one line with an ellipsis | Northwind fixture | 1440 × 900 | screenshot
  - `OV-5` — no internal term (requirement, verdict, audit, checklist, connection, capture, P0, P1) appears on the overview | Tidepool demo | 1440 × 900 | DOM text
- **Explicit failure conditions:**
  1. A reader needs more than one sentence to learn how many pages need work
  2. A mark is colour-only or has no accessible name
  3. Any content scrolls sideways at 390 px
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Page report (screenshots and six answers)

- **Register and usage moment:** product report; opened from the overview or sidebar to see one page's health
- **Primary user job:** see the page on a computer and a phone and learn which of the six answers are good
- **Observable successful outcome:** within five seconds the person says whether the page works and which answer needs fixing
- **Entry / exit:** entry from an overview row, a sidebar row, or Back from an answer; exit by opening an answer row, View full page, Check with AI, Check again, Open page, or Remove page
- **Critical information, ordered:** page name and plain status; desktop and phone screenshots with when they were taken and whether the page changed since the last check; the six answers, each with its mark and one plain sentence
- **Primary actions:** Check with AI (only while the AI has not checked the current screenshots)
- **Secondary actions:** Check again, View full page, Open page, Remove page…
- **Composition and hierarchy:** heading row (route, name, status, actions); a screenshot panel with the desktop screenshot wide and the phone screenshot narrow side by side, both cropped to one height with View full page; a panel titled "Is this page working?" holding six rows in the fixed order
- **Interaction and feedback rules:** each row is one button opening its answer; Check with AI states its cost before spending and shows progress in its label; Check again shows progress and updates the screenshots and marks in place
- **Normal state:** Tidepool Book: one answer needs work, some good, some not checked
- **Empty state:** a page with no screenshots shows "Not checked yet" with one Take screenshots action, and all six rows read Not checked
- **Long / maximum-content state:** Northwind Revenue: 60-character name, 90-character route, long evidence notes
- **Loading state:** Check again and Check with AI show progress in their own label and keep the layout still
- **Error / degraded / disabled state:** a blocked screenshot states its reason; a failed AI check or scan shows its error under the actions and keeps the previous answers
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind long-content fixture
- **Surface-specific anti-slop risks:** tabs, requirement lists, multi-line evidence notes on the report, a second blue button, badges repeating the status
- **Acceptance checks:**
  - `PR-1` — both screenshots and all six answer rows (name, mark, and answer sentence) are visible on first paint | Tidepool Book | 1440 × 900 | screenshot
  - `PR-2` — the six rows appear in the order Looks right, Clear purpose, Easy to use, Safe, Fast & findable, Works as expected, and each answer is one line of plain words with no internal term | Tidepool Book | 1440 × 900 | screenshot + DOM
  - `PR-3` — activating a row opens that answer; Back returns to the report with keyboard focus on the same row | Tidepool Book | 1440 × 900 | recording
  - `PR-4` — at phone width the screenshots come first, then the six rows, with no sideways scrolling | Tidepool Book | 390 × 844 | screenshot + DOM
  - `PR-5` — a page with no screenshots shows one Take screenshots action and six Not checked rows | Northwind Revenue before a scan | 1440 × 900 | screenshot
  - `PR-6` — the page has no tabs and at most one blue filled button | Tidepool Book | 1440 × 900 | DOM
- **Explicit failure conditions:**
  1. Any of the six rows is below the fold at 1440 × 900
  2. A row shows more than one line of text or an internal term
  3. Back loses the reader's place
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Answer detail (Looks right, Clear purpose, Easy to use, Safe, Fast & findable)

- **Register and usage moment:** product detail; opened from a report row to see why an answer is what it is, and to change it
- **Primary user job:** understand the evidence behind one answer and, when needed, record a better one
- **Observable successful outcome:** the person can say who or what gave the answer and why, and a new answer they save appears on the report
- **Entry / exit:** entry from a report row; exit by Back to the report
- **Critical information, ordered:** the question in plain words; the answer with its mark; where it came from (you, an agent by name, the AI review of these screenshots, or a measurement) and when; the evidence (the note, the AI's reason, measured facts in plain words, the questions asked); what to do next when it needs work
- **Primary actions:** Update answer (the judged answers) or Answer questions (Safe and Fast & findable)
- **Secondary actions:** Back, Check with AI, Cancel
- **Composition and hierarchy:** back control, the question as the title, one answer panel (mark, answer, source line), then evidence panels; the form replaces the answer panel inline
- **Interaction and feedback rules:** Good and Needs work are a two-choice control; a note of at least 12 characters is required and a shorter one is refused inline; saving confirms "Answer saved" and the mark updates on return
- **Normal state:** Tidepool Book, Looks right answered by an agent; Fast & findable with measured load times
- **Empty state:** Not checked, with what would answer it (Check with AI, or answer yourself)
- **Long / maximum-content state:** Northwind Revenue with 1,200-character notes
- **Loading state:** saving shows "Saving…" in the button
- **Error / degraded / disabled state:** a refused note shows its reason under the field; a stale AI review says it belongs to older screenshots
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind long-content fixture
- **Surface-specific anti-slop risks:** raw header names and tag names without explanation, a wall of checklist rows, attribution louder than the answer
- **Acceptance checks:**
  - `AD-1` — the detail shows the question, the answer, and where it came from | Tidepool Book, Looks right | 1440 × 900 | screenshot + DOM
  - `AD-2` — choosing Needs work with a note and saving updates the answer, and Back shows the new mark on the report; a note under 12 characters is refused inline | Tidepool Book, Clear purpose | 1440 × 900 | recording
  - `AD-3` — Fast & findable states each device's load time in seconds and whether the page has a title and a description, in plain words | Tidepool Home | 1440 × 900 | screenshot + DOM
  - `AD-4` — Safe lists its questions with each one's answer and lets the person answer them | Tidepool Book | 1440 × 900 | screenshot + DOM
  - `AD-5` — at phone width the detail and its form fit with no sideways scrolling | Tidepool Book | 390 × 844 | screenshot + DOM
- **Explicit failure conditions:**
  1. The answer's source is missing or ambiguous
  2. A saved answer does not change the report
  3. Measured facts appear as raw keys (h1Count, content-security-policy) with no plain label
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Works as expected (things you can do, bugs, errors)

- **Register and usage moment:** product detail; opened from the Works as expected row to see whether each thing a person can do on the page works
- **Primary user job:** see which things work, which do not, and which bugs are open, and report a new bug
- **Observable successful outcome:** the person names the thing that does not work and the open bug, and a bug they report appears in the list and turns the answer to Needs work
- **Entry / exit:** entry from the report row; exit by Back
- **Critical information, ordered:** the answer; each thing a person can do here with its mark, what should happen, and what was observed; open bugs by how bad they are; errors the page check found; automated tests when the page has them
- **Primary actions:** Report a bug
- **Secondary actions:** Add a thing people can do, add AI-suggested things, Mark fixed, Run tests, Back
- **Composition and hierarchy:** answer panel; "Things you can do here" panel; "Bugs" panel; "Found by the page check" panel only when it has something; "Automated tests" only when the page has tests; data connections folded at the end
- **Interaction and feedback rules:** Report a bug opens an inline form with a title, what happened, and how bad it is; saving adds the bug and confirms "Bug reported"; Mark fixed asks what was retested
- **Normal state:** Tidepool Book: one thing needing work, one open bug
- **Empty state:** no things listed yet: says so and offers the AI's suggestions or Add
- **Long / maximum-content state:** Northwind Revenue: 9 things, 3 bugs, 12 data connections, long notes
- **Loading state:** saving shows progress in the button; tests show "Running…"
- **Error / degraded / disabled state:** a refused bug report shows the reason under the form
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind long-content fixture
- **Surface-specific anti-slop risks:** severity codes, connection tables on first view, attribution louder than the observation
- **Acceptance checks:**
  - `WK-1` — each thing a person can do shows its name, what should happen, and its mark | Tidepool Book | 1440 × 900 | screenshot + DOM
  - `WK-2` — open bugs show how bad they are in plain words (Breaks the app, Blocks this page, Annoying, Cosmetic), never P0–P3 | Tidepool Book | 1440 × 900 | DOM
  - `WK-3` — reporting a bug adds it to the list and the report's Works as expected answer becomes Needs work | Tidepool Account | 1440 × 900 | recording
  - `WK-4` — the maximum content stays readable and data connections are folded | Northwind Revenue | 1440 × 900 | screenshot
  - `WK-5` — at phone width the lists and the form fit with no sideways scrolling | Tidepool Book | 390 × 844 | screenshot + DOM
- **Explicit failure conditions:**
  1. A bug shows only a code for its severity
  2. A reported bug leaves the answer at Good
  3. Connection rows appear expanded by default
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Screenshots (full page and what changed)

- **Register and usage moment:** product detail; opened from View full page to inspect the whole page or what changed since the last check
- **Primary user job:** look at the full page on either device and see what changed
- **Observable successful outcome:** the person scrolls the full screenshot and, when the page changed, compares before and after
- **Entry / exit:** entry from View full page or the Changed since last check marker; exit by Back
- **Critical information, ordered:** device choice; the full screenshot; when it changed, the previous and current screenshots and the difference with how much changed
- **Primary actions:** none (viewing only)
- **Secondary actions:** Desktop / Phone switch, Open image full size, Back
- **Composition and hierarchy:** back control and device switch; the screenshot at readable width; a "What changed" panel only when there is a comparison
- **Interaction and feedback rules:** the device switch swaps the image in place without moving the controls
- **Normal state:** Tidepool Classes, which changed since the last check
- **Empty state:** a device with no screenshot says why
- **Long / maximum-content state:** a 6,000-pixel-tall screenshot scrolls inside the page
- **Loading state:** images reserve their space while loading
- **Error / degraded / disabled state:** a missing image says it is missing
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo
- **Surface-specific anti-slop risks:** tiny thumbnails, captions in technical terms (sha, pixels, diff)
- **Acceptance checks:**
  - `SC-1` — View full page shows the full-length screenshot for the chosen device, and the switch changes device | Tidepool Classes | 1440 × 900 | screenshot + DOM
  - `SC-2` — a changed page shows the previous and current screenshots and the difference, with how much changed in plain words | Tidepool Classes | 1440 × 900 | screenshot
  - `SC-3` — at phone width the screenshot fits the width with no sideways scrolling | Tidepool Classes | 390 × 844 | screenshot + DOM
- **Explicit failure conditions:**
  1. The switch moves or resizes the controls
  2. The comparison uses technical captions only
  3. The full screenshot is shrunk so small that its text cannot be read
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Add project and welcome

- **Register and usage moment:** onboarding; the first run with no projects, or adding another app
- **Primary user job:** get their app into dogfood, either by asking their agent or by pasting its address
- **Observable successful outcome:** the person either copies the one sentence to give their agent or pastes a URL and sees their pages being checked
- **Entry / exit:** entry on first run or from Add project; exit when onboarding finishes and the new overview opens, or Cancel
- **Critical information, ordered:** the logo and one sentence saying what dogfood tells them; the sentence to give their coding agent; the address field; the optional name, signed-in profile, and priced AI check
- **Primary actions:** Add and check
- **Secondary actions:** Copy (the agent sentence), Cancel
- **Composition and hierarchy:** one narrow panel centred on first run: brand, promise, "With your coding agent" block, "Or add it here" form
- **Interaction and feedback rules:** Copy confirms "Copied"; an invalid address is explained inline without starting; progress names the page being checked
- **Normal state:** first run with no projects
- **Empty state:** the first run is the empty state
- **Long / maximum-content state:** a 120-character URL and a long name
- **Loading state:** "Checking 3 of 12 · Pricing" in the progress line with the button disabled
- **Error / degraded / disabled state:** an invalid URL or a failed onboarding shows its reason under the form
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** an empty data folder and the Tidepool demo
- **Surface-specific anti-slop risks:** marketing hero, feature grids, jargon (onboard, manifest, MCP) in the first sentence
- **Acceptance checks:**
  - `AP-1` — the first run shows the logo, one sentence saying what dogfood tells you, a sentence to give your coding agent with Copy, and the address field | empty data | 1440 × 900 | screenshot + DOM
  - `AP-2` — an invalid address is explained inline without starting | empty data | 1440 × 900 | DOM
  - `AP-3` — at phone width the panel fits with no sideways scrolling | empty data | 390 × 844 | screenshot + DOM
- **Explicit failure conditions:**
  1. The first sentence uses a technical term
  2. The agent path is missing or needs more than one copy
  3. An invalid address starts onboarding or clears what was typed
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Suggested things to check (project-wide)

- **Register and usage moment:** product workflow; after the AI check proposes what people can do on each page
- **Primary user job:** accept the AI's list of things people can do, page by page, in one pass
- **Observable successful outcome:** the checked suggestions become things to check on their pages in one click
- **Entry / exit:** entry from the overview's suggestions line; exit by Add or Back
- **Critical information, ordered:** how many suggestions on how many pages; per page, each suggestion with what should happen; which ones came from older screenshots
- **Primary actions:** Add N things
- **Secondary actions:** uncheck, Back
- **Composition and hierarchy:** one panel with page groups, each suggestion a checked checkbox row, the Add pill sticky at the bottom
- **Interaction and feedback rules:** the Add label counts the checked rows; saving confirms and returns to the overview
- **Normal state:** Tidepool with suggestions on two pages
- **Empty state:** "Nothing waiting" with Back
- **Long / maximum-content state:** eight suggestions on each of four pages
- **Loading state:** "Loading suggestions…"
- **Error / degraded / disabled state:** a failed load says so; Add is disabled with nothing checked
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo with seeded AI reviews
- **Surface-specific anti-slop risks:** interface elements offered as features, a second blue button
- **Acceptance checks:**
  - `SG-1` — suggestions are grouped by page, checked by default, and the Add label counts the checked ones | Tidepool | 1440 × 900 | screenshot + DOM
  - `SG-3` — adding saves only the checked suggestions to their pages, and the unchecked ones are still offered afterwards | Tidepool | 1440 × 900 | DOM + manifest
  - `SG-2` — at phone width it fits with no sideways scrolling and the Add pill stays reachable | Tidepool | 390 × 844 | screenshot + DOM
- **Explicit failure conditions:**
  1. The count disagrees with the checked rows
  2. Content scrolls sideways at 390 px
  3. A suggestion that is an interface element (a menu, a button, a link) is offered
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Surface: Navigation (sidebar and phone Pages sheet)

- **Register and usage moment:** product chrome; always present on desktop, a sheet on phones
- **Primary user job:** move between the overview and pages and find a page by name
- **Observable successful outcome:** the person reaches any page in two actions and knows each page's status from the list
- **Entry / exit:** always visible on desktop; on phones Pages opens the sheet and Done or choosing a page closes it
- **Critical information, ordered:** brand, project picker, search, Overview, pages grouped by site section with a status mark each
- **Primary actions:** none (navigation)
- **Secondary actions:** Add project, search, show and sort, Open product
- **Composition and hierarchy:** grey source list; selected row in a grey rounded highlight; marks on the right of each row
- **Interaction and feedback rules:** choosing a page opens its report; search filters in place; keyboard focus follows the sheet open and close
- **Normal state:** Tidepool with 5 pages
- **Empty state:** a search with no match says so
- **Long / maximum-content state:** 25 pages with 60-character names
- **Loading state:** not applicable; the list renders with the project
- **Error / degraded / disabled state:** a project that fails to load shows the retry screen
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind fixture
- **Surface-specific anti-slop risks:** colour-only status dots, icons for every row
- **Acceptance checks:**
  - `NV-1` — every page row's status mark has an accessible name in plain words (Good, Needs work, Not checked, Partly checked, Can't open) | Tidepool | 1440 × 900 | DOM
  - `NV-2` — on a phone, Pages opens a sheet, Done closes it, and focus returns to the Pages button | Tidepool | 390 × 844 | recording
  - `NV-3` — the overview, a page, and an answer can be reached and opened with the keyboard alone | Tidepool | 1440 × 900 | recording
- **Explicit failure conditions:**
  1. Status is shown by colour alone
  2. The sheet traps or loses focus
  3. A search with no match leaves an empty list with no explanation
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**

## Completion packet

- Final surface inventory:
- Reviewer verdicts:
- Unresolved unknowns / risks:
- Check-change log: v1 (polish pass, 2026-09-26, 33 checks OV/PS/RC/SP/MR/SS/IS/AP/SG/NV) → v2 (this contract) → the owner redirected the product on 2026-09-26 ("think of the user as non technical … there is so much on this page that is confusing"), which removes the tabs and requirement list those checks inspected → authorized by the owner's direction → v1 was never run; v2's checks and evidence replace it.
- Final decision: Rework
