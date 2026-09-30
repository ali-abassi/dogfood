---
name: dogfood
description: Plan, build, verify and resume a web project with Dogfood's task workflow and evidence gates. Use to set up Dogfood, work through a project's plan, or QA its pages.
---

# Work on a project with Dogfood

Dogfood holds the structured work plan and evidence. You build with your normal coding tools. The person sees the Plan and page reports in the local dashboard. Task acceptance, a finished audit, and a production deployment are different outcomes.

## Set up or resume

Dogfood needs Node 20+. Clone it once if unavailable; its server has no runtime dependencies. Use `node /absolute/path/to/dogfood/bin/dogfood.mjs` for every command below, or optionally run `npm link` from the Dogfood checkout to install the `dogfood` command. Start the dashboard with `npm start`; use `DOGFOOD_PORT` if the default 4321 is occupied. Leave existing sessions and servers alone.

From the project checkout:

```sh
dogfood init --checkout . --id my-app --name "My App"
dogfood doctor --project my-app
dogfood context --project my-app --json
```

Initialization is idempotent for the same project and checkout. No running website, browser, model API, or agent runner is needed to plan. Verification needs a Git checkout with a commit so receipts can bind to its source. Initialize Git if that is part of the authorized new-project work; preserve existing history.

Always read `context` first when continuing. It identifies the next available task, current owners, blockers, documents, and handoff. Read the project's current vision, design, plan and decisions when relevant. Do not claim somebody else's work. Release your own claim with a useful handoff before another agent takes it.

MCP equivalents are `dogfood_init`, `dogfood_context`, `dogfood_tasks`, `dogfood_next_task`, `dogfood_add_task`, `dogfood_claim_task`, `dogfood_update_task`, `dogfood_verify_task`, and `dogfood_accept_task`. Inspect exact arguments with `dogfood schema TOOL`. Existing `dogfood_next` lists page QA gaps, not build tasks. Use `dogfood tool TOOL --input args.json` for any underlying operation; `--input -` reads JSON from stdin. Shell/MCP errors do not prove that a write happened; reread the resulting state.

## Plan the smallest complete outcome

Keep intent in `vision.md`, visual direction in `design.html`/`design.md`, and milestones in `plan.md`. Dogfood's structured tasks are the task-status source of truth; don't maintain another checkbox ledger independently.

Turn each outcome into a bounded task. Specify scope, dependencies, the native commands that prove it (optional `timeoutSeconds` from 1 to 1800, default 300), and related pages plus visible criteria for UI work. A task can describe a journey across several pages. Avoid tasks that just say “improve quality” or checks that merely exit 0.

Example `task.json`:

```json
{
  "id": "booking",
  "title": "Let a visitor book a lesson",
  "outcome": "A confirmed booking survives reload and removes that slot from availability.",
  "scope": ["src/booking", "tests/booking.test.mjs"],
  "dependencies": [],
  "checks": [{"id": "booking", "command": ["node", "--test", "tests/booking.test.mjs"]}],
  "pageIds": [],
  "look": "At 1280 and 390 wide, the booking confirmation and next action are visible."
}
```

```sh
dogfood task add --project my-app --agent codex --input task.json
dogfood next --project my-app --json
dogfood task claim booking --project my-app --agent codex
```

Use your stable agent name. Checks are argv arrays executed directly in the registered checkout; quotes and shell operators aren't parsed. Configure deliberate native test commands, not deployment, purchase or destructive commands. Register pages once an app exists, then link UI tasks to them with `task update` before acceptance. Checks alone cannot accept a task with linked pages that haven't passed page acceptance.

## Build, verify, accept

Build the claimed scope and preserve unrelated edits. Isolated worktree builds need authorized integration into the registered checkout before final verification; Dogfood runs checks in that registered checkout. Run the meaningful native checks, then use the real browser for the intended user outcome. For page QA read [references/qa.md](references/qa.md). Attach a running URL to this project with `dogfood attach-url URL --project my-app`; register/scan its pages with existing Dogfood tools. Loopback URLs are treated as serving the checkout. For a remote preview, use `attach-url URL --serves-checkout` only when you have verified it runs the registered code; this declaration does not independently prove deployment. A remote URL without that declaration cannot accept checkout-linked evidence. Read `project.checkoutFingerprint` from context or `checkoutFingerprint` from `dogfood_page` before manual QA, then pass it as `checkoutFingerprint` when recording verdicts or captures so a concurrent source change rejects the write. Onboarding creates a separate project, so don't onboard again to attach an app to an existing plan.

```sh
dogfood verify booking --project my-app --agent codex
dogfood task accept booking --project my-app --agent codex
```

For a crashed or renamed owner, explicitly recover the claim with `task update` input `{"releaseOwner":true,"recoveryReason":"Previous agent stopped; continuing from its handoff."}`; the recovery is recorded and clears the old receipt.

Verification stores command exits and bounded output tied to the current task definition and source fingerprint. If checks change files, verification fails and must be repeated after the generated state is stable. Changing source after verification invalidates acceptance. Finish edits and commits before collecting the final evidence; a later commit changes the revision too.

