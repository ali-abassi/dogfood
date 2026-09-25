# Current outcome — mobile and desktop evidence, measured pages, one-step onboarding

Previous outcome (rename to dogfood, completion gate, MCP server, overview) shipped through `69d81e1`.

- **User-stated, 2026-09-25:** every page shows its mobile and desktop view. Review whether the sections track the right things in enough detail. Make onboarding a new project as easy as possible.

## Review findings that shaped this outcome (observed 2026-09-25)

- Only a desktop screenshot existed per page; no mobile evidence.
- Nothing was measured: every verdict was a typed note, while errors, failed requests, load time, search tags, security headers, and accessibility basics are free to collect from the page itself.
- Connections were mapped from source code, which produced unusable entries (a JavaScript template string as an endpoint).
- Accessibility was not tracked at all.
- Features were names only, with no statement of what "works" means.
- Onboarding meant hand-writing about 130 lines of JSON per page and taking screenshots yourself.

## Scope (agent-selected)

1. Manifest version 2: desktop and mobile captures, a scan record per page, an accessibility checklist, optional expected behavior per feature, optional page URL.
2. A scanner (agent-browser, desktop 1440 × 900 and mobile 390 × 844, both at scale 1) that measures the page and adds observed API calls to the connection map. Measured problems mark the page as needing work; a fresh scan is a completion requirement.
3. Onboarding from a URL through `npm run onboard`, the app's Add project form, or `dogfood_onboard_project`; rescans through `npm run scan`, the See page, or `dogfood_scan_page`.
4. UI: both screenshots side by side, scan results, Add project, a first-run welcome instead of an error.

## Acceptance

- Scanner proof: a fixture site with known defects is onboarded from its URL, and every defect is measured (16 checks).
- UI proof: both screenshots, scan results, Add project with progress, the welcome state, and phone layout (14 checks); the earlier UI and MCP proofs still pass.
- AI Social Team is rescanned signed in, with desktop and mobile evidence for every page.

## Not yet covered

- Feature lists and expected behavior are still written by people or agents; the scan does not propose them.
- The AI review reads only the desktop screenshot.
