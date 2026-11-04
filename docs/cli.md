# Dogfood from the terminal

Install the executable once from the main checkout with `npm link`. `dogfood --help` lists the
commands; `dogfood skill` prints the skill path and current instructions for your coding agent.
An existing global symlink follows the main checkout as it updates.

## Check the installation

```sh
dogfood doctor --project my-app --json
dogfood doctor --project my-app --require-agents --json
```

`ok` describes the basic local planning setup. `readiness` separates planning, task verification
and agent requests. Missing optional model/browser tooling does not prevent planning.
`--require-agents` exits 1 unless the selected project can use the native request loop.

Doctor checks writable storage, a committed Git checkout, the browser executable, local PAL,
Codex/Claude Code executable paths and their local sign-in status. It also probes the local
Dogfood health endpoint, matching data folder, dispatcher startup and selected-project board. Authentication output
and credentials are never printed. A local sign-in does not prove provider quota, paid access
or which configured PAL account a later request will select; an actual request proves that.
An unrecognized status response or a three-second timeout reports authentication as unknown.

The runtime address comes from `DOGFOOD_SERVER_URL`, then `DOGFOOD_PORT`, otherwise the established
local ports 4322 and 4321. Readiness only contacts HTTP localhost or 127.0.0.1 and refuses credentials in
URLs and redirects. It never probes the project's application URL as if it were Dogfood.
CLI and server must use the same `DOGFOOD_DATA`; symbolic links to the same folder match.
If an older running server lacks the health/data-store check, restart it after updating.

For browser checks, set `DOGFOOD_BROWSER_SESSION` to reuse a designated existing
`agent-browser` session. Dogfood preserves that session after success, failure and shutdown;
it does not load `DOGFOOD_BROWSER_STATE` into it. The selected browser profile still applies. Scans navigate and resize this session, leaving it
on the last checked page at that page’s final device size.
Without a named session, Dogfood creates and closes its own temporary scan session, including
on failure; saved-state setup applies only to that owned session.

## Discovery and the project map

Use **New idea → Start discovery** in the app to create a managed local Git workspace, or call
`dogfood_start_project` through `dogfood tool` with a JSON file containing `name`, `idea` and `agent`.
`dogfood init` connects an existing checkout and preserves its history. Existing imports are labeled
as not discovery-certified rather than silently claiming a completed interview.

Read `dogfood_project_readiness` before saving with `dogfood_save_brief`. Existing briefs require the
returned `revision` as `input.expectedRevision`. Planned pages/features, material questions and
answers, decisions and the required proof are durable. Scope review binds the exact answers and real
Vision/Plan contents; changing that contract requires review again. A new build also requires the
reviewed documents at committed HEAD. Ordinary implementation edits do not invalidate scope review.

The operator can explicitly create missing draft documents, review the scope and save the exact
managed drafts as a local source baseline with `dogfood_create_project_documents`,
`dogfood_review_scope` and `dogfood_save_scope_baseline`. Native requests may propose brief changes but lack authority to self-approve, write those source files through readiness tools or commit the baseline; recognized native contexts are refused.
Inspect each schema before calling it; the [Discovery guide](discovery.md) explains the boundary.

`dogfood_project_map` derives the page/feature/task/request/evidence links and reports saved Graphify
context as current, stale, absent or unavailable. It never starts extraction or invents links.
`context` includes requests and a unified `nextAction`; task `next` retains its task-specific meaning.

## Request work

Save `request.json`:

```json
{
  "title": "Clarify booking confirmation",
  "request": "Show the selected date and time after booking. Verify it in the actual page.",
  "backend": "codex",
  "intent": "build",
  "pageId": "booking"
}
```

Then:

```sh
dogfood board create --project my-app --input request.json
dogfood board list --project my-app
dogfood board show CARD --project my-app
dogfood board start CARD --project my-app
```

Creation saves for later by default. To explicitly authorize immediate execution, use
`dogfood board create --input request.json --start`, or set `"start": true` in the JSON.
The backend is `codex` or `claude`; page/feature/task links are optional and validated, including planned pages. `intent` is `build` by default, `discovery` for questions/brief proposals, or `qa` for an audit without application source edits. QA can also use a labeled URL-only audit workspace.

The selected project's registered committed checkout is the source. Each native session uses
an isolated worktree; uncommitted source changes are not copied. Starting via CLI or MCP waits
for the first dispatch acknowledgement, not for the model turn to finish. Keep the Dogfood web
server running so finished results and in-flight feedback continue to reconcile. Native worktrees retain the stable project identity; explicit `--project ID` is always available for a read-only context refresh. When both agent
slots are occupied, a start remains queued and exits successfully; the returned card shows whether
it launched or is waiting for capacity.

## Continue the same conversation

Save `comment.json` containing `{"text":"Keep the date visible on mobile too."}`.
Choose explicitly whether to send it to the agent or retain it as a note:

```sh
dogfood board comment CARD --project my-app --input comment.json --send
dogfood board comment CARD --project my-app --input comment.json --note
```

The JSON may instead contain an explicit `"send": true` or `false`. A note never launches work.
Sent feedback waits for the current turn to end and continues the same native session. `--input -`
reads JSON from stdin, avoiding shell interpolation of long requests.

```sh
dogfood board changes CARD --project my-app
dogfood board stop CARD --project my-app
dogfood board discard-feedback CARD --project my-app
dogfood board done CARD --project my-app
dogfood board reopen CARD --project my-app
```

