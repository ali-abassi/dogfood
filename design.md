# dogfood design system

Revision 5, 2026-09-26. Each page is a report card: screenshots, then six plain answers. Supersedes revision 4's tabs and requirement list; tokens, type, and brand carry over.

## Product and register

- **Product:** a local app that tells the owner of an app whether each page works.
- **User and moment (user-stated, 2026-09-26):** a non-technical person who built an app with an AI coding agent and wants to know if it is working; their agent fills dogfood in, and they open it to read the answer.
- **Job:** see each page on a computer and a phone, and know six things about it: does it look right, is its purpose clear, is it easy to use, is it safe, is it fast and findable, and does it work as expected.
- **Register:** a calm report in a native-feeling macOS utility; read far more than edited.

## Visual thesis

For a non-technical builder asking "is my app working?", dogfood feels like a checkup report in a first-party Mac utility: every page shows how it looks on a computer and a phone, then six plain answers with one clear mark each, so they know what is good and what to fix without meeting a technical word. It prioritises the answer over the process (checklists, scans, and attribution stay one tap behind each answer), expressed through large screenshots, six icon-led rows, grouped white panels on a soft canvas, and colour only for the answer. It succeeds when a person can say, within five seconds of opening a page, whether it works and which of the six things needs fixing.

## Reference ledger

