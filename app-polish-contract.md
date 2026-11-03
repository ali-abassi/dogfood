# Dogfood interface contract

Project: Dogfood app polish, authorized by Ali on 2026-09-29
Artifact/register: Responsive web product UI in a local single-user utility; no native desktop wrapper
Audience and usage context: Ali and coding agents planning, building and proving a web project; person inspects durable agent work
Design argument / generative thesis / taste read: Extend the user-approved Plan: a calm workbench where the selected project owns navigation, outcomes lead, and evidence is one step away. Keep native controls and expose one obvious next action.
Approved references + qualities to borrow: User-approved Dogfood Plan at http://127.0.0.1:4322/?project=dogfood&view=plan; Linear rendered preview at https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1 shows aligned compact navigation beside actual work; MDN native form styling https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Advanced_form_styling
Anti-references + failures to avoid: Current Dogfood selector puts the native glyph against the outer right edge; current Features empty state exposes MCP command; current Competitors repeats the same setup explanation; reject decorative dashboards, nested cards, fabricated metrics and hidden failures.
Source list / artifact manifest: /home/user/dogfood/design.md; /home/user/dogfood/vision.md; /home/user/dogfood/public/styles.css; /home/user/dogfood/public/js/views; /tmp/dogfood-before-overview.png; /tmp/dogfood-linear-reference.png; data/reviews/app-polish-2026-09-29
Direction decision (use / avoid / prove): use: platform system sans, 4/8/12/16/24 spacing, neutral canvas, grouped surfaces, single blue action and native selection. avoid: new framework, ornamental dashboard cards, copied Linear palette, long repetitive explanations. prove: actual 1280 and 390 views, keyboard paths, long content, errors, current task/page evidence.
Fixed constraints: No new runtime dependencies; preserve structured tasks, claims and acceptance semantics, existing projects and user sessions; no paid providers or external mutations in UI tests.
Non-goals: No orchestrator, hosted accounts, collaboration backend, paid provider activation or portfolio app changes.
Shared type / spacing / color / shape / imagery / motion rules: Platform-native sans wins over editorial serif (wrong reading density) and geometric display (unnecessary brand change). Keep system mono only for paths and checks. 28px view title, 17px group heading, 14-16px body, readable secondary text. 12px surface radius, 8px fields, pill actions. Color only for action/state; 4px spacing base; screenshots are the only content imagery. Respect reduced motion.
Shared interaction and feedback rules: Native button/link/select semantics, visible focus, honest loading/disabled labels, readable errors with retry, no implicit provider action, discard protection and focus return for forms.
Default viewport: 1280 by 900 CSS pixels, actual browser viewport
Minimum viewport: 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
Handoff path: app-polish-contract.md
Evidence directory: data/reviews/app-polish-2026-09-29
Locked checks version / date: v1 locked 2026-09-29 before presentation edits
Required reviewer assignments: One independent page/critical-flow reviewer for each named surface; separate cross-surface consistency reviewer; main agent verifies real web viewports and accepts final evidence. Native-window reviewer is unnecessary because this is web UI.

## Shared floor criteria

These are the unchanged UI floor checks used by the final evidence rows:

- F1: no horizontal overflow, clipped controls or overlapping content.
- F2: the primary job and next action are clear on entry.
- F3: readable type and WCAG A/AA text/control contrast in both themes.
- F4: named controls and visible focus.
- F5: actual keyboard use for native project selection and forms.
- F6: respect reduced motion; focus remains usable at 640 CSS pixels/DPR2.
- F7: normal, long, empty, loading and degraded states remain usable.
- F8: errors identify a cause and an actionable recovery.
- F9: saves, waits and selections give honest state feedback.
- F10: complete long content and evidence can be inspected.
- F11: actual native controls work without fabricated provider results.
- F12: actual web viewports at 1280 and 390 remain usable.

## Surface: navigation — Project navigation

