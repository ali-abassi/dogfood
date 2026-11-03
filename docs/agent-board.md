# Agent board

The board answers: **What is running, what needs me, and what is ready to review?**
Its primary action is **New request**. A person can give Claude Code or Codex a request,
continue it from the same card, inspect the result, and explicitly finish the request.

## Scope

- Project-scoped cards, optionally linked to an existing page, feature or planned task.
- To do, Working, Needs you, Review and Done lanes with counts derived from cards.
- An explicit Create & start action, and a save-for-later path.
- Durable isolated agent worktrees and native conversations through the locally installed PAL runner.
- Separate notes and requests sent to the agent; followups retain the conversation.
- Results return to Review. A finished agent turn is not QA acceptance, a merge or a deployment.
- Process errors, unavailable runner, stopped work, and pending feedback remain visible.
  Idle stopped/blocked requests can be closed. Queued feedback can be explicitly discarded
  without deleting its comments. Temporary result-read failures retry without losing a turn.

The existing Plan remains the source of implementation tasks and verification receipts.
The board records requests, conversations and execution; linking a task never changes its
ownership or acceptance. Agent changes remain in their worktree until reviewed and integrated.

## Design decisions

Preserve Dogfood's native system type, restrained semantic colors, logo, spacing and stack.
The current Plan provides a useful readable task detail but has no way to send an agent work.
The three highest-impact changes are a visible work queue, a concise conversation beside the
selected request, and direct page/feature context. Desktop uses lanes; narrow screens retain
readable cards and complete controls without sideways page scrolling. Missing state is never
represented by made-up progress or KPI numbers.

## Verification

Native checks cover isolated dispatch, invalid input, duplicate starts, queued feedback,
restart recovery, successful review, stop, and explicit completion. Browser checks use one
existing Chrome session at 1280 and 390 wide, exercise request and thread controls, and check
draft retention and escaping. A bounded disposable Git project proves an actual native agent
can make a change and receive a second request through the same card.

## Boundaries

The server binds to loopback and requires a local Origin for mutations. Backend names and
launch arguments are controlled by the server. Cards do not accept executable commands,
credential values, deployment authority or arbitrary working directories. PAL and a working
native provider login are prerequisites; installed software alone does not prove authentication.
Ordinary agent runs inherit the user's existing provider subscription/account. No login,
top-up or paid API provisioning is performed by the board.

Discovery interviews, a visual product map, screenshot-position annotations, Graphify imports
and ongoing KPI goal automation remain separate follow-on work. This release completes the
request → agent → feedback → review loop first.