| Exact source | Observe | Explain | Use | Avoid / depart |
|---|---|---|---|---|
| **User-stated:** the owner's Apple-clean design default for their products (2026-09-22) and its token file | #f5f5f7 canvas, white 12px groups, SF Pro 400–600, one blue pill per view, system colours only for state, a 4/8/12/16/24/32 scale. | A neutral field lets product content and state carry all the colour, so status reads instantly. | The tokens, radii, weights, and one-primary-action rule. | Depart: QA adds a status dot to every sidebar row, because page state is its core content; the capture panel shows the product's own colours. |
| The owner's reference implementation of that default, rendered at 1440 × 900 on 2026-09-25 | A full-height grey sidebar with rounded grey selection; large 32px title; content in white groups; one blue "Start" pill. | The sidebar owns navigation, so the content column can hold one object at a time. | Sidebar treatment and group rhythm. | Depart: QA puts sibling views in a toolbar segmented control, not in the page body, and pairs the evidence group with a sticky screenshot column. |
| [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Sidebars sit on the leading side for top-level collections; group hierarchy with sections; let people hide the sidebar. | Familiar placement means no learning cost. | Sectioned page groups in a leading source list; a Pages sheet replaces the sidebar on phones. | Avoid SF Symbols copies; QA uses text and state dots rather than an icon per row. |
| [Linear — Refero Styles](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1), rendered preview inspected 2026-09-25 | Dense task rows sit beside a narrow source list on a dark canvas; white text and small state marks carry the reading order. | Compact rows make many related objects scannable without turning each into a card. | Use grouped rows with a clear name, route, and state. | Avoid its dark palette, lime accent, and task-specific panels; dogfood keeps its Apple light/dark tokens and groups pages by site section, with completion details that open to their resolving view. |
| [PageSpeed Insights report](https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fwww.apple.com%2F&form_factor=mobile), rendered at 1440 × 900 on 2026-09-25 | One sentence leads ("Assessment: Passed"), only the verdict word coloured; measurements and diagnosis sit below. | A verdict first lets a person stop reading when it is good. | The overview's one-sentence answer and each answer's single mark and line. | Avoid its acronyms (LCP, INP, CLS) and gauges; dogfood says "Load time on a phone 1.8 s". |
| [GitHub Actions run summary](https://github.com/ali-abassi/dogfood/actions), rendered 2026-09-25 | A one-word status beside a large state icon; one row per check with an icon, a plain name, and one fact; each row opens its detail. | Icon-led rows scan in a column; detail stays one click away. | The six answer rows: mark, name, one-line answer, chevron to its detail. | Avoid developer vocabulary and log dumps; the detail explains evidence in plain words. |

## System

### Composition

- Desktop: 256px sidebar (brand, project, search, show and sort, Overview, grouped page list with a status mark each, product link) and a content column up to 1120px wide. There is no toolbar and no tabs.
- **Overview** answers "Is <app> working?" in one sentence (how many pages are good, need work, and are not fully checked), with Download report and the one blue Check all pages on the right. One white panel lists pages by site section; each row is the page name and route on the left and six marks under six short column headings (Looks, Purpose, Ease, Safety, Speed, Works) on the right. A changed page says "Changed since last check" in orange under its route.
- **Page report**: route, name, plain status, and quiet actions (Check again, Open page ↗, Remove page…) on one line; a screenshot panel with the computer screenshot wide and the phone screenshot narrow, both cropped to one height, with View full page and the Changed chip; then "Is this page working?" with six rows in fixed order: mark, name, one-line answer (ellipsis), an "AI" tag when the AI answered, and a chevron. Check with AI is the one blue button while the AI has not seen these screenshots. Everything fits in 1440 × 900.
- **Answer detail** (one per answer): a back link to the page, the answer name as the title, its question, the answer panel (big mark, word, full answer, where it came from and when, the pieces it is made of, Update answer), then the evidence in plain words: what the AI saw and would improve, measured facts ("Load time on a phone 1.8 s", "Page title Present: …"), the questions with their answers and an Answer questions form, and folded extras (design rules, protections the page asks browsers for).
- **Works as expected** adds Things you can do here (mark, name, what should happen, what was seen), the AI's suggested things with one Add button, Bugs (Report a bug is the blue button; each bug names how bad it is in words), what the page check found, automated tests when the page has them, and folded data connections.
- **Screenshots** view: back link, Computer | Phone switch, the full screenshot, then What changed (Before, Now, What changed) with "About N% of the page looks different".
- **Add an app / welcome**: the logo, "Is your app working?", one sentence of promise, the sentence to give a coding agent with Copy, then "Or add it here" with the address field.
- Phone (≤760px): a sticky bar with Pages; the sidebar becomes a full-screen sheet. The report stacks screenshots over answers; each answer row puts its one-line answer under its name. Overview rows put the six marks under the name, with a legend line above the panel.

### Typography

| Candidate | Behaviour | Decision |
|---|---|---|
| System SF Pro stack, 400–600, −0.01em body, −0.022em titles | Native Mac voice; hierarchy from size and weight only. | **Chosen.** Platform belonging is the thesis, the font is installed on every Mac, and no files ship. |
| IBM Plex Sans with Plex Mono labels | Technical, precise, slightly engineered. | Rejected: reads as a developer tool, not a native utility, and adds font files. |
| Serif display with sans UI | Editorial authority for page titles. | Rejected: competes with the captured product's own typography. |

Roles: large title 28px/600; group title 17px/600; section 15px/600; row 13.5–14.5px/400–500; meta 12–12.5px tertiary; route and IDs in SF Mono 12px.

### Colour roles

| Role | Light | Dark |
|---|---|---|
| Canvas | #f5f5f7 | #1e1e20 |
| Sidebar | #ebebef | #28282b |
| Group | #ffffff | #2c2c2e |
| Ink / secondary / tertiary | #1d1d1f / #6e6e73 / #86868b | #f5f5f7 / #aeaeb2 / #8e8e93 |
| Separator | #e5e5ea | #3a3a3c |
| Action (one filled pill per view, links, focus at 50%) | #0071e3 | #0a84ff |
| Pass / needs work / blocked | #248a3d / #d70015 / #b25000 | #30d158 / #ff453a / #ff9f0a |
| Untested / in review | hollow grey dot / filled grey dot | same |

### Rhythm, shape, material

- Spacing: 4/8/12/16/24/32. Groups 24px apart; page gutter 40px desktop, 16px phone.
- Radii: 12px groups and screenshot panel; 8px fields, notes, and callouts; 6–7px list rows and segments; fully rounded buttons and status pills; the app icon at 22%.
- Elevation: none on groups. Only the selected segment, popups, and the save toast carry a faint shadow; the toolbar has a 0.5px hairline.

### Components

- **Marks** carry state with shape as well as colour: ✓ Good (green), ! Needs work (red), ◐ Partly checked (grey fill), – Not checked (grey ring). Every mark has an accessible name such as "Safe: Not checked".
- **Words.** Good, Needs work, Partly checked, Not checked; page status adds Can’t open. Bugs: Breaks the app, Blocks this page, Annoying, Cosmetic (the P0–P3 codes stay in the data and the MCP tools). Devices are Computer and Phone. The report never shows requirement, verdict, audit, checklist, connection, or capture.
- **Actions.** One blue pill per view: Check with AI or Take screenshots on the report, Update answer or Answer questions on an answer, Report a bug on Works as expected, Check all pages on the overview. Secondary actions are grey pills; tertiary actions are blue text (Check again, View full page, Add a thing people can do). Remove page… is grey text and turns red on hover; its confirm button is red.
- **Sources.** Every answer says where it came from: From you, From <agent>, From the AI check of these screenshots, Measured by the page check, From the questions below, From trying the things you can do here, From the bugs below, or From an earlier answer that was not signed. A person's or agent's verdict outranks the AI's.
- Forms open inline in place of what they edit; an unchanged form closes quietly, a changed one asks Save or Discard.

### Brand

- The app icon is a blue squircle holding a white check mark drawn as a bone: "dogfood" and "checked" in one mark, legible at 16 px. Files: `public/logo.svg` and `public/favicon.svg` (identical). User-stated 2026-09-25: "make a sick logo for it"; chosen from six concepts on 2026-09-26.
- Never recolour the icon or place it on another tile.

## Invariants

- **Always:** every page shows its six answers in the same order; every Good or Needs work carries a note or a measurement; Not checked stays visible.
- **Never:** turn counts or an AI score into a page score; use green or red for decoration; add a second filled blue button to a view; show an internal term on the report.

## Decision ledger

- **User-stated, 2026-09-25:** QA (now dogfood) becomes a public repository with a clean logo and a design "like a Mac app, clean, crisp, purposeful". This revision implements that direction.
- **Agent-selected working policy, 2026-09-25:** Pages without selected tests open on My review, because an empty runner is not a useful first view. Pages with tests open on Run checks.
- **Agent-selected working policy, 2026-09-25:** The bundled demo is a fictional product so the public repository ships no private product data.
- **Agent-selected working policy, 2026-09-25:** Open the project overview first and keep page requirements in compact expandable chips below each page heading. This makes page status and remaining QA visible immediately while keeping detailed evidence and resolving views one activation away.
- **User-stated, 2026-09-25:** every page shows its mobile and desktop view, and onboarding a new project must be as easy as possible.
- **Agent-selected working policy, 2026-09-25:** See page shows both screenshots at once, because comparing the two layouts is the point; Scan again stays a grey pill so the AI review remains the view's one primary action; onboarding asks only for a URL, and the welcome state replaces the old "no projects" error so the first run starts working instead of failing.
- **Agent-selected working policy, 2026-09-25:** The AI review reads both screenshots and proposes the page's features, because onboarding leaves every feature list empty and judging both screens keeps the suggestions honest; adding them stays one explicit click so a person approves each feature before it becomes a QA requirement.
- **Agent-selected working policy, 2026-09-25:** visual changes are orange and informational, because dynamic pages change a little on every scan; "Changed since review" prompts a recheck without failing the page.
- **Agent-selected working policy, 2026-09-26:** project-level suggestions stay opt-in per item, checked by default, because a person still decides what the page is for.
- **User-stated, 2026-09-26:** a feature is something a person can do on the page, not an interface element ("a feature isn't clicking the menu item"). Every page answers five questions about its features: connected (working end to end), highlighted, obvious, accurate, and clear overall. They replace functionality, optimization, design fit, excess, and clarity; old verdicts are kept in `retiredChecks`, and speed is measured by the scan.
- **User-stated, 2026-09-26:** "think of the user as non technical, they want to know if their vibecoded application is working … there is so much on this page that is confusing." They need a skill so their agent can take dogfood and add their site with each page's criteria, and a UI showing each page on mobile and desktop with six answers: design consistency, clear purpose, easy to use and working, secure (scrape-free, hack-free), optimized for speed and search, and bug-free (the intended things work as expected). This supersedes the five questions about features.
- **Agent-selected working policy, 2026-09-26:** "easy to use and working" and "bug free" are split into Easy to use (finding and doing things, accessibility, phone layout) and Works as expected (each thing a person can do, bugs, errors), so each answer has one kind of evidence. Features remain the things a person can do on the page and live under Works as expected.
- **Agent-selected working policy, 2026-09-26:** the AI check counts as an answer for Looks right, Clear purpose, and Easy to use until a person or agent answers, and says so. A score of 7 or more is Good, because the prompt defines below 7 as "a visitor must guess or the page looks broken"; the reason still names any friction. Gemini scored the clean demo Home at 7–7.5, so a bar of 8 would have called almost every page Needs work.
- **Agent-selected working policy, 2026-09-26:** load time over 3 seconds on either device is Needs work (`slowLoadMs`), with a ponytail note to revisit once scans time real networks rather than localhost. Missing security headers are shown, not counted, because nearly every local development server lacks them.
- **Agent-selected working policy, 2026-09-26:** the page's tabs, requirement list, and checklist question editor are gone; agents still edit questions and connections through the MCP tools. Console warnings are no longer shown, since they were never counted and meant nothing to the owner.

