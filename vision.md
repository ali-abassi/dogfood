# Dogfood

Dogfood is a local workspace for people building software with AI agents. It connects the intended product, the work in progress and the evidence of what actually works.

## Who it is for

A person working with Claude Code or Codex who wants to understand and direct the project without reading every code change. Their agent needs a clear scope, a useful next task and a reliable handoff; the person needs to see the result, give feedback and know what remains unproven.

## The complete workflow

1. **Define the product.** Use Discovery to answer the important questions: who it serves, the problem, the complete journey, boundaries, failure states and success criteria. Review the current Vision and Plan before a new build starts. Design keeps the visual direction together.
2. **Plan the work.** Map pages and features, then create bounded tasks with an outcome, scope, dependencies and executable checks. A feature describes something a person can do, not an interface component.
3. **Build with an agent.** Send a linked request from Plan or Agent board. Choose build, discovery or QA. Claude Code or Codex works in an isolated checkout and returns its result to the same conversation. Questions, feedback, stops and retries remain inspectable.
4. **Review the result.** Inspect the actual patch and preview, answer questions and pin feedback to captured screens. Apply and save only the reviewed source changes. Closing a request does not accept its task or page.
5. **Prove the outcome.** Run task checks, use the real app, record attributed evidence and resolve findings after a retest. Overview and the product map show what is accepted, what needs attention and what still needs live verification.

## What evidence means

Web pages use browser captures and behavior checks. Native iOS screens use actual Simulator images with device and build evidence. CLI projects use command receipts and review of their generated output. Claims cover only the devices, source and environments actually checked.

A page is reviewed for appearance, purpose, usability, safety, performance and expected behavior. Completing an audit means the required questions were answered; acceptance requires current evidence and passing requirements. Changed source or review context can require another check. Historical evidence remains available.

Agent reports and optional AI visual opinions help the reviewer; they do not replace independent verification. Shipping and verifying a live integration are separate actions. Missing access, unknown builds and untested behavior remain visible.

## Product standard

Keep the app calm, clear and useful: the existing dog mark, restrained color, readable type and one obvious next step. Remove duplicated explanations and decorative controls. Show real counts and named findings rather than invented quality scores. The CLI, MCP tools and agent skill must describe the same process as the interface.

The workspace is single-user and local. Agent requests do not grant authority to publish, spend, change accounts or deploy. Autonomous KPI pursuit and hosted team collaboration are outside the current product.

## Success

A new agent can resume the right project without guessing its scope or ownership. A person can see what is being built, give precise feedback and distinguish a finished agent turn from a verified result. Every accepted outcome has inspectable evidence and explicit limits.

[Original decisions and user notes](https://github.com/ali-abassi/dogfood/blob/main/docs/history/vision-notes-through-2026-11-03.md) are retained for context.
