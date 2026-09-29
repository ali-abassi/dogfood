# Dogfood

Plan, build and prove a web project with your coding agent.

Dogfood is the shared workspace between the person steering a project and the agents doing the work. It keeps intent, the work plan and evidence together, so a new agent can continue without reconstructing a conversation.

## Who it is for

People building web projects with coding agents. Agents use the CLI, MCP tools and skill; people inspect the same work through the dashboard.

## The working loop

1. **Set the direction.** Keep the purpose, design and milestones in the project checkout.
2. **Plan a bounded outcome.** Name what must work, its scope, dependencies and the checks that prove it.
3. **Build and verify.** Claim the task, use normal coding tools, then run the project's native checks.
4. **Try the actual app.** Inspect desktop and phone captures, use real flows and record findings with evidence.
5. **Accept or hand off.** Accept current passing evidence, or leave the next agent a clear blocker and handoff.

## What must stay true

- Planning starts before an app or URL exists.
- One structured plan owns task status, dependencies and claims.
- Passing a command, finishing an audit and accepting a page mean different things.
- Old source, failed checks and unresolved findings cannot silently count as accepted evidence.
- People can inspect what the agent did and what remains uncertain.

## Keep it lightweight

Plain Node and local JSON files, with no runtime dependencies. Dogfood holds the work and its proof; agents keep using their existing coding, browser and deployment tools.

## How we know it works

A fresh agent can initialize a checkout, claim a scoped task, build it, run meaningful checks, accept the evidence and leave a usable next step. The person can understand that result in Plan and the page reports.
