# Agent board reference

The same controls are available from the terminal: `dogfood board list`, `show CARD`, `create --input request.json`, `start CARD`, `comment CARD --input comment.json --send` (or `--note`), `changes CARD`, `stop CARD`, `discard-feedback CARD`, `done CARD` and `reopen CARD`. Operator source actions are `integrate CARD --input reviewed.json` and `save-source CARD --input integration.json`; use only an inspected fingerprint and the latest integration receipt ID. Supply `--project ID` outside the registered checkout. Creation saves by default; `--start` explicitly launches it. Run `dogfood doctor --project ID --require-agents` to check native sign-in, PAL and the running dispatcher. Read `docs/cli.md` in the Dogfood checkout for examples and readiness boundaries.

People can create project requests in Agent board and explicitly start Claude Code or Codex through
their local PAL installation. Requests may link a page, feature or existing planned task. Read them
with `dogfood_agent_board` or one `dogfood_agent_card`; `dogfood_agent_changes` reads bounded patches/new-file contents and their inspected fingerprint. `dogfood_agent_action` runs, stops, closes, reopens, discards feedback or performs explicit operator source actions; inspect its schema for action values.
`dogfood_agent_request` saves for later unless `start:true`; `dogfood_agent_comment` requires an
explicit `send` choice. Sending or starting delegates work and needs the user's task authorization.
Notes do not start work. A long-running board dispatcher belongs to the local web server; a one-shot
MCP call is not a durable queue worker.

Request `intent` is `build`, `discovery` or `qa`. A build follows the linked outcome/scope/checks;
discovery asks questions and proposes scope; QA inspects without application source edits or source integration. URL-only
QA uses a labeled audit workspace and cannot claim a deployed source revision. Native context gives
the stable project ID, explicit context command, full linked expectations or an exact read path,
source revision and browser contract. Never infer a missing task link from a similar name or the
only task; ask before dependent edits.

Reuse the operator's designated browser session/profile across pages and widths. Snapshot, interact,
re-snapshot and independently verify. Do not create another session, close the selected preview,
change accounts or stop services. Missing browser/authentication is setup-required. A DOM assertion
proves that exact fact; inspect the rendered result before claiming visual quality.

## Return a result

End with an outcome and a fenced `dogfood-result` block, for example:

```dogfood-result
{
  "status": "ready_for_review",
  "summary": "The confirmation shows the selected date and time.",
  "checks": [{"command": "npm test", "result": "Exit 0", "evidence": "Terminal output"}],
  "previewUrl": "http://127.0.0.1:4321/booking",
  "unverified": ["Live booking provider"]
}
```

`status` must be `ready_for_review` or `needs_input`; `summary` must be nonempty. For
`needs_input`, include a nonempty `decision` with the specific question and start the final response
with `NEEDS_INPUT: <question>`. Do not guess the answer. `checks`, `previewUrl`, and `unverified`
are optional, but include them where useful. Each check uses `command`, `result`, and `evidence`;
checks are agent-reported until independently verified. `previewUrl` is retained only for HTTP
localhost, 127.0.0.1, or ::1 URLs without credentials. Keep progress chatter separate.


The board owns conversations and isolated native sessions. Keep planned-task claims, verification
receipts and page acceptance in their existing tools. An agent's finished turn returns to Review;
it never proves the app works, merges a branch, deploys or accepts QA. Review source and user-visible
outcomes before integrating returned work. Preserve the request's worktree and conversation so a
person can send further feedback through the same card.

The operator can Inspect changes, Apply the exact reviewed change set to clean matching source
(staging only), then Save reviewed changes as a local commit. Concurrent or unrelated edits are
preserved and can block that action. Neither action accepts a task/page, pushes or deploys. A native request must not apply or save source, including another card's source. Operator tools guard recognized native contexts against accidental self-approval; they do not sandbox same-user local code. Do not bypass the authority contract through another local interface or a different actor label. Read the resulting revision
and continuation receipt; if work changed concurrently, start a fresh request from saved source.

For a page problem, `dogfood_add_annotation` records a pin on the exact current screenshot hash,
position and device, retaining immutable image evidence and an open finding. Create its linked
request with `dogfood_annotation_request`; it saves by default. Resolve with
`dogfood_resolve_annotation` only after a fresh retest note. Older pins remain historical after a
new capture, and pin resolution does not accept QA or close the agent request.

