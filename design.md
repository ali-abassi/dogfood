# dogfood design system

Revision 2, 2026-09-25. Supersedes the warm-canvas, green-action system of revision 1.

## Product and register

- **Product:** a local workspace for page-by-page QA of any web product.
- **User and moment:** a founder, designer, or agent checking a product's pages after a change or before a release.
- **Job:** see every page's status at a glance, open one page, and record or run the checks that prove it works.
- **Register:** compact desktop product workspace; a native-feeling macOS utility.

## Visual thesis

For people checking a product page by page, dogfood feels like a first-party macOS utility (Finder's source list, System Settings' grouped rows) so the next page to check and the proof behind each verdict are obvious in one glance. It prioritises calm legibility and state over decoration, expressed through a grey sidebar source list, one segmented control, white 12px groups on a soft canvas, and colour reserved for state. It succeeds when a person can name the page that needs work and its open issue within five seconds of opening the app.

## Reference ledger

| Exact source | Observe | Explain | Use | Avoid / depart |
|---|---|---|---|---|
| **User-stated:** the owner's Apple-clean design default for their products (2026-09-22) and its token file | #f5f5f7 canvas, white 12px groups, SF Pro 400–600, one blue pill per view, system colours only for state, a 4/8/12/16/24/32 scale. | A neutral field lets product content and state carry all the colour, so status reads instantly. | The tokens, radii, weights, and one-primary-action rule. | Depart: QA adds a status dot to every sidebar row, because page state is its core content; the capture panel shows the product's own colours. |
| The owner's reference implementation of that default, rendered at 1440 × 900 on 2026-09-25 | A full-height grey sidebar with rounded grey selection; large 32px title; content in white groups; one blue "Start" pill. | The sidebar owns navigation, so the content column can hold one object at a time. | Sidebar treatment and group rhythm. | Depart: QA puts sibling views in a toolbar segmented control, not in the page body, and pairs the evidence group with a sticky screenshot column. |
| [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Sidebars sit on the leading side for top-level collections; group hierarchy with sections; let people hide the sidebar. | Familiar placement means no learning cost. | Sectioned page groups in a leading source list; a Pages sheet replaces the sidebar on phones. | Avoid SF Symbols copies; QA uses text and state dots rather than an icon per row. |

## System

### Composition

- Desktop: 256px sidebar (brand, project, search, show and sort, page list, product link) and a content column with an opaque sticky toolbar holding the segmented view control.
- Content: route in mono, a 28px page title, one line of guidance, and the page status on the right; then the active view's group beside a sticky screenshot column. See page uses the full width.
- Phone (≤760px): the sidebar becomes a full-screen Pages sheet with a Done button; the segmented control takes its own full-width row with short labels ("Checks, Page, Review, Safety, Issues") while accessible names stay complete.

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

- Primary action: one blue pill per view (Run checks, Ask AI to review image, Review this page, Edit checks & connections, Save). Secondary: grey pill (Cancel). Tertiary: blue text (Resolve, Add issue, View full size).
- Status: pill with a dot and text; sidebar rows show the dot alone with the status as the accessible name and tooltip.
- Disclosures show a chevron that rotates when open.

### Brand

- The app icon is a blue squircle with a white magnifying lens holding a check: inspect, then approve. Files: `public/logo.svg` (also the favicon).
- Never recolour the icon or place it on another tile.

## Invariants

- **Always:** every page shows a status; every Pass or Needs work carries an evidence note; untested boundaries stay visible.
- **Never:** turn a passing test count or an AI rating into an overall score; use green or red for decoration; add a second filled blue button to a view.

## Decision ledger

- **User-stated, 2026-09-25:** QA (now dogfood) becomes a public repository with a clean logo and a design "like a Mac app, clean, crisp, purposeful". This revision implements that direction.
- **Agent-selected working policy, 2026-09-25:** Pages without selected tests open on My review, because an empty runner is not a useful first view. Pages with tests open on Run checks.
- **Agent-selected working policy, 2026-09-25:** The bundled demo is a fictional product so the public repository ships no private product data.