- **Register and usage moment:** Local web workbench, select project and find work
- **Primary user job:** select project and find work
- **Observable successful outcome:** Project field has one indicator inset 12px, clear text and no extra icon
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Project name, primary sections, page search and status
- **Primary actions:** Native project selection and Menu
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Project field has one indicator inset 12px, clear text and no extra icon
- **Interaction and feedback rules:** Same project remains selected and its native control works from keyboard; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** No project data and zero search results
- **Long / maximum-content state:** Long Northwind project names and many page rows
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** No project data and zero search results; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long Northwind project names and many page rows; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `navigation-C1` — Project field has one indicator inset 12px, clear text and no extra icon | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `navigation-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `navigation-C3` — Same project remains selected and its native control works from keyboard; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/navigation/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/navigation/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/navigation/empty-default.png` and `data/reviews/app-polish-2026-09-29/navigation/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/navigation/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/navigation/normal-default.png`, `data/reviews/app-polish-2026-09-29/navigation/interaction-default.png`, `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/navigation/normal-default.png` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/navigation/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/navigation/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/navigation/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/navigation/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/navigation/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/navigation/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/navigation/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/navigation/empty-default.png`, `data/reviews/app-polish-2026-09-29/navigation/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/navigation/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/navigation/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/navigation-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/navigation/normal-default.json`, `data/reviews/app-polish-2026-09-29/navigation/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- navigation-C1 — PASS — `data/reviews/app-polish-2026-09-29/navigation-review.md`, `data/reviews/app-polish-2026-09-29/navigation/normal-default.png`
- navigation-C2 — PASS — `data/reviews/app-polish-2026-09-29/navigation-review.md`, `data/reviews/app-polish-2026-09-29/navigation/long-minimum-full.png`
- navigation-C3 — PASS — `data/reviews/app-polish-2026-09-29/navigation-review.md`, `data/reviews/app-polish-2026-09-29/navigation/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/navigation-review.md`
- **Verdict:** Pass

## Surface: overview — Project overview

- **Register and usage moment:** Local web workbench, know what is accepted and what needs fixing
- **Primary user job:** know what is accepted and what needs fixing
- **Observable successful outcome:** Counts match actual acceptance, with an obvious path to Plan
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Project purpose, acceptance counts, actionable findings, page coverage
- **Primary actions:** Open page report and Check all pages
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Counts match actual acceptance, with an obvious path to Plan
- **Interaction and feedback rules:** A page opens its own report and Download report produces Markdown; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Checkout-only app with no pages
- **Long / maximum-content state:** Mixed accepted, unchecked, blocked and changed pages
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Checkout-only app with no pages; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Mixed accepted, unchecked, blocked and changed pages; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `overview-C1` — Counts match actual acceptance, with an obvious path to Plan | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `overview-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `overview-C3` — A page opens its own report and Download report produces Markdown; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/overview/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/overview/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/overview/empty-default.png` and `data/reviews/app-polish-2026-09-29/overview/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/overview/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/overview/normal-default.png`, `data/reviews/app-polish-2026-09-29/overview/interaction-default.png`, `data/reviews/app-polish-2026-09-29/overview/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/overview/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/overview/normal-default.png` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/overview/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/overview/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/overview/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/overview/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/overview/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/overview/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/overview/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/overview/empty-default.png`, `data/reviews/app-polish-2026-09-29/overview/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/overview-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/overview/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/overview/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/overview/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/overview/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/overview/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/overview/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/overview-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/overview/normal-default.json`, `data/reviews/app-polish-2026-09-29/overview/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- overview-C1 — PASS — `data/reviews/app-polish-2026-09-29/overview-review.md`, `data/reviews/app-polish-2026-09-29/overview/normal-default.png`
- overview-C2 — PASS — `data/reviews/app-polish-2026-09-29/overview-review.md`, `data/reviews/app-polish-2026-09-29/overview/long-minimum-full.png`
- overview-C3 — PASS — `data/reviews/app-polish-2026-09-29/overview-review.md`, `data/reviews/app-polish-2026-09-29/overview/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/overview-review.md`
- **Verdict:** Pass

## Surface: vision — Vision document

