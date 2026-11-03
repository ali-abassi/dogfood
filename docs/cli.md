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

## Request work

Save `request.json`:

```json
{
  "title": "Clarify booking confirmation",
  "request": "Show the selected date and time after booking. Verify it in the actual page.",
  "backend": "codex",
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
The backend is `codex` or `claude`; page/feature/task links are optional and validated.

The selected project's registered committed checkout is the source. Each native session uses
an isolated worktree; uncommitted source changes are not copied. Starting via CLI or MCP waits
for the first dispatch acknowledgement, not for the model turn to finish. Keep the Dogfood web
server running so finished results and in-flight feedback continue to reconcile. When both agent
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
never merges, deploys or accepts the linked planned task or page QA. `changes` is a bounded
source summary, not behavioral verification.

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