Discarding queued feedback retains its comment history. A running request must stop before it
can be closed. Done closes the request after review, or closes an idle Needs-you request; it
never applies source, deploys or accepts the linked planned task or page QA. `changes` returns a bounded inspected snapshot, including safe patches/new-file contents, a fingerprint and whether source integration is available. It is source inspection, not behavioral verification.

## Review and apply a result

```sh
dogfood board changes CARD --project my-app --json
dogfood board integrate CARD --project my-app --input reviewed.json
dogfood board show CARD --project my-app --json
dogfood board save-source CARD --project my-app --input integration.json
```

`reviewed.json` contains only `{"fingerprint":"THE_EXACT_INSPECTED_FINGERPRINT"}`. Apply is an
explicit operator action against the clean matching source base; it stages only that unchanged
reviewed change set. It refuses conflicts, unrelated changes and withheld files. The app exposes
this as **Inspect changes → Apply reviewed changes to source**.

After inspecting the staged result, `integration.json` contains only
`{"integrationId":"THE_LATEST_INTEGRATION_RECEIPT_ID"}` from the card. **Save reviewed changes**
locally commits the exact unchanged reviewed staging. Its receipt reports the saved revision and
whether the same native worktree can continue; concurrent work is preserved. No push or deployment
occurs. Then run task checks and page QA against the integrated source before acceptance. Recognized native request contexts are refused by both source actions. These are safeguards against accidental self-approval; same-user local code still has the owner's filesystem and API access.

## Browser and screenshot feedback

Set the server's `DOGFOOD_BROWSER_SESSION` and `DOGFOOD_BROWSER_PROFILE` to the operator's existing
browser preview. Native requests receive those values, reuse that session across viewports and
leave it open. Missing session, profile or authentication is reported as setup-required; requests
do not substitute a fresh browser or close another session.

`dogfood_add_annotation` pins a comment to the current screenshot hash and a device position.
`dogfood_annotation_request` saves its page-linked request unless `start:true` is explicit.
`dogfood_resolve_annotation` needs a retest note; it does not accept the page or finish the request.
Use `dogfood_annotations` to read the immutable capture, finding, current/stale marker and request.

**Ask the QA agent** uses the same durable native board with `qa` intent. `DOGFOOD_QA_BACKEND` may
prefer `codex` or `claude`; legacy custom `DOGFOOD_QA_AGENT` commands are not executed.

## Platform evidence and current projects

Use `dogfood_configure_project` to declare `web`, `ios` or `cli` coverage while retaining project
history. Web and generated publications default to computer and phone; explicit
`captureDevices:["desktop"]` limits required evidence to computer. iOS requires mobile only and a
bundle ID. `dogfood_record_native_check` imports an actual Simulator PNG with current source,
app, executable and device provenance. It does not build or launch an app. Unknown build source
remains unaccepted, and omitted observed checks remain untested.

```sh
dogfood schema dogfood_configure_project
dogfood schema dogfood_record_native_check
dogfood schema dogfood_portfolio
dogfood schema dogfood_set_active_projects
```

The [native apps and generated-publication guide](native-apps.md) has exact JSON examples,
screen identities and acceptance boundaries. Declare a generated output's `servesCheckout`
relationship explicitly only after verifying it against the registered source.

`dogfood_portfolio` reads current projects plus history. `dogfood_set_active_projects` takes
`{"agent":"operator","input":{"projects":["my-app"]}}`; subsequent writes also require
`input.expectedRevision` from the latest read. Other projects retain their QA history.

## MCP and native agent configuration

Both native agents can use the same stdio server:

```text
command: node
args: ["/absolute/path/to/dogfood/mcp.mjs"]
```

Keep the global executable, MCP server and installed skill pointed at the same main checkout.
The repository's current skill is `skills/dogfood/SKILL.md`. Existing MCP connections advertise
schema changes automatically; connections older than the reload implementation require one restart.

Board tools are `dogfood_agent_board`, `dogfood_agent_card`, `dogfood_agent_changes`,
`dogfood_agent_request`, `dogfood_agent_comment` and `dogfood_agent_action`.
Inspect their exact schemas with `dogfood schema TOOL`, or call one with
`dogfood tool TOOL --input args.json`. Starting or sending work requires the user's delegation
authorization. Ordinary project planning and QA tools remain separate.

If source was changed outside Dogfood, finish or preserve local edits until source is clean, then use `dogfood board release-integration CARD --project my-app --input integration.json`
with its latest `integrationId`. This releases only the application record and preserves its history
and the agent worktree. If source moved on, start a fresh request before integrating further changes. `save-source` can recognize an exact external reviewed commit instead;
unrelated commits or local changes are refused.

For Codex, forward Dogfood's native context into its MCP child. In the existing
`[mcp_servers.dogfood]` entry in `~/.codex/config.toml`, add:

```toml
env_vars = ["DOGFOOD_PROJECT", "DOGFOOD_NATIVE_REQUEST", "DOGFOOD_DATA", "DOGFOOD_BROWSER_SESSION", "DOGFOOD_BROWSER_PROFILE"]
```

These are context-variable names, not credentials. Without forwarding, a Codex MCP child can
lose the native-request marker even while its shell sees it. Worktree detection remains a
fallback. Start the next native turn after changing configuration; an already-running MCP
process keeps its original environment.

A portfolio save uses `portfolio.json.lock` in the selected data folder. If a save reports an
existing lock after a process crash, first confirm the writer has stopped and no save is running,
then remove only that lock file. Keep `portfolio.json` and all project manifests. An unavailable
project is shown as a setup gap without hiding the rest of the portfolio.
