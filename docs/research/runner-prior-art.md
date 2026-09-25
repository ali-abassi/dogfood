# Focused page runner prior art — 2026-09-24

Local source and installed behavior outrank these examples. The AI Social Team checkout already installs Vitest; its `--reporter=json --outputFile=...` run was checked on one representative Inspo test file before integration.

| Mechanic | Source inspected | Why / port cost | License / confidence | Decision |
|---|---|---|---|---|
| Build an explicit command from trusted configuration; keep auth outside runner | [openai/codex-action `src/runCodexExec.ts`](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts) | Avoid accepting a caller's arbitrary command. Small port: construct `execFile` args from checked manifest paths. | Apache 2.0; high for command shape | Steal now |
| Keep the executable replaceable for a fake runner | [openai/codex-action `src/runCodexExec.ts`](https://github.com/openai/codex-action/blob/86365089eb2b84e0a8fb0717b304f8bdcb13b20e/src/runCodexExec.ts#L118-L121) | Its source explicitly calls out fake executables for tests. A local fixture proves selected files, failure parsing, and persistence without an external service. Small port. | Apache 2.0; medium for local fit | Steal now |
| Read-only code review prompt with source context | [openai/openai-cookbook code review example](https://github.com/openai/openai-cookbook/tree/5986832a554169dc87285b1b0b396941f235a62e/examples/archived) | Useful prompt structure, but read-only prompting alone does not isolate secrets or calibrate a score. Model adapter and evaluation are material work. | MIT; low until calibrated | Bank |

The local Pi CLI reports an authenticated OpenAI Codex provider and supports tool-less, session-less prompt execution. This is a possible reviewer route, not an implemented or validated reviewer. A human-labelled golden set and an independent rating check are required before any trusted numeric score.