- **Register and usage moment:** Local web workbench, understand the project intent
- **Primary user job:** understand the project intent
- **Observable successful outcome:** Readable measure and clear source, no technical setup command in the empty state
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Promise, audience, scope and definition of done
- **Primary actions:** Read intent and navigate to Plan
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Readable measure and clear source, no technical setup command in the empty state
- **Interaction and feedback rules:** Document content is fully readable and the plan is reachable; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Missing checkout document and failed read
- **Long / maximum-content state:** Long substantive project intent with headings and lists
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Missing checkout document and failed read; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long substantive project intent with headings and lists; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `vision-C1` — Readable measure and clear source, no technical setup command in the empty state | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `vision-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `vision-C3` — Document content is fully readable and the plan is reachable; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/vision/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/vision/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/vision/empty-default.png` and `data/reviews/app-polish-2026-09-29/vision/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/vision/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/vision/normal-default.png`, `data/reviews/app-polish-2026-09-29/vision/interaction-default.png`, `data/reviews/app-polish-2026-09-29/vision/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/vision/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/vision/normal-default.png` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/vision/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/vision/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/vision/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/vision/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/vision/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/vision/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/vision/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/vision/empty-default.png`, `data/reviews/app-polish-2026-09-29/vision/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/vision-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/vision/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/vision/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/vision/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/vision/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/vision/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/vision/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/vision-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/vision/normal-default.json`, `data/reviews/app-polish-2026-09-29/vision/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- vision-C1 — PASS — `data/reviews/app-polish-2026-09-29/vision-review.md`, `data/reviews/app-polish-2026-09-29/vision/normal-default.png`
- vision-C2 — PASS — `data/reviews/app-polish-2026-09-29/vision-review.md`, `data/reviews/app-polish-2026-09-29/vision/long-minimum-full.png`
- vision-C3 — PASS — `data/reviews/app-polish-2026-09-29/vision-review.md`, `data/reviews/app-polish-2026-09-29/vision/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/vision-review.md`
- **Verdict:** Pass

## Surface: guide — Design document

- **Register and usage moment:** Local web workbench, inspect the actual design direction
- **Primary user job:** inspect the actual design direction
- **Observable successful outcome:** Embedded guide has no clipped text or nested scrolling trap
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Brand identity, tokens, components, voice, motion, accessibility
- **Primary actions:** Inspect guide and Open full page
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Embedded guide has no clipped text or nested scrolling trap
- **Interaction and feedback rules:** Sandboxed guide fits and opens a complete standalone page; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Missing brand guide or read failure
- **Long / maximum-content state:** Real generated brand guide with long component copy
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Missing brand guide or read failure; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Real generated brand guide with long component copy; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `guide-C1` — Embedded guide has no clipped text or nested scrolling trap | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `guide-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `guide-C3` — Sandboxed guide fits and opens a complete standalone page; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/guide/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/guide/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/guide/empty-default.png` and `data/reviews/app-polish-2026-09-29/guide/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/guide/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/guide/normal-default.png`, `data/reviews/app-polish-2026-09-29/guide/interaction-default.png`, `data/reviews/app-polish-2026-09-29/guide/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/guide/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/guide/normal-default.png` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/guide/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/guide/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/guide/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/guide/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/guide/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/guide/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/guide/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/guide/empty-default.png`, `data/reviews/app-polish-2026-09-29/guide/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/guide-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/guide/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/guide/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/guide/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/guide/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/guide/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/guide/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/guide-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/guide/normal-default.json`, `data/reviews/app-polish-2026-09-29/guide/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- guide-C1 — PASS — `data/reviews/app-polish-2026-09-29/guide-review.md`, `data/reviews/app-polish-2026-09-29/guide/normal-default.png`
- guide-C2 — PASS — `data/reviews/app-polish-2026-09-29/guide-review.md`, `data/reviews/app-polish-2026-09-29/guide/long-minimum-full.png`
- guide-C3 — PASS — `data/reviews/app-polish-2026-09-29/guide-review.md`, `data/reviews/app-polish-2026-09-29/guide/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/guide-review.md`
- **Verdict:** Pass

## Surface: features — Feature coverage

- **Register and usage moment:** Local web workbench, know whether the product capabilities work
- **Primary user job:** know whether the product capabilities work
- **Observable successful outcome:** Explain what belongs here and point to page evidence without MCP jargon
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Capability, actual derived verdict, linked evidence pages
- **Primary actions:** Open linked page evidence
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Explain what belongs here and point to page evidence without MCP jargon
- **Interaction and feedback rules:** Linked capability pages open and derived state is honest; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** No core features and capability without linked pages
- **Long / maximum-content state:** Several multi-page capabilities with long outcomes
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** No core features and capability without linked pages; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Several multi-page capabilities with long outcomes; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `features-C1` — Explain what belongs here and point to page evidence without MCP jargon | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `features-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `features-C3` — Linked capability pages open and derived state is honest; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/features/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/features/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/features/empty-default.png` and `data/reviews/app-polish-2026-09-29/features/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/features/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/features/normal-default.png`, `data/reviews/app-polish-2026-09-29/features/interaction-default.png`, `data/reviews/app-polish-2026-09-29/features/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/features/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/features/normal-default.png` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/features/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/features/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/features/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/features/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/features/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/features/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/features/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/features/empty-default.png`, `data/reviews/app-polish-2026-09-29/features/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/features/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/features/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/features/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/features/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/features/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/features/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/features/features-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/features/normal-default.json`, `data/reviews/app-polish-2026-09-29/features/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- features-C1 — PASS — `data/reviews/app-polish-2026-09-29/features/features-review.md`, `data/reviews/app-polish-2026-09-29/features/normal-default.png`
- features-C2 — PASS — `data/reviews/app-polish-2026-09-29/features/features-review.md`, `data/reviews/app-polish-2026-09-29/features/long-minimum-full.png`
- features-C3 — PASS — `data/reviews/app-polish-2026-09-29/features/features-review.md`, `data/reviews/app-polish-2026-09-29/features/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/features/features-review.md`
- **Verdict:** Pass

