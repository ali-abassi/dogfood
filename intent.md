# Current outcome — dogfood: agents complete page QA, people see it

Previous outcome (public repository with a macOS design) shipped in `bd5bc25`.

- **User-stated, 2026-09-25:** Rename the project to **dogfood**, an AI QA system (repository, folder, and app). Review and polish it: clean code.
- **User-stated, 2026-09-25:** People see QA visually: every page, the metrics that matter, a full-page screenshot, and a button to have AI validate things. Agents running QA fill in the details through an MCP server; a page's QA is not complete until the required steps are done.
- **User-stated, 2026-09-25:** AI Social Team is the active project using dogfood; re-capture its pages. Push verified work to `main`.

## Scope (agent-selected)

1. Rename: GitHub `ali-abassi/dogfood`, local `~/dogfood`, `DOGFOOD_DATA` / `DOGFOOD_PORT`, app and docs.
2. Clean code: one shared schema for the server, checker, and MCP; one domain store behind both the HTTP server and the MCP server; no duplicated rules.
3. Completion gate: a page's QA is complete only when every required step has evidence (see `lib/completion.mjs`). The gate is mechanical and identical in the app, the API, the MCP server, and the checker.
4. MCP server: agents list projects, register pages, attach captures, record verdicts, connections, and issues, run focused tests, and read what remains before QA can be complete.
5. Capture validity: reject screenshots whose content fills only part of the image (the device-pixel-ratio defect in the 2026-09-24 AI Social Team captures), then re-capture AI Social Team.
6. Overview: a project view showing every page's status, completion, open issues, and capture age.

## Acceptance

- `npm test` and `npm run check` pass from a clean clone; `npm run demo` still opens the Tidepool demo with no install step.
- An MCP client can drive one demo page from untested to complete, and every missing step is refused or listed until then.
- AI Social Team captures pass the validity rule and match the live site at 1440 × 900.
- The public repository contains no files from `data/`, no local paths, and no credentials.
