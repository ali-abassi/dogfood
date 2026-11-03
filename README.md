<p align="center"><img src="public/logo.svg" width="96" height="96" alt="dogfood app icon"></p>

<h1 align="center">dogfood</h1>

<p align="center"><strong>Plan your app, direct your agents, and see what is actually proven.</strong> A local workspace for discovery, reviewed scope, native agent conversations, page feedback and evidence-backed acceptance.</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img src="docs/screenshot-light.png" alt="dogfood's overview of the Tidepool demo: one sentence saying how many pages are good, then every page with six marks for its six answers">
</picture>

Terminal controls for native requests and installation checks are in the [CLI guide](docs/cli.md). Run `dogfood doctor --project YOUR_PROJECT --require-agents` to verify the local request setup.

## Start with an idea or an existing app

Choose **New idea** to create a managed local Git workspace and enter Discovery. Work through the
questions yourself or ask your native agent for the next material questions. Save the intended
users, journey, boundaries, pages/features and required proof, then review the scope. A new project's
first build requires real Vision/Plan documents, the current review and those documents in committed
source. The explicit **Save reviewed scope baseline** action commits only unchanged managed drafts;
it refuses unrelated or staged work. Later ordinary implementation edits do not revoke scope review.
Existing apps can be connected without pretending they completed discovery.

The **Product map** follows actual page → feature → task → request → evidence links. Optional saved
Graphify context is read locally and bounded to files in linked task scope; stale graphs are labeled
historical. It does not run extraction or invent code dependencies. See [Discovery and scope review](docs/discovery.md).

## Plan → build → verify → resume

Install the CLI once with `npm link` from the Dogfood checkout, or invoke `node /absolute/path/to/dogfood/bin/dogfood.mjs` directly. Connect an existing checkout before a website exists:

```sh
cd /path/to/my-project
dogfood init --checkout . --id my-app --name "My App"
dogfood context --json
```

`init` is idempotent. `doctor` checks the local setup; browser and model usage are optional for planning. Add tasks with a concrete outcome, scope, dependencies and real check commands:

```json
{"id":"booking","title":"Save a booking","outcome":"The saved booking survives reload","scope":["src/booking"],"checks":[{"id":"booking","command":["npm","test"]}]}
```

Save that as `task.json`, then:

```sh
dogfood task add --input task.json --agent codex
dogfood next --json
dogfood task claim booking --agent codex
# Build the task, finish edits/commits, and check the real user outcome.
dogfood verify booking --agent codex
dogfood task accept booking --agent codex
```

Checks run as explicit argument arrays in the registered Git checkout, without shell parsing. Receipts are bound to the plan and current source files; changes during or after verification require a new run. A linked `pageIds` list requires those pages to pass acceptance as well. Unnamed tasks receive stable `task-N` IDs. Dependencies and atomic claims keep agents on available work. Record a blocker or handoff with `task update --input changes.json`; `releaseOwner:true` releases your claim. An abandoned claim can be recovered explicitly with `releaseOwner:true` plus a `recoveryReason`; the recovery is recorded and clears its receipt. Checks can set `timeoutSeconds` (1–1800, default 300), and output is kept as bounded tails rather than stopping a noisy test.

The **Plan** view shows current work, available work, blockers and receipts, with the milestone document folded below. **Send to agent** links the selected task to a native request; **Work myself** claims it for you. Overview and `context --json` include pending requests and the next action alongside planned work and QA gaps, so a fresh session can resume without the earlier chat. Tasks live once in `data/workflows/`; Markdown holds product intent and design rather than a competing status ledger. `--input -` reads JSON from stdin, `schema TOOL` shows the exact contract, and `tool TOOL --input file.json` exposes every underlying MCP operation.

Use `attach-url URL` once the app runs, then register its pages with the existing QA tools. `onboard` creates a new project; do not use it to replace a checkout-first plan.