## Surface: competitors — Competitor research flow

- **Register and usage moment:** Local web workbench, understand alternatives and keep actionable research
- **Primary user job:** understand alternatives and keep actionable research
- **Observable successful outcome:** One primary action, visible input label, no repeated explanatory block
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Name, website, scan freshness, summary, comparison, scanned pages
- **Primary actions:** Add and scan, then open saved research
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; One primary action, visible input label, no repeated explanatory block
- **Interaction and feedback rules:** Invalid input gets local feedback and saved research opens without paid calls; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** No competitors, no scan, stale summary, loading and failure
- **Long / maximum-content state:** Five long competitor records, long comparisons, partial failed scans
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** No competitors, no scan, stale summary, loading and failure; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Five long competitor records, long comparisons, partial failed scans; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `competitors-C1` — One primary action, visible input label, no repeated explanatory block | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `competitors-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `competitors-C3` — Invalid input gets local feedback and saved research opens without paid calls; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/competitors/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/competitors/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/competitors/empty-default.png` and `data/reviews/app-polish-2026-09-29/competitors/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/competitors/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/competitors/normal-default.png`, `data/reviews/app-polish-2026-09-29/competitors/interaction-default.png`, `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/competitors/normal-default.png` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/competitors/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/competitors/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/competitors/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/competitors/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/competitors/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/competitors/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/competitors/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/competitors/empty-default.png`, `data/reviews/app-polish-2026-09-29/competitors/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/competitors/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/competitors/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/competitors-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/competitors/normal-default.json`, `data/reviews/app-polish-2026-09-29/competitors/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- competitors-C1 — PASS — `data/reviews/app-polish-2026-09-29/competitors-review.md`, `data/reviews/app-polish-2026-09-29/competitors/normal-default.png`
- competitors-C2 — PASS — `data/reviews/app-polish-2026-09-29/competitors-review.md`, `data/reviews/app-polish-2026-09-29/competitors/long-minimum-full.png`
- competitors-C3 — PASS — `data/reviews/app-polish-2026-09-29/competitors-review.md`, `data/reviews/app-polish-2026-09-29/competitors/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/competitors-review.md`
- **Verdict:** Pass

## Surface: report — Page report

- **Register and usage moment:** Local web workbench, know whether a page works and what evidence is missing
- **Primary user job:** know whether a page works and what evidence is missing
- **Observable successful outcome:** All six answer rows fit 1280 by 900 in the representative normal report
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Page identity, accepted state, screenshots, six answers, findings
- **Primary actions:** Inspect an answer or full screenshots
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; All six answer rows fit 1280 by 900 in the representative normal report
- **Interaction and feedback rules:** Six answers open their detail and missing acceptance reasons remain readable; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Missing or failed captures and unchecked page
- **Long / maximum-content state:** Long page identity, evidence notes and multiple findings
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Missing or failed captures and unchecked page; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long page identity, evidence notes and multiple findings; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `report-C1` — All six answer rows fit 1280 by 900 in the representative normal report | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `report-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `report-C3` — Six answers open their detail and missing acceptance reasons remain readable; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/report/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/report/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/report/empty-default.png` and `data/reviews/app-polish-2026-09-29/report/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/report/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/report/normal-default.png`, `data/reviews/app-polish-2026-09-29/report/interaction-default.png`, `data/reviews/app-polish-2026-09-29/report/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/report/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/report/normal-default.png` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/report/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/report/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/report/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/report/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/report/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/report/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/report/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/report/empty-default.png`, `data/reviews/app-polish-2026-09-29/report/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/report/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/report/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/report/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/report/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/report/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/report/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/report/report-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/report/normal-default.json`, `data/reviews/app-polish-2026-09-29/report/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- report-C1 — PASS — `data/reviews/app-polish-2026-09-29/report/report-review.md`, `data/reviews/app-polish-2026-09-29/report/normal-default.png`
- report-C2 — PASS — `data/reviews/app-polish-2026-09-29/report/report-review.md`, `data/reviews/app-polish-2026-09-29/report/long-minimum-full.png`
- report-C3 — PASS — `data/reviews/app-polish-2026-09-29/report/report-review.md`, `data/reviews/app-polish-2026-09-29/report/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/report/report-review.md`
- **Verdict:** Pass

