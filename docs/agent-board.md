# Agent board

The board answers: **What is running, what needs me, and what is ready to review?**
Create a request for Claude Code or Codex, continue it from the same card, inspect its actual
changes, and explicitly decide what enters the project source.

## From scope to work

A new idea starts in Discovery: saved answers, material questions, planned pages/features, real
Vision and Plan documents, and an attributed review of the current scope. The reviewed documents
must match committed source before a build starts. Ordinary implementation edits do not revoke
scope readiness; changed Vision/Plan content or scope requires review again. Existing imports
remain usable and explicitly say that discovery has not been certified.

Plan's **Send to agent** opens a request linked to that task. **Work myself** claims the task for
the person. The product map connects planned/registered pages, features, tasks, requests and QA
using actual links. Context and Overview include pending requests and the next project action.

Choose an intent when creating a request:

- **Build or change** (`build`) changes application source within the linked outcome, scope and acceptance contract.
- **Explore the idea** (`discovery`) asks material questions and saves attributed brief proposals; it does not implement
  features, approve its own scope or commit the source baseline.
- **Review and test** (`qa`) audits the named page and records evidence/findings through the same durable lifecycle; it cannot integrate source.
  A URL-only audit uses an explicitly labeled execution workspace, not application source.

## Conversation and context

Requests use isolated native Git worktrees and durable PAL sessions. Their starting point is
committed source; unrelated uncommitted files are not copied. Each native brief carries the stable
project ID, explicit context command, actual linked task/feature expectations, document references,
source revision and selected browser contract. Oversized inline context points to the full tools.
It never silently drops an acceptance requirement.

A question in **Needs you** requires an answer sent to the agent; saving it as a note does not
resume work. Explicitly sent feedback is persisted in order; feedback during a turn waits for
the next turn in the same session. Stop, retry and queued-feedback discard retain the conversation.
Retry the same card after a transient failure or stop when its session and source remain valid. If a
save receipt says continuation is unavailable, or source has moved, preserve the existing work and
start a fresh request from current source.
Finished turns return to Review or Needs you. A concise result summary leads the card; exact checks
and unverified items remain visible. Agent-reported checks are distinct from independent receipts.

Native browser work reuses the operator's selected existing session/profile. Set
`DOGFOOD_BROWSER_SESSION` and `DOGFOOD_BROWSER_PROFILE` on the server to that contract. Missing
session/profile or authentication is setup-required. The agent must not substitute a fresh browser,
close the preview, change accounts or stop services.

## Inspect, apply, save, verify

1. **Inspect changes** reads bounded patches and new-file contents. Unsafe/secret-bearing paths,
   symlinks, oversized/binary changes and other withheld content require local review. Static HTML
   previews are inert snapshots; actual behavior still needs the running application.
2. **Apply reviewed changes to source** is an explicit operator action tied to the inspected
   fingerprint. It requires a clean matching source base, checks the exact patch again, and stages
   it without overwriting unrelated work.
3. **Save reviewed changes** locally commits only the unchanged reviewed staging. Its receipt
   identifies the saved revision and whether the same native worktree can continue. Concurrent
   changes are preserved and may require a fresh request.
4. Run source task checks and page QA. Accept the task/page only when their own current gates pass.

Applying, saving source, finishing a request, task acceptance, page acceptance, pushing and deploying
are separate actions. **Mark reviewed & done** only closes the request. Native requests lack authority to
apply/save source, create source documents through readiness tools, self-approve scope or commit a
scope baseline; operator tools reject recognized native request contexts. An ordinary authorized operator can use the corresponding CLI/MCP actions.

## Page feedback and QA

**Pin feedback** on the latest computer/phone screenshot records its device, normalized position,
immutable image revision and a finding. Choose an agent to create its linked request; it saves for
later until explicitly started. New captures mark older pins as historical. Resolve a pin with fresh
retest evidence; that does not accept the page or finish its request.

**Ask the QA agent** creates a `qa` request on this board. Legacy launch receipts remain read-only;
`DOGFOOD_QA_AGENT` custom commands are no longer executed. Screenshot-only **Check with AI** is a
separate provider-backed visual opinion, bound to actual device coverage and the review contract.

See [Discovery](discovery.md), the [CLI guide](cli.md) and the [agent result contract](../skills/dogfood/references/workflow.md#return-a-result) for exact operations. The server remains a
single-user loopback workbench with controlled backend/argv selection and local-origin writes.
No card grants publication, deployment, account changes, purchases or credential access.

These native-context safeguards prevent accidental workflow bypass. They are not an OS security sandbox: code running as the same user retains that user's filesystem and local HTTP/CLI access. Treat native agents and local integrations as trusted operator-authorized code.

### Changes made outside Dogfood

Save recognizes an external commit only when it has the exact reviewed tree and the original
base as its single parent, with clean source and the unchanged agent snapshot. It records that
existing revision and prepares the same conversation without making another commit.

If the applied source changes were discarded, **Release applied-change record** clears only the
active application record after verifying source is clean. If source moved on, the archived record names that revision and a fresh request is needed before integrating further work.
The receipt remains in history. Dirty or unrelated source is refused; Dogfood never restores,
resets or deletes those files to recover a request.

## Delivery is half of Dogfood

The board is a work surface, not just an agent launcher. Search requests and filter open work,
questions, review and closed conversations. Closed is neutral: closing a conversation never turns
unverified work green. Each card identifies the agent, latest update and delivery state.

A request can include **Done when** and **Boundaries**. These become explicit sections of the agent's
brief. Selecting a planned task also exposes its actual outcome, scope, dependencies, command checks
and visible result. Ready planned tasks can be prepared directly from the board.

For linked builds, the backend enforces dependency acceptance, blocked state and ownership before
launch. The request claims the task as `request:<card UUID>` and retains it for review; another request
cannot build the same owned task. Recover an abandoned claim explicitly in Plan. Queued builds use
task priority; saving a request does not queue it automatically.

The delivery panel derives its requirements from current source evidence. Review and save changes,
then use **Run task checks** and **Accept verified task** when offered. These are explicit operator
actions using the existing task gate, not agent-reported check results. Changed source or task
requirements invalidate receipts. Missing page QA remains visible and blocks acceptance. A status
refresh error says **Status unavailable**; a known finished agent whose result has not arrived says
**Fetching result**. Neither is presented as confirmed ongoing work.

## Turn incomplete coverage into work

**QA coverage** lists every registered page with missing requirements, findings or verification debt.
Expand **What remains** for the concrete gaps. **Prepare review** saves a page-linked QA request with
its full inventory, expected behaviors and evidence boundary. Choose Codex or Claude Code, then start
the saved request explicitly. Repeated preparation reuses the active full-page review request.
Existing narrower QA conversations are preserved separately.

The agent must inspect every required item and record pass, failure or a specific blocker. A blocker
is not a passing check and does not make the audit complete. Large inventories use exact complete
read commands rather than truncating or sampling the scope. This queue covers the registered
inventory; discovery still has to establish that the inventory represents the full product.

Terminal agents can read `dogfood_qa_work_queue` and save a scoped request with
`dogfood_request_page_review`. Inspect their schemas with `dogfood schema TOOL`; normal
`dogfood board` commands continue the resulting conversation. These operations never start an
agent, execute tests, purchase services or change QA verdicts implicitly.