Before there are pages, the page gate reports that there is nothing to audit; use task acceptance. Audit completion means every required item was checked, including recorded failures. `dogfood gate --project my-app` checks that. `dogfood gate --accept --project my-app` also requires all answers Good (or explicitly declared awaiting-live feature debt), no unresolved findings, current checkout and environment evidence. `dogfood_accept_page` checks a single page. Never resolve or retire a real problem to force a pass. Never manually edit Dogfood's project/workflow JSON files.

If blocked, update your task using `{"status":"blocked","blocker":"What is missing","handoff":"What was done and how to continue","releaseOwner":true}`. To hand off available work use status `todo` with `handoff` and `releaseOwner:true`. The next agent can claim it. Plan changes invalidate the earlier verification and dependent acceptance where appropriate.

Report the accepted outcome, concrete evidence and remaining blockers. Do not call an accepted local task deployed or production-ready: run the project's authorized shipping gate and verify its real environment separately. Paid model checks, public posting, account actions and production effects retain the user's authorization boundaries. No screenshot or model opinion proves an untested integration.


## Reuse scan evidence and finish live checks

An audit verdict can declare `dependsOn` (inspect `dogfood_set_checklist` schema for supported keys). Dogfood snapshots those facts and the URL, environment, role and fixture context. Rescanning carries unchanged facts and visually unchanged captures with their original attribution and a `carriedFrom` marker. Changed relevant facts require review again. Human security, keyboard, contrast and zoom judgments default to the code and reviewed captures; don't replace their dependencies with a convenient title merely to pass. Existing stale legacy answers without a valid original snapshot still need one fresh review. Custom or rewritten questions have no inferred dependencies: `auditReuseWarnings` in page reads and verdict acknowledgements identifies answers that will require review after each scan. When reviewing them, explicitly set `dependsOn` to the supported facts you actually checked in that same verdict write; do not guess from a reused question ID. For example, a private-app title question can select `seo.title` and `seo.description`; a source-policy question can select `fingerprint` plus any relevant measured context. Use `loadMs` for a custom load-time question: changed timings need review. Unknown (`null`) links or load times cannot carry; absent canonical URLs or response headers can be measured absence. Live and URL-only scans can lack a checkout fingerprint, so carried answers do not independently prove deployed source or an unseen external integration.

`dogfood_page` exposes objective `measuredAnswers`. Review them, then accept all current candidates in one attributed write. They record title/description presence, robots directives, alt/name counts, and overflow as verified by scan. Failed requests already inform Works as expected. They do not answer clarity, intended indexing visibility, keyboard operation, contrast, security or 200% zoom. An audit-only checklist write preserves connections when omitted.

```sh
dogfood accept-measured PAGE --project my-app --agent codex
dogfood gate --accept --project my-app
dogfood gate --accept --verbose --project my-app
```

For behavior that truly can only be proven after deploying, declare the feature `requiresLive:true` via registration, add, or `dogfood_update_feature`. Record its status `awaiting_live` with a concrete reason. It is visible debt and permits local release readiness; it is not Good or evidence that the integration works. Normal blocked and needs-work checks still fail acceptance. Editing expected behavior invalidates its old verdict and retains history. Retire obsolete behavior with `dogfood_retire_feature`; never retire something still present to pass.

After an authorized deploy, record its URL (and known revision) explicitly. This receipt reports a deployment; it does not deploy or independently prove that revision. Outstanding debt becomes an untested to-do. Scan the live target, exercise the actual integration within the user's authorization, and record an explicit feature verdict. Closing debt requires a live scan at the exact deployed page URL later than the receipt.

```sh
dogfood deployed --project my-app --url https://app.example.com --revision ACTUAL_SHA --agent codex
dogfood scan PAGE --project my-app --live-url https://app.example.com --browser-profile Default
```

Only an explicit `--live-url` scan uses deployment-receipt acceptance. Configured remote or LAN URLs retain their ordinary configured-environment acceptance. Live scans retain registered path/query/hash and expectedStatus while leaving the local URL intact. Evidence is labelled live, with no local checkout fingerprint pretending to prove deployed code. A Chrome profile is a browser context, not proof of authentication. Leave existing browser sessions open.

Declare role-restricted pages with `requiredRole`, `roleProof:{selector,expectedText}` and, if needed, named `fixture` prerequisites via `dogfood_register_page`. The scan verifies visible role proof on desktop and phone. A wrong role returns setup-required rather than recording a misleading not-found page. Configure local fixture commands with `dogfood_set_fixture_setup` as argv arrays, never shell strings or credentials. Explicitly opt in with `dogfood scan --fixtures NAME` (comma-separated or repeated). Requested fixture setup runs once per scan invocation; each page still validates its prerequisites. Fixture execution is bounded and refused on live scans; select the needed real profile for live checks.

Persistent MCP connections advertise tool-list changes and load fresh implementations per request. An old server that predates this implementation needs one restart to install it; subsequent saved schema changes notify clients with `notifications/tools/list_changed`. CLI calls always load the current source.