## Surface: answers — Answer and findings flow

- **Register and usage moment:** Local web workbench, read evidence and record a meaningful verdict or bug
- **Primary user job:** read evidence and record a meaningful verdict or bug
- **Observable successful outcome:** Complete notes and logs inspectable; Save is the sole primary action in edit mode
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Question, current verdict, why, authorship, checklist or functional findings
- **Primary actions:** Update answer, save checklist, report or resolve bug
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Complete notes and logs inspectable; Save is the sole primary action in edit mode
- **Interaction and feedback rules:** Save a meaningful verdict and reopen it; reject too-short evidence with focus preserved; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** No verdict, failed checks and refused form submission
- **Long / maximum-content state:** Long notes, many questions, multiple failures and native test logs
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** No verdict, failed checks and refused form submission; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long notes, many questions, multiple failures and native test logs; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `answers-C1` — Complete notes and logs inspectable; Save is the sole primary action in edit mode | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `answers-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `answers-C3` — Save a meaningful verdict and reopen it; reject too-short evidence with focus preserved; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/answers/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/answers/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/answers/empty-default.png` and `data/reviews/app-polish-2026-09-29/answers/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/answers/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/answers/normal-default.png`, `data/reviews/app-polish-2026-09-29/answers/interaction-default.png`, `data/reviews/app-polish-2026-09-29/answers/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/answers/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/answers/normal-default.png` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/answers/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/answers/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/answers/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/answers/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/answers/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/answers/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/answers/empty-default.png`, `data/reviews/app-polish-2026-09-29/answers/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/answers-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/answers/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/answers/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/answers/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/answers/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/answers/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/answers/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/answers-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/answers/normal-default.json`, `data/reviews/app-polish-2026-09-29/answers/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- answers-C1 — PASS — `data/reviews/app-polish-2026-09-29/answers-review.md`, `data/reviews/app-polish-2026-09-29/answers/normal-default.png`
- answers-C2 — PASS — `data/reviews/app-polish-2026-09-29/answers-review.md`, `data/reviews/app-polish-2026-09-29/answers/long-minimum-full.png`
- answers-C3 — PASS — `data/reviews/app-polish-2026-09-29/answers-review.md`, `data/reviews/app-polish-2026-09-29/answers/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/answers-review.md`
- **Verdict:** Pass

## Surface: screens — Screenshot inspector

- **Register and usage moment:** Local web workbench, inspect desktop and phone evidence in full
- **Primary user job:** inspect desktop and phone evidence in full
- **Observable successful outcome:** Viewport fits, complete image remains inspectable without losing controls
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Selected device, capture source and age, complete image
- **Primary actions:** Switch device, inspect full image, return to report
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Viewport fits, complete image remains inspectable without losing controls
- **Interaction and feedback rules:** Device switch works and return preserves the report flow; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Missing or blocked captures and changed screenshots
- **Long / maximum-content state:** Very tall screenshots and long page name
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Missing or blocked captures and changed screenshots; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Very tall screenshots and long page name; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `screens-C1` — Viewport fits, complete image remains inspectable without losing controls | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `screens-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `screens-C3` — Device switch works and return preserves the report flow; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/screens/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/screens/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/screens/empty-default.png` and `data/reviews/app-polish-2026-09-29/screens/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/screens/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/screens/normal-default.png`, `data/reviews/app-polish-2026-09-29/screens/interaction-default.png`, `data/reviews/app-polish-2026-09-29/screens/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/screens/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/screens/normal-default.png` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/screens/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/screens/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/screens/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/screens/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/screens/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/screens/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/screens/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/screens/empty-default.png`, `data/reviews/app-polish-2026-09-29/screens/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/screens-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/screens/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/screens/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/screens/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/screens/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/screens/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/screens/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/screens-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/screens/normal-default.json`, `data/reviews/app-polish-2026-09-29/screens/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- screens-C1 — PASS — `data/reviews/app-polish-2026-09-29/screens-review.md`, `data/reviews/app-polish-2026-09-29/screens/normal-default.png`
- screens-C2 — PASS — `data/reviews/app-polish-2026-09-29/screens-review.md`, `data/reviews/app-polish-2026-09-29/screens/long-minimum-full.png`
- screens-C3 — PASS — `data/reviews/app-polish-2026-09-29/screens-review.md`, `data/reviews/app-polish-2026-09-29/screens/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/screens-review.md`
- **Verdict:** Pass

