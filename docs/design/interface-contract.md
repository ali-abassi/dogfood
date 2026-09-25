# dogfood interface contract — polish pass, 2026-09-26

Project: dogfood, the open-source AI QA system at /Users/aliabassi/dogfood (public at https://github.com/ali-abassi/dogfood)
Artifact/register: product UI; a dense, calm macOS-style work tool served locally in the browser
Audience and usage context: a founder, designer, or agent checking a product page by page after a change or before a release; used at a desk on a laptop or wide screen, and occasionally on a phone to glance at status
Design argument / generative thesis / taste read: For people checking a product page by page, dogfood feels like a first-party macOS utility (Finder's source list, System Settings' grouped rows) so the next page to check and the proof behind each verdict are obvious in one glance. It prioritises calm legibility and stable state over decoration, expressed through a grey source list, one segmented control, white 12px groups on a soft canvas, and colour reserved for state. It succeeds when a person can name the page that needs work and what it is missing within five seconds, and nothing moves under their cursor while they read.
Approved references + qualities to borrow: macOS System Settings and Finder (grouped rows, one quiet source list, stable layout under disclosure); Apple Human Interface Guidelines for sidebars and segmented controls https://developer.apple.com/design/human-interface-guidelines/sidebars; the project's own design system in /Users/aliabassi/dogfood/design.md (tokens, one blue pill per view, colour only for state)
Anti-references + failures to avoid: chip clouds that reflow when one expands (the current QA completion panel); focus rings that stay after a mouse click; destructive red in the most prominent spot; wrapping monospace routes beside truncated names; toasts that silently block navigation; form controls styled like text fields (the current checkbox)
Source list / artifact manifest: /Users/aliabassi/dogfood/design.md, /Users/aliabassi/dogfood/vision.md, /Users/aliabassi/dogfood/intent.md, /Users/aliabassi/dogfood/public/js/, /Users/aliabassi/dogfood/public/styles.css; before-evidence in /Users/aliabassi/dogfood/design-evidence/before/; fixture builder /private/tmp/dogfood-proofs/design-fixture.mjs; capture script /private/tmp/dogfood-proofs/design-capture.mjs
Direction decision (use / avoid / prove): use: the existing design.md tokens, the grey source list, grouped rows, and one blue pill per view, and a stable requirement list that shows what is missing before what is done; avoid: new colours, new fonts, per-page scores, decorative chips, motion beyond 200 ms, and any control that changes layout width on interaction; prove: before/after screenshots of every surface at 1440 × 900 and 390 × 844 with the long-content fixture, plus recordings of the acceptance suites
Fixed constraints: no framework, no build step, no dependencies; the server contract and the manifest schema do not change; every acceptance suite in tests/acceptance keeps passing; complexity 5 or less per function
Non-goals: a new visual identity for the app (the logo is a separate lane), new features, dark-mode redesign beyond keeping parity, and marketing pages
Shared type / spacing / color / shape / imagery / motion rules: system SF stack at 400–600; 28px page titles, 17px group titles, 15px section titles, 13–14.5px rows, 12–12.5px meta; spacing on the 4/8/12/16/24/32 scale; canvas #f5f5f7 and white 12px groups; blue #0071e3 only for the one primary action, links, and focus; green, red, and orange only for pass, needs work, and blocked or changed states; grey for untested and secondary; radii 12/8/6 and full pills for buttons; imagery is only the product's own screenshots; motion only for disclosure chevrons and at most 150 ms
Shared interaction and feedback rules: a click never leaves a stray focus ring (focus is restored programmatically only after keyboard use); every action gives feedback in the same words as its label; nothing reflows sideways when something opens; an unsaved form is closed silently when unchanged and asks Save or Discard inline when changed; destructive actions are grey until the confirming step, which is red
Default viewport: 1440 × 900
Minimum viewport: 390 × 844
Handoff path: /Users/aliabassi/dogfood/docs/design/interface-contract.md
Evidence directory: /Users/aliabassi/dogfood/design-evidence (after-evidence in design-evidence/after, reviews in design-evidence/reviews)
Locked checks version / date: v1, 2026-09-26
Required reviewer assignments: one Muse reviewer per surface (dogfood-review-overview, dogfood-review-page-shell, dogfood-review-run-checks, dogfood-review-see-page, dogfood-review-review, dogfood-review-safety, dogfood-review-issues, dogfood-review-add-project, dogfood-review-suggestions, dogfood-review-navigation), one cross-surface consistency reviewer (dogfood-review-consistency), and the lead as final approver

---

## Surface: Overview (project home)

- **Register and usage moment:** product workspace; the first screen when a project opens, glanced at to decide what to work on next
- **Primary user job:** see which pages need attention and why, then open one
- **Observable successful outcome:** the person opens the page they meant to fix within two clicks and knows what it is missing
- **Entry / exit:** entry from app start, the sidebar Overview item, or after adding a project; exit by opening a page row, Review suggestions, Add project, or Scan all
- **Critical information, ordered:** project name; what needs attention (waiting suggestions, changed pages, blocking issues); pages complete; each page's status, name, what it is missing, open issues, and capture age
- **Primary actions:** Scan all pages
- **Secondary actions:** Download report, Review suggested features, open a page
- **Composition and hierarchy:** title and actions on one line; one attention line; a five-cell metric group; pages grouped by site section in one white group with one row per page
- **Interaction and feedback rules:** a row is one button; Scan all shows progress in its own label and ends with a message naming what changed
- **Normal state:** Tidepool demo with 14 suggestions waiting and 2 pages changed since review
- **Empty state:** a project with no pages says so and offers Add project
- **Long / maximum-content state:** the Northwind fixture: a 52-character project name, 60-character page names, and a 90-character route
- **Loading state:** the suggestion line appears when loaded without moving the metrics
- **Error / degraded / disabled state:** a failed suggestion load says so in place of the attention line; Scan all is disabled while running
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind long-content fixture
- **Surface-specific anti-slop risks:** dashboard metric sprawl, wrapped monospace routes, badges that repeat the status pill
- **Acceptance checks:**
  - `OV-1` — every page row shows its full name (wrapping up to two lines) while a long route stays on one line with an ellipsis | Northwind fixture | 1440 × 900 | screenshot
  - `OV-2` — the attention line, metrics, and first page row are all visible on first paint | Tidepool demo | 1440 × 900 | screenshot
  - `OV-3` — no horizontal scrolling and every metric cell reads cleanly with no orphaned half-empty row | Tidepool demo | 390 × 844 | screenshot
  - `OV-4` — clicking Overview in the sidebar leaves no focus ring on it | Tidepool demo | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. A page name is cut off while its route wraps
  2. The page shows a focus ring after a mouse click
  3. Any content scrolls sideways at 390 px
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-overview
- **Verdict:** Rework

---

## Surface: Page shell (heading, QA completion, view switcher)

- **Register and usage moment:** product workspace; the frame around every page view, read first on every page
- **Primary user job:** know the page's status and exactly what its QA still needs, then jump to the view that fixes it
- **Observable successful outcome:** the person reads what is missing without opening anything and reaches the fixing view in one click
- **Entry / exit:** entry by opening any page; exit through the segmented views or a requirement's action
- **Critical information, ordered:** page name and route; status; unmet requirements with their reason and action; met requirements in one line
- **Primary actions:** the action on each unmet requirement (Open My review, See page, and so on)
- **Secondary actions:** the segmented view switcher; Remove page
- **Composition and hierarchy:** route, title, and status pill on one line; one QA completion group listing unmet requirements as rows and met ones as a single "Done" line; the segmented control in the toolbar
- **Interaction and feedback rules:** nothing expands or reflows; the selected segment shows selection without a focus ring after a click; Remove page is quiet grey text and only its confirming button is red
- **Normal state:** Tidepool Book a lesson with four unmet and four met requirements
- **Empty state:** a complete page reads "QA complete" in one line
- **Long / maximum-content state:** Northwind revenue with a 60-character title, a 90-character route, and eight unmet requirements
- **Loading state:** the shell renders from the project data with no loading step
- **Error / degraded / disabled state:** a blocked page shows its blocked status and why screenshots are missing
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool Book a lesson and the Northwind revenue page
- **Surface-specific anti-slop risks:** chip clouds, chevrons on every item, labels that repeat the status pill, generic guidance sentences
- **Acceptance checks:**
  - `PS-1` — every unmet requirement's reason and fixing action are readable without opening anything, and met requirements share one line | Tidepool Book a lesson | 1440 × 900 | screenshot
  - `PS-2` — acting on a requirement never moves other requirements sideways or onto new lines | Tidepool Book a lesson | 390 × 844 | before/after screenshots
  - `PS-3` — after clicking a view in the switcher no focus ring remains | Tidepool Book a lesson | 1440 × 900 | screenshot
  - `PS-4` — Remove page is not red until its confirming step | Tidepool Book a lesson | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. Opening or reading a requirement reflows the others
  2. A destructive action is the most colourful element in the heading
  3. The heading repeats the status in words next to the status pill
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-page-shell
- **Verdict:** Rework

---

## Surface: Run checks

- **Register and usage moment:** product workspace; used when a page has focused tests configured, or to learn that it has none
- **Primary user job:** run the page's focused tests and read which cases passed or failed
- **Observable successful outcome:** the person runs the checks and sees every case with pass or fail and the failure message
- **Entry / exit:** entry from the Run checks segment; exit to another view
- **Critical information, ordered:** whether checks exist; the last run's result and cases; what remains untested
- **Primary actions:** Run checks
- **Secondary actions:** earlier runs, why these checks were chosen
- **Composition and hierarchy:** one group: heading and action, last run, then checks and gaps
- **Interaction and feedback rules:** the button says Running checks while busy and the result replaces it in place
- **Normal state:** a page with configured tests and one run
- **Empty state:** a page with no tests says so in one line and names the untested boundary
- **Long / maximum-content state:** a run with many cases and long failure messages
- **Loading state:** "Loading checks and past results" while the plan loads
- **Error / degraded / disabled state:** a missing test runner or checkout says what is missing
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** the Tidepool Book a lesson page (no tests) and AI Social Team Inspo (seven real cases)
- **Surface-specific anti-slop risks:** redundant headings for an empty state, a fake terminal look
- **Acceptance checks:**
  - `RC-1` — a page without tests says so once and shows its untested boundary without a second heading | Tidepool Book a lesson | 1440 × 900 | screenshot
  - `RC-2` — the view has no horizontal scrolling | Tidepool Book a lesson | 390 × 844 | screenshot
  - `RC-3` — the selected Run checks segment shows no focus ring after a click | Tidepool Book a lesson | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. The empty state stacks two headings that say the same thing
  2. Content scrolls sideways at 390 px
  3. A focus ring remains after a mouse click
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-run-checks
- **Verdict:** Rework

---

## Surface: See page

- **Register and usage moment:** product workspace; used to compare desktop and mobile, read what changed, read the scan, and ask the AI
- **Primary user job:** see the page as users see it on both devices and what changed since the last scan
- **Observable successful outcome:** the person can point at the change between scans and at any scan problem
- **Entry / exit:** entry from See page or a requirement action; exit to another view
- **Critical information, ordered:** desktop and mobile screenshots; visual changes; scan problems and facts; the AI review and its suggestions
- **Primary actions:** Ask AI to review image
- **Secondary actions:** Scan again, view full size, open the original page, add suggested features
- **Composition and hierarchy:** the two screenshots side by side, then visual changes, scan results, and the AI review as stacked groups
- **Interaction and feedback rules:** Scan again reports progress and errors in place; images open full size in a new tab
- **Normal state:** Tidepool Classes with a mobile change since review
- **Empty state:** a page never captured says so in both frames and offers Scan page there
- **Long / maximum-content state:** a page with long scan lists (more than five requests) folds the rest
- **Loading state:** "Reading the latest visual review" while the review loads
- **Error / degraded / disabled state:** a failed scan says so inline and keeps the previous screenshots
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool Classes and the never-captured Northwind revenue page
- **Surface-specific anti-slop risks:** empty grey boxes with no next step, screenshot chrome that competes with the page itself
- **Acceptance checks:**
  - `SP-1` — desktop and mobile screenshots are side by side and the mobile one is narrower | Tidepool Classes | 1440 × 900 | screenshot
  - `SP-2` — a never-captured page offers Scan page inside its empty screenshot frame | Northwind revenue | 1440 × 900 | screenshot
  - `SP-3` — the two screenshots stack with no horizontal scrolling | Tidepool Classes | 390 × 844 | screenshot
- **Explicit failure conditions:**
  1. An empty screenshot frame offers no next step
  2. Content scrolls sideways at 390 px
  3. The mobile screenshot is shown as wide as the desktop one
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-see-page
- **Verdict:** Rework

---

## Surface: My review

- **Register and usage moment:** product workspace; used to record verdicts for features and quality questions with evidence
- **Primary user job:** record a verdict with an evidence note for each feature and quality question
- **Observable successful outcome:** the saved review shows each verdict, its note, and who recorded it
- **Entry / exit:** entry from My review or a requirement action; exit by saving, cancelling, or switching view
- **Critical information, ordered:** features with expected behavior and verdicts; quality questions with verdicts; evidence notes and authors
- **Primary actions:** Review this page, then Save review
- **Secondary actions:** Cancel, design guidelines
- **Composition and hierarchy:** one group with features, then quality questions, then guidelines; the editor replaces the read view in place
- **Interaction and feedback rules:** switching away from an unchanged editor closes it silently; with changes, an inline prompt offers Save or Discard
- **Normal state:** Tidepool Book a lesson with mixed verdicts
- **Empty state:** a page with no features says to list them and points at the AI suggestions
- **Long / maximum-content state:** Northwind revenue with nine features and 250-character notes
- **Loading state:** renders from project data with no loading step
- **Error / degraded / disabled state:** a note that is too short shows the server message beside the form
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool Book a lesson and the Northwind revenue page
- **Surface-specific anti-slop risks:** walls of grey text where expected behavior and evidence look the same
- **Acceptance checks:**
  - `MR-1` — expected behavior and evidence notes are visibly distinct for the same feature | Northwind revenue | 1440 × 900 | screenshot
  - `MR-2` — switching view while the unchanged editor is open closes it and switches | Tidepool Book a lesson | 1440 × 900 | recording
  - `MR-3` — switching view with unsaved changes shows an inline Save or Discard prompt at the form | Tidepool Book a lesson | 1440 × 900 | recording
  - `MR-4` — the editor has no horizontal scrolling | Tidepool Book a lesson | 390 × 844 | screenshot
- **Explicit failure conditions:**
  1. Navigation is blocked by a toast with no visible reason at the form
  2. Unsaved changes are lost without asking
  3. Expected behavior reads as evidence
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-review
- **Verdict:** Rework

---

## Surface: Safety & search

- **Register and usage moment:** product workspace; used to answer the security, copying, search, and accessibility checklists and map connections
- **Primary user job:** answer each checklist question with evidence and see the page's data connections
- **Observable successful outcome:** every question shows a verdict and the connections list shows what the page sends and receives
- **Entry / exit:** entry from Safety & search or a requirement action; exit by saving, cancelling, or switching
- **Critical information, ordered:** checklists with reviewed counts; each question's verdict and note; connections
- **Primary actions:** Edit checks & connections, then Save checklist
- **Secondary actions:** Add check, Add connection, Remove
- **Composition and hierarchy:** one group with a disclosure per checklist and one for connections
- **Interaction and feedback rules:** disclosures toggle without moving other groups sideways; the editor follows the same unsaved-changes rule as My review
- **Normal state:** Tidepool Book a lesson
- **Empty state:** a page with no connections says to scan it
- **Long / maximum-content state:** Northwind revenue with twelve 140-character endpoints
- **Loading state:** renders from project data with no loading step
- **Error / degraded / disabled state:** a rejected save shows the server message in the form
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool Book a lesson and the Northwind revenue page
- **Surface-specific anti-slop risks:** long monospace endpoints overflowing their group
- **Acceptance checks:**
  - `SS-1` — twelve long endpoints wrap inside their group with no horizontal scrolling | Northwind revenue | 390 × 844 | screenshot
  - `SS-2` — each checklist shows its reviewed count and questions with verdicts | Northwind revenue | 1440 × 900 | screenshot
  - `SS-3` — the Safety & search segment shows no focus ring after a click | Northwind revenue | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. An endpoint overflows its group
  2. A checklist hides its reviewed count
  3. A focus ring remains after a mouse click
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-safety
- **Verdict:** Rework

---

## Surface: Issues

- **Register and usage moment:** product workspace; used to record a reproducible issue and resolve it after a retest
- **Primary user job:** record an issue with priority and steps, and resolve it with a retest note
- **Observable successful outcome:** the issue appears with its ID, priority, and author, and resolving it records the retest
- **Entry / exit:** entry from Issues or a requirement action; exit by saving, cancelling, or switching
- **Critical information, ordered:** open issues by priority; each title, steps, evidence, and author; resolved issues
- **Primary actions:** Add issue, then Save issue
- **Secondary actions:** Resolve, Reopen, Cancel
- **Composition and hierarchy:** one group listing issues with priority tags, then the add action and form
- **Interaction and feedback rules:** the add form follows the unsaved-changes rule; resolving asks for a retest note inline
- **Normal state:** Tidepool Book a lesson with two open issues
- **Empty state:** "No issues recorded for this page" and Add issue
- **Long / maximum-content state:** Northwind revenue with three issues and 300-character steps
- **Loading state:** renders from project data with no loading step
- **Error / degraded / disabled state:** a title that is too short shows the server message in the form
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool Book a lesson and the Northwind revenue page
- **Surface-specific anti-slop risks:** red everywhere; every issue shouting the same colour as the status
- **Acceptance checks:**
  - `IS-1` — long steps wrap and every issue's priority, status, ID, and author are readable | Northwind revenue | 1440 × 900 | screenshot
  - `IS-2` — the add-issue form is visible and usable with no horizontal scrolling | Tidepool Book a lesson | 390 × 844 | screenshot
  - `IS-3` — switching view with an unchanged add form closes it and switches | Tidepool Book a lesson | 1440 × 900 | recording
- **Explicit failure conditions:**
  1. Issue text overflows its group
  2. An open form silently blocks navigation
  3. Priority and status are indistinguishable
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-issues
- **Verdict:** Rework

---

## Surface: Add project and welcome

- **Register and usage moment:** product workspace onboarding; the first screen a new user sees, and the Add project form later
- **Primary user job:** start a project from a URL
- **Observable successful outcome:** the person submits a URL and sees onboarding progress
- **Entry / exit:** entry on first run or from Add project; exit when onboarding finishes or by cancelling
- **Critical information, ordered:** what dogfood will do; the URL field; optional name and Chrome profile; the paid AI option and its cost
- **Primary actions:** Add and scan
- **Secondary actions:** Cancel (not on first run)
- **Composition and hierarchy:** one narrow group; on first run the app icon and product name lead it
- **Interaction and feedback rules:** an invalid URL is explained inline; progress replaces the actions
- **Normal state:** Add project opened from the sidebar
- **Empty state:** the first-run welcome with no projects
- **Long / maximum-content state:** a long URL and a long project name fit the fields
- **Loading state:** "Finding pages…" then "Scanning N of M · page"
- **Error / degraded / disabled state:** an invalid URL message; a failed onboarding keeps the form with the error
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** the empty data folder and the Tidepool demo
- **Surface-specific anti-slop risks:** a centred card that could belong to any app; a checkbox styled like a text field
- **Acceptance checks:**
  - `AP-1` — the AI review option renders as a normal checkbox beside its label | first-run welcome | 1440 × 900 | screenshot
  - `AP-2` — the first-run welcome shows the dogfood icon and name above the form | first-run welcome | 1440 × 900 | screenshot
  - `AP-3` — optional fields say they are optional on the same line as their label | first-run welcome | 390 × 844 | screenshot
- **Explicit failure conditions:**
  1. A checkbox renders as a text-field-sized box
  2. The first-run screen has no brand
  3. Labels and their optional notes sit on separate lines
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-add-project
- **Verdict:** Rework

---

## Surface: Suggestions review

- **Register and usage moment:** product workspace; used after onboarding to accept the AI's suggested features for every page at once
- **Primary user job:** untick wrong suggestions and add the rest in one step
- **Observable successful outcome:** the ticked suggestions become features on their pages, and the rest stay offered
- **Entry / exit:** entry from the overview's attention line; exit by adding or Back to overview
- **Critical information, ordered:** pages with waiting suggestions; each suggestion's name and expected behavior; stale-review notes
- **Primary actions:** Add N features
- **Secondary actions:** Back to overview, untick a suggestion
- **Composition and hierarchy:** one group per page, a sticky action bar at the bottom
- **Interaction and feedback rules:** the count updates as boxes change; adding reports how many were added to how many pages
- **Normal state:** Tidepool with 14 suggestions on 4 pages
- **Empty state:** with nothing waiting the view returns to the overview
- **Long / maximum-content state:** AI Social Team scale: 95 suggestions on 25 pages, handled by the sticky bar
- **Loading state:** the overview line appears once suggestions load
- **Error / degraded / disabled state:** Add is disabled with nothing ticked; a failed load says so on the overview
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo
- **Surface-specific anti-slop risks:** nested cards inside cards, checkboxes too small to hit on a phone
- **Acceptance checks:**
  - `SG-1` — the Add button stays visible while scrolling a long list | Tidepool demo | 1440 × 900 | screenshot
  - `SG-2` — the list has no horizontal scrolling and checkboxes are easy to hit | Tidepool demo | 390 × 844 | screenshot
  - `SG-3` — each suggestion's expected behavior reads as secondary text under its name | Tidepool demo | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. The action scrolls out of reach
  2. Content scrolls sideways at 390 px
  3. Name and expected behavior run together
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-suggestions
- **Verdict:** Rework

---

## Surface: Navigation (sidebar and phone Pages sheet)

- **Register and usage moment:** product workspace chrome; used constantly to switch projects and pages
- **Primary user job:** find and open a page, and see each page's status at a glance
- **Observable successful outcome:** the person finds a page by name or status and opens it in one click
- **Entry / exit:** always visible on desktop; the Pages button opens it on a phone and Done or choosing a page closes it
- **Critical information, ordered:** product name; project picker; search; filters; pages by group with status dots
- **Primary actions:** open a page
- **Secondary actions:** Add project, search, filter, sort, Open product
- **Composition and hierarchy:** a grey source list with the brand at top and Open product at the bottom
- **Interaction and feedback rules:** the selected page is highlighted without a focus ring after a click; Escape closes the phone sheet
- **Normal state:** Tidepool demo
- **Empty state:** a filter with no matches says so
- **Long / maximum-content state:** Northwind with 60-character page names and a 52-character project name
- **Loading state:** renders with the project
- **Error / degraded / disabled state:** a search with no results says to try another
- **Default viewport:** 1440 × 900
- **Minimum viewport:** 390 × 844
- **Representative content:** Tidepool demo and the Northwind fixture
- **Surface-specific anti-slop risks:** truncated names without a tooltip, status dots with no accessible name
- **Acceptance checks:**
  - `NV-1` — long page names wrap to two lines beside their status dot | Northwind fixture | 1440 × 900 | screenshot
  - `NV-2` — the Pages sheet opens on a phone and lists every page | Tidepool demo | 390 × 844 | screenshot
  - `NV-3` — after clicking a page no focus ring remains on it | Tidepool demo | 1440 × 900 | screenshot
- **Explicit failure conditions:**
  1. A page name is cut off with no way to read it
  2. The phone sheet cannot be closed
  3. A focus ring remains after a mouse click
- **Evidence:**
  - normal @ default:
  - long/maximum @ default:
  - empty/degraded @ default:
  - normal @ minimum:
  - interaction before/after or recording:
- **Floor F1–F12:**
- **Locked-check results:**
- **Independent reviewer:** dogfood-review-navigation
- **Verdict:** Rework

---

## Completion packet

- Final surface inventory:
- Reviewer verdicts:
- Unresolved unknowns / risks:
- Check-change log:
- Final decision: Rework