**Checked and accepted are different.** `dogfood gate` requires every feature/checklist item to have a verdict and a successful current scan. Recorded failures can finish an audit. `dogfood gate --accept` additionally requires six Good answers, no open findings and fresh checkout/environment provenance. Latest failed scans block earlier evidence; backend-only changes invalidate current checkout claims. Older evidence stays readable and must be refreshed before acceptance. A remote URL must explicitly declare `servesCheckout:true` (CLI `attach-url URL --serves-checkout`) to accept checkout-linked evidence; only make that declaration after verifying its build. Loopback is inferred; verify the local server actually runs the registered checkout, especially when multiple worktrees run on different ports. Attach the project URL before page acceptance; page-specific URLs must use that environment's origin. This declaration is not independent deployment proof. Acceptance proves the configured checks and recorded page evidence, not deployment or untested integrations.

## Six answers for every page

| | The question | How it is answered |
|---|---|---|
| **Looks right** | Does it look finished and match the rest of the app? | An AI check of both screenshots against your design rules, or your own verdict |
| **Clear purpose** | Is it clear why this page exists? | The AI check, or your verdict |
| **Easy to use** | Can people find and do things easily, on a phone and a computer? | The AI check or your verdict, measured sideways scrolling and unnamed buttons, and accessibility questions |
| **Safe** | Is it protected from hackers and from people copying its data? | Security and scraping questions answered from the code |
| **Fast & findable** | Does it load quickly and show up properly in search? | Measured load time and search questions |
| **Works as expected** | Does everything you can do here work, with no bugs? | Someone tries each thing a person can do there; open bugs and errors the page check found |

Each answer is **Good**, **Needs work**, **Partly checked**, **Not checked**, **Recheck**, or **Blocked**, and opens to show where it came from: you, a named agent, the AI, or a measurement. A person's or agent's verdict outranks the AI's, every Good or Needs work carries a note saying what was seen, and nothing unproven is shown as good.

Use the sidebar search to find a page by its name, group, route, page ID, something you can do there, or an open bug's ID or title. Words can appear in any order: `invoice download` finds a page with “Download invoice.” Case, extra whitespace and accents don't prevent matches. Every word must match the same page; punctuation stays literal, and resolved bugs are excluded. The selected filter and sort still apply.

## Give an agent work from the board

Open **Agent board**, choose Claude Code or Codex and describe the outcome. Link a planned task,
page or feature, then save it for later or explicitly **Create & start**. Discovery and page-QA
requests use the same durable conversations with distinct authority from implementation.