## Surface: suggestions — Suggested capability flow

- **Register and usage moment:** Local web workbench, choose useful suggested capabilities without duplicating work
- **Primary user job:** choose useful suggested capabilities without duplicating work
- **Observable successful outcome:** No guessed acceptance, no lost selection on loading, mobile Add reachable
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Suggested outcome, page, existing inventory, provenance and freshness
- **Primary actions:** Review and add only checked suggestions
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; No guessed acceptance, no lost selection on loading, mobile Add reachable
- **Interaction and feedback rules:** Selection count updates and only chosen items persist in an isolated fixture; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** No suggestions, loading, stale evidence or request error
- **Long / maximum-content state:** Many long proposed capabilities across pages
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** No suggestions, loading, stale evidence or request error; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Many long proposed capabilities across pages; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `suggestions-C1` — No guessed acceptance, no lost selection on loading, mobile Add reachable | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `suggestions-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `suggestions-C3` — Selection count updates and only chosen items persist in an isolated fixture; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/suggestions/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/suggestions/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/suggestions/empty-default.png` and `data/reviews/app-polish-2026-09-29/suggestions/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/suggestions/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/suggestions/normal-default.png`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-default.png`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/normal-default.png` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/suggestions/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/suggestions/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/empty-default.png`, `data/reviews/app-polish-2026-09-29/suggestions/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/suggestions/normal-default.json`, `data/reviews/app-polish-2026-09-29/suggestions/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- suggestions-C1 — PASS — `data/reviews/app-polish-2026-09-29/suggestions-review.md`, `data/reviews/app-polish-2026-09-29/suggestions/normal-default.png`
- suggestions-C2 — PASS — `data/reviews/app-polish-2026-09-29/suggestions-review.md`, `data/reviews/app-polish-2026-09-29/suggestions/long-minimum-full.png`
- suggestions-C3 — PASS — `data/reviews/app-polish-2026-09-29/suggestions-review.md`, `data/reviews/app-polish-2026-09-29/suggestions/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/suggestions-review.md`
- **Verdict:** Pass

## Surface: onboarding — Add project flow

- **Register and usage moment:** Local web workbench, start working with an agent or check an existing app
- **Primary user job:** start working with an agent or check an existing app
- **Observable successful outcome:** Agent copy describes plan build QA resume; optional fields do not dominate
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Purpose, agent entry, URL, optional settings, progress and failures
- **Primary actions:** Copy agent instructions or Add and check
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Agent copy describes plan build QA resume; optional fields do not dominate
- **Interaction and feedback rules:** Invalid URL gives actionable feedback; optional settings preserve defaults; cancel returns; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** First run, running job, failed scan and invalid URL
- **Long / maximum-content state:** Long valid URL, name and provider failure explanation
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** First run, running job, failed scan and invalid URL; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long valid URL, name and provider failure explanation; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `onboarding-C1` — Agent copy describes plan build QA resume; optional fields do not dominate | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `onboarding-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `onboarding-C3` — Invalid URL gives actionable feedback; optional settings preserve defaults; cancel returns; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/onboarding/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/onboarding/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/onboarding/empty-default.png` and `data/reviews/app-polish-2026-09-29/onboarding/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/onboarding/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/onboarding/normal-default.png`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-default.png`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/normal-default.png` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/onboarding/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/onboarding/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/empty-default.png`, `data/reviews/app-polish-2026-09-29/onboarding/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/onboarding/normal-default.json`, `data/reviews/app-polish-2026-09-29/onboarding/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- onboarding-C1 — PASS — `data/reviews/app-polish-2026-09-29/onboarding-review.md`, `data/reviews/app-polish-2026-09-29/onboarding/normal-default.png`
- onboarding-C2 — PASS — `data/reviews/app-polish-2026-09-29/onboarding-review.md`, `data/reviews/app-polish-2026-09-29/onboarding/long-minimum-full.png`
- onboarding-C3 — PASS — `data/reviews/app-polish-2026-09-29/onboarding-review.md`, `data/reviews/app-polish-2026-09-29/onboarding/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/onboarding-review.md`
- **Verdict:** Pass

