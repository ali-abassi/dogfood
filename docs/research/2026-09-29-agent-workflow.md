# Small workflow mechanics, source checked 2026-09-29

Goal: persistent ready work, ownership, explicit acceptance and a fresh-agent handoff, without expanding Dogfood's dependency footprint.

| Source | Mechanic and evidence | Adaptation |
| --- | --- | --- |
| gastownhall/beads, 43a526b8281378a4c1fa23d1bd211ea7109de229; MIT, pushed 2026-09-29 | `issueops/claimer.go` defines a compare-and-set claim, same-owner idempotency, foreign-holder refusal and unchanged state on validation failures. `internal/storage/dolt/issue_claimer.go` implements transactional claim and verified writes. | Adopt the ownership contract with Dogfood's small local JSON lock; do not add Dolt. |
| github/spec-kit; MIT, pushed 2026-09-29 | `templates/tasks-template.md` groups tasks by independently deliverable outcomes, names scope/files, dependencies and independent checks. | Store the executable task definition once; use Markdown for product intent and design, not a second mutable task ledger. |
| Dogfood current store | Atomic file replacement, collision checks, evidence records already exist. | Reuse the model and QA evidence; CLI, MCP and GUI call shared workflow functions. |

Search: authenticated `gh search code claim --repo gastownhall/beads --language Go`; read the implementation files and task template through GitHub Contents API. No upstream code copied. Primary references: https://github.com/gastownhall/beads/blob/43a526b8281378a4c1fa23d1bd211ea7109de229/issueops/claimer.go and https://github.com/github/spec-kit/blob/main/templates/tasks-template.md.

Decisions: native checks are explicit argv arrays, executed without shell parsing; a receipt is valid only for the checked plan and source fingerprint. QA inspection completion and acceptance are distinct. Projects can start from a checkout before a URL exists. Docs show the current checkout so a draft plan is visible before it ships. A linked task can describe an end-to-end journey across its pages without a second journey registry.