The board uses [PAL](https://github.com/ali-abassi/pal) and the native agent's existing sign-in.
Run `dogfood doctor --project YOUR_PROJECT --require-agents` to check local tooling and the running
dispatcher. The native context includes the stable project ID, linked outcome/scope/checks and
browser contract. Set the server's `DOGFOOD_BROWSER_SESSION` and `DOGFOOD_BROWSER_PROFILE` to the
operator's existing preview; missing browser setup is reported rather than replaced with a new profile.

Each request uses an isolated worktree from committed source. Explicit feedback continues the same
session, notes do not launch work, and in-flight feedback waits for the next turn. **Inspect changes**
shows bounded patches/new files and inert HTML snapshots. **Apply reviewed changes to source** stages
that exact inspected change set against a clean matching base. **Save reviewed changes** makes an
explicit local commit of the unchanged reviewed staging, ready for source checks and page QA.
These actions preserve unrelated work and do not push or deploy. Native requests lack authority to approve or integrate their own work; recognized native contexts are refused by the operator tools. **Mark reviewed & done** only closes the request.

Page screenshots also support **Pin feedback**: the position, device, immutable screenshot revision,
finding and native request stay connected. Resolve it with a fresh retest note; page acceptance is
still separate. See [the agent-board contract](docs/agent-board.md).
This is a trusted single-user local workbench. Native-context guards prevent accidental self-approval; they do not sandbox code running with the same OS user and local API access.

## With your coding agent

Give your agent (Claude Code, Codex, Cursor, or any agent that can run a shell) this sentence:

> Set up dogfood from https://github.com/ali-abassi/dogfood and follow its skills/dogfood/SKILL.md to plan, build and verify my project.

The [skill](skills/dogfood/SKILL.md) walks it through setting dogfood up, adding your app, writing down what people can do on each page, trying each one in a real browser, answering the six questions, and reporting back in plain words. You then open the app to see the result.

## Try the demo

Requires Node 20 or newer. There are no dependencies to install.

```sh
git clone https://github.com/ali-abassi/dogfood.git
cd dogfood
npm run demo
```

Open <http://127.0.0.1:4321>. The demo is **Tidepool**, a fictional swim school whose five pages show every state. Open a page to see its screenshots and six answers:

<img src="docs/screenshot-page.png" alt="The demo's Book a lesson page: the computer and phone screenshots side by side, then the six answers, three of them needing work">

## Use it yourself

Add your app from the app's **Add an app** form, the CLI, or an MCP call:

```sh
npm run onboard -- https://site.example
```

Onboarding finds same-site pages from rendered links and `/sitemap.xml`, registers them, and records a validated full-page desktop and mobile screenshot plus measured page facts. It can scan up to 50 pages. Install the browser once with `npm i -g agent-browser`. To scan signed-in pages, pass a Chrome profile such as `Default` with `npm run onboard -- https://site.example --profile Default` or the `browserProfile` field in the app or MCP tool. Add `--ai-review` (the checkbox in the app, or `confirmAiReviewUsage` in `dogfood_onboard_project`) to also run the AI check on every page, so each arrives with answers for Looks right, Clear purpose, and Easy to use, and suggestions for what people can do there; it uses the configured paid provider and records usage/cost. Check every page again after a deploy with the overview's **Check all pages** button, `npm run scan -- <project-id>`, or `dogfood_scan_project`; each reports which pages look different since the previous check. A page counts as changed when its screenshot size changed or more than 0.5% of pixels differ (`changeThreshold` in `lib/diff.mjs`). Good answers with evidence older than the last visual change read Recheck until they are answered again; list page IDs to check only those pages.

`npm run report -- <project-id> > report.md` writes a shareable Markdown summary: what needs work first, every page's six answers, open bugs, and what the evidence does not prove.

`npm run gate -- <project-id> [page-id ...]` applies the same completion gate as `dogfood_complete` from the command line: it exits 0 only when every named page (or every page) is complete, 1 with each page's missing evidence when one is not, and 2 for an unknown project or page. Other tools can require page QA with it; an agent runner can run it after every worker turn.

Upgrading from an earlier dogfood? Run `npm run migrate` once. It moves projects to the six answers and the current data version, keeps old verdicts that no longer count on record under `retiredChecks`, and leaves any outside-edit warning in place.

Use CLI/MCP operations to register projects and record evidence. [`demo/projects/tidepool.json`](demo/projects/tidepool.json) documents the manifest format; do not manually edit live registry/workflow files.

`data/` is git-ignored, so your projects, screenshots, runs, and reviews stay on your machine. Set `DOGFOOD_DATA` to keep them elsewhere, and `DOGFOOD_PORT` to change the port.

### Automated tests

List a page's test files under `qa.tests` in the manifest, and point `source.checkout` at your repository. **Works as expected → Run tests** then runs only those files with your project's installed Vitest (`node_modules/.bin/vitest`, `src/**/*.test.ts(x)`), stores each report under `data/runs/`, and counts the result in the answer.

### Each page

A page's report shows its full-page computer and phone screenshots in frames you scroll top to bottom. **History** steps back through every day the page was captured (dogfood keeps each replaced screenshot under `data/captures/<project>/history/`; `GET /api/projects/<id>/pages/<page>/history` lists them). **About this page** gives what the page is for (from the AI check), its title and search description, the features on it with their status, every link on it split into this site and elsewhere, and the API calls it makes, from the code map and from the traffic each page check records.

### The QA agent

**Ask the QA agent** opens a durable native `qa` request with the page's actual evidence gaps and
selected browser contract. Follow its state, answer questions, stop or continue it from Agent board.
QA records findings and evidence; it does not edit application source or accept tasks. A URL-only
project uses a labeled audit workspace and does not claim to know the deployed source revision.
`DOGFOOD_QA_BACKEND` can prefer `codex` or `claude`. Old custom `DOGFOOD_QA_AGENT` commands are no
longer executed, and their launch receipts remain historical. No arbitrary runner command is needed.

### Competitors

Each project keeps up to five competitors. Add one by its website and dogfood reads its key pages as a signed-out visitor (the landing page, then pricing, features, product and about pages before anything else), keeping full-page computer and phone screenshots, each page's title, description and headings, and its text. **Summarize with AI** sends that text (no screenshots) with the project's `vision.md` to DeepSeek (`deepseek-flash`) and records what they do, who it is for, pricing, how they sell, key features, and how they compare with the project. It uses the configured provider after an explicit summary action. Competitors live in `data/competitors/<project>.json`, and their screenshots under `data/captures/<project>/competitors/`.

### The AI check

**Check with AI** sends available page captures and a compact visual contract to the configured
DeepSeek provider. The contract includes design rules, available `design.json` brand context,
page intent/features, actual device coverage and prompt/schema versions. Feedback describes visible
problems and suggests user-facing capabilities; it cannot prove backend behavior or security.
A partial desktop-only opinion is labeled partial and cannot supply cross-device Good answers.

Set `DEEPSEEK_API_KEY` in the server environment or git-ignored `.env` when using this optional paid
review. Usage and estimated cost are recorded with the result. Freshness binds the captures and the
judgment contract: changed rules, brand context, device coverage or prompt version require recheck.
On upgrade, older AI reviews remain readable but may become historical; rerunning a paid review is
an explicit action. Human and agent verdicts remain separate evidence.

### Agents (MCP)

Run `node mcp.mjs` as a dependency-free stdio MCP server so an agent can add apps, collect evidence, run tests, and see exactly what remains before a page is done. Register it with Claude Code using `claude mcp add --scope user dogfood -- node /absolute/path/to/dogfood/mcp.mjs`. An agent whose client has not loaded it yet can call any tool once from a shell: `node mcp.mjs dogfood_next '{"project":"my-app"}'`.

Page-writing tools return that page's status, its six answers, and what it still needs, each naming the tool that resolves it; issue creation also returns the new issue ID. Project creation returns a compact project summary.

Workflow tools include `dogfood_start_project`, `dogfood_project_readiness`, `dogfood_save_brief`,
`dogfood_review_scope`, `dogfood_create_project_documents`, `dogfood_save_scope_baseline` and
`dogfood_project_map`. Native conversations use `dogfood_agent_board`, `dogfood_agent_card`,
`dogfood_agent_request`, `dogfood_agent_comment`, `dogfood_agent_changes` and `dogfood_agent_action`.
Screenshot feedback uses `dogfood_annotations`, `dogfood_add_annotation`,
`dogfood_annotation_request` and `dogfood_resolve_annotation`. Inspect exact schemas with
`dogfood schema TOOL`; source-writing/review actions require the operator's explicit authorization.

- `dogfood_projects` — list projects and completed page counts.
- `dogfood_report` — a Markdown QA report: what needs attention, every page's gaps, open issues, and what is not proven.
- `dogfood_remove_page` — remove a page registered by mistake, with a reason kept on record.
- `dogfood_onboard_project` — find and scan every same-site page from one URL.
- `dogfood_scan_page` — rescan a registered page at desktop and mobile sizes.
- `dogfood_scan_project` — rescan every page of a project and list which pages changed visually since the previous scan.
- `dogfood_create_project` — create a project with its URL, environment, checkout, and guidelines.
- `dogfood_set_browser_profile` — point a project's scans at a Chrome profile that is signed in, when a saved session expired.
- `dogfood_register_page` — register a page, its features, tests, and untested boundary.
- `dogfood_add_features` — add features to a page, for example ones the AI review suggested; names already listed are skipped.
- `dogfood_set_core_features` — set the project's core features (its main capabilities, each mapped to the pages that deliver it); the app's Features tab shows each one with a status rolled up from its pages.

- `dogfood_competitors` — list the project's competitors with their AI summaries, pages, and screenshot files.
- `dogfood_add_competitor` — add a competitor by its website and scan its key pages (at most five per project).
- `dogfood_scan_competitor` — rescan a competitor's key pages.
- `dogfood_summarize_competitor` — have the AI summarize a scanned competitor and compare it with the project's vision.
- `dogfood_record_competitor_summary` — record a summary the agent wrote itself from the scanned pages, at no provider cost.
- `dogfood_page` — read a page and its derived QA progress.
- `dogfood_next` — list incomplete pages in site order with missing evidence.
- `dogfood_record_capture` — attach a validated full-page PNG or record a capture blocker; prefer `dogfood_scan_page` for both devices and measured facts.
- `dogfood_record_verdicts` — record partial verdicts with evidence: `checks` (design, purpose, ease), `features`, and checklist questions (`audit`).
- `dogfood_set_connections` — map the page request and its API/data exchanges.
- `dogfood_set_checklist` — edit checklist questions while preserving connections.
- `dogfood_add_issue` — record a reproducible issue and optional capture evidence.
- `dogfood_resolve_issue` — resolve an issue with retest evidence.
- `dogfood_run_tests` — run the page's configured focused tests.
- `dogfood_ai_review` — run the AI check after confirming provider usage.
- `dogfood_complete` — check that a page's screenshots and page check are current, all six answers are answered, and no blocking bug is open.

A page is not complete until `dogfood_complete` confirms the audit is complete; agents must call it before reporting the audit as done. Use `dogfood_accept_page` or `dogfood gate --accept` before reporting acceptance.

Each project's Docs view shows `vision.md`, `design.html` (the brand guide) and `plan.md` from its current working checkout. Generate a brand guide from a project's `design.json` and logo with `python3 scripts/brand-guide.py design.json logo.svg design.html "Name" "One-line promise"`.

## How it works

- `server.mjs` is a dependency-free Node server bound to `127.0.0.1`. It rejects cross-origin writes and serves the app and its API.
- `lib/` holds everything the server and agents share: `schema.mjs` (the manifest vocabulary), `store.mjs` (every validated read and write), `answers.mjs` (the six answers), `completion.mjs` (when a page's QA is complete), `capture.mjs` (screenshot validity), `scans.mjs` (validating measured facts), `scanner.mjs`, `discover.mjs`, and `onboard.mjs` (the browser side of scanning and onboarding), `test-runs.mjs`, and `visual-review.mjs`.
- `public/` is the interface: plain HTML, CSS, and ES modules under `public/js/` with light and dark themes.
- `skills/dogfood/SKILL.md` is the skill a coding agent follows to check an app with dogfood.

### When is a page done?

A page is done only when its validated full-page computer and phone screenshots are current, a page check matches them, all required feature/checklist rows and six answers are answered (Good or Needs work, not Partly checked, Recheck or Not checked), and no bug that breaks the app or blocks the page is open. A page is **Good** only when it is done and all six answers are Good. Problems the page check measures (crashes and failed requests under Works as expected, sideways scrolling and unnamed buttons under Easy to use, a load over 3 seconds under Fast & findable) make their answer Needs work.

## Development

- `npm test` runs the unit tests; `npm run check` validates syntax and the demo manifest; `npm run lint` keeps every function at cyclomatic complexity 5 or less.
- `npm run test:acceptance` runs the end-to-end suites in `tests/acceptance/`. All but the MCP suite drive a real headless browser, so they need agent-browser. Set `DOGFOOD_RECORD_DIR` to keep a video of the report-card suite, which walks through the whole app the way a person would. CI keeps that video and every suite's result with each run, so anyone can see the checks happen.
- CI runs the unit tests, the checks, lint, and every acceptance suite (in headless Chrome) on every push.

## License

[MIT](LICENSE)