## Surface: plan — Plan continuity

- **Register and usage moment:** Local web workbench, continue scoped work without losing evidence
- **Primary user job:** continue scoped work without losing evidence
- **Observable successful outcome:** Preserve the layout Ali approved and the current source evidence rules
- **Entry / exit:** Project sidebar or related report action; return through sidebar or Back
- **Critical information, ordered:** Current outcome, next task, owner, receipt and blockers
- **Primary actions:** Add, claim, verify, accept, edit and recover
- **Secondary actions:** Related navigation, full detail and Cancel; destructive actions remain explicit
- **Composition and hierarchy:** Shared heading and short lede, useful grouped content below, supporting metadata recedes; Preserve the layout Ali approved and the current source evidence rules
- **Interaction and feedback rules:** Existing eight Plan acceptance checks continue to pass; visible focus and readable failures
- **Normal state:** Representative isolated real-rendered fixture with substantive saved content
- **Empty state:** Empty plan, failed receipt, abandoned owner and source change
- **Long / maximum-content state:** Long outcomes, dependencies and bounded command output
- **Loading state:** Controlled fixture uses visible pending state with actions disabled where duplicate work is unsafe
- **Error / degraded / disabled state:** Empty plan, failed receipt, abandoned owner and source change; clear explanation and recovery path, never fabricated success
- **Default viewport:** 1280 by 900 CSS pixels, actual browser viewport
- **Minimum viewport:** 390 by 844 CSS pixels; also check 640 CSS pixels at DPR2 for equivalent reflow
- **Representative content:** Long outcomes, dependencies and bounded command output; real Dogfood data plus isolated fixture variants, clearly labeled fixtures
- **Surface-specific anti-slop risks:** Do not repeat instructions, add decorative icons/cards, expose API names to people or hide complete content
- **Acceptance checks:**
  - `plan-C1` — Preserve the layout Ali approved and the current source evidence rules | normal isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `plan-C2` — Complete long content is inspectable without horizontal overflow or clipped controls | long/maximum isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
  - `plan-C3` — Existing eight Plan acceptance checks continue to pass; empty and failures give actionable feedback | interaction and empty/degraded isolated fixture | 1280 by 900 and 390 by 844 | screenshots and interaction probe log
- **Explicit failure conditions:**
  1. Critical job or next action is not understandable on entry.
  2. Overflow, unreadable state text, unnamed controls or broken keyboard path.
  3. Action fails, loses data or silently claims unsupported evidence.
- **Evidence:** Actual rendered local fixture states and native controls; provider effects excluded.

- **normal @ default:** `data/reviews/app-polish-2026-09-29/plan/normal-default.png`
- **long/maximum @ default:** `data/reviews/app-polish-2026-09-29/plan/long-default-full.png`
- **empty/degraded @ default:** `data/reviews/app-polish-2026-09-29/plan/empty-default.png` and `data/reviews/app-polish-2026-09-29/plan/degraded-default.png`
- **normal @ minimum:** `data/reviews/app-polish-2026-09-29/plan/normal-minimum.png`
- **interaction before/after or recording:** `data/reviews/app-polish-2026-09-29/plan/normal-default.png`, `data/reviews/app-polish-2026-09-29/plan/interaction-default.png`, `data/reviews/app-polish-2026-09-29/plan/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/plan/interaction-proof-minimum.json`
- F1 — PASS — `data/reviews/app-polish-2026-09-29/all-surface-proof.json` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F2 — PASS — `data/reviews/app-polish-2026-09-29/plan/normal-default.png` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F3 — PASS — `data/reviews/app-polish-2026-09-29/plan/axe-light-default.json`, `data/reviews/app-polish-2026-09-29/plan/axe-dark-default.json`, `data/reviews/app-polish-2026-09-29/plan/axe-light-minimum.json`, `data/reviews/app-polish-2026-09-29/plan/axe-dark-minimum.json`, `data/reviews/app-polish-2026-09-29/answers/status-contrast.json` and `data/reviews/app-polish-2026-09-29/screens/status-contrast.json`
- F4 — PASS — `data/reviews/app-polish-2026-09-29/plan/retina-reduced-motion.json` and `data/reviews/app-polish-2026-09-29/final-floor-proof.log`
- F5 — PASS — `data/reviews/app-polish-2026-09-29/navigation/keyboard-default.json`, `data/reviews/app-polish-2026-09-29/navigation/keyboard-minimum.json`, `data/reviews/app-polish-2026-09-29/report/all-six-keyboard-default.json` and `data/reviews/app-polish-2026-09-29/onboarding/keyboard-validation-minimum.json`
- F6 — PASS — `data/reviews/app-polish-2026-09-29/plan/retina-reduced-motion.png`, `data/reviews/app-polish-2026-09-29/plan/retina-reduced-motion.json`
- F7 — PASS — `data/reviews/app-polish-2026-09-29/plan/empty-default.png`, `data/reviews/app-polish-2026-09-29/plan/degraded-minimum.png`, `data/reviews/app-polish-2026-09-29/plan-review.md`
- F8 — PASS — `data/reviews/app-polish-2026-09-29/plan/degraded-minimum.png` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F9 — PASS — `data/reviews/app-polish-2026-09-29/plan/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/plan/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F10 — PASS — `data/reviews/app-polish-2026-09-29/plan/long-minimum-full.png` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F11 — PASS — `data/reviews/app-polish-2026-09-29/plan/interaction-proof-default.json`, `data/reviews/app-polish-2026-09-29/plan/interaction-proof-minimum.json` and `data/reviews/app-polish-2026-09-29/plan-review.md`
- F12 — PASS — `data/reviews/app-polish-2026-09-29/plan/normal-default.json`, `data/reviews/app-polish-2026-09-29/plan/normal-minimum.json`, `data/reviews/app-polish-2026-09-29/all-surface-proof.json`
- plan-C1 — PASS — `data/reviews/app-polish-2026-09-29/plan-review.md`, `data/reviews/app-polish-2026-09-29/plan/normal-default.png`
- plan-C2 — PASS — `data/reviews/app-polish-2026-09-29/plan-review.md`, `data/reviews/app-polish-2026-09-29/plan/long-minimum-full.png`
- plan-C3 — PASS — `data/reviews/app-polish-2026-09-29/plan-review.md`, `data/reviews/app-polish-2026-09-29/plan/interaction-proof-minimum.json`
- **Independent reviewer:** Non-implementing surface reviewer; `data/reviews/app-polish-2026-09-29/plan-review.md`
- **Verdict:** Pass

## Completion packet

- Final surface inventory: navigation, overview, vision, guide, features, competitors, report, answers, screens, suggestions, onboarding, plan
- Reviewer verdicts: `data/reviews/app-polish-2026-09-29/navigation-review.md`, `data/reviews/app-polish-2026-09-29/overview-review.md`, `data/reviews/app-polish-2026-09-29/vision-review.md`, `data/reviews/app-polish-2026-09-29/guide-review.md`, `data/reviews/app-polish-2026-09-29/features/features-review.md`, `data/reviews/app-polish-2026-09-29/competitors-review.md`, `data/reviews/app-polish-2026-09-29/report/report-review.md`, `data/reviews/app-polish-2026-09-29/answers-review.md`, `data/reviews/app-polish-2026-09-29/screens-review.md`, `data/reviews/app-polish-2026-09-29/suggestions-review.md`, `data/reviews/app-polish-2026-09-29/onboarding-review.md`, `data/reviews/app-polish-2026-09-29/plan-review.md`; cross-surface consistency Pass in `data/reviews/app-polish-2026-09-29/consistency-release-recheck.md` and `data/reviews/app-polish-2026-09-29/consistency-followups-review.md`; daily-workflow Pass in `data/reviews/app-polish-2026-09-29/workflow-recheck-review.md`.
- Unresolved unknowns / risks: none
- Check-change log: Locked C1-C3 IDs unchanged. MCP baseline proof now requires a real scan before attribution; human screenshot staleness follows actual visual changes, with recompression and noise regressions. New native Plan failed-save regression verifies raw draft, selections and retry feedback through unrelated renders, clears the previous error while retrying, and verifies successful persistence. Twelve full axe caption-context variants cover Live, Mock and configured remote labels.
- Final decision: Pass

Known scope boundary: local tool and explicitly synthetic UI/provider fixtures; paid integrations, real authenticated Chrome and remote production revision proofs are outside this release.
