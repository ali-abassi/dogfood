# Discovery, scope review and the product map

A new project saves its idea and answers in Discovery before the first implementation request.
Three short rounds cover who/why, the journey and boundaries, and pages/features/proof.
Use Ask agent next questions to work through unresolved material decisions in a durable native
conversation. Agent discovery is a separate intent; it does not authorize implementation.

The project readiness record holds answers, planned pages/features, open or answered questions,
attributed decisions and a scope-review receipt. Saving a material change invalidates that receipt.
The review contract also hashes the actual registered checkout's `vision.md` and `plan.md`, so
changing either document requires a fresh review even when the saved answers did not change.
A first build needs all core answers, a page/feature inventory, no unresolved material questions,
real nonempty Vision/Plan files, a review of the current contract, and those documents matching the committed source baseline. Ordinary implementation edits or staged integrations do not invalidate scope readiness; changing Vision or Plan does.

Existing projects without a readiness record are labeled **Existing project · discovery not
certified**. Existing work can continue. A new project cannot evade its gate by switching modes.
Scope review is independent of task verification, page QA acceptance, integration and deployment.

**Create missing Vision and Plan drafts** is an explicit operator action. It creates only absent
`vision.md` and `plan.md` in the registered checkout; existing files and symlinks are never replaced.
The drafts still need review. After review, **Save reviewed scope baseline** explicitly makes a local commit of only the exact managed drafts. It refuses unrelated/staged source changes and drafts edited outside Dogfood; existing work is never silently bundled. Unchanged already-committed documents are skipped; if only one document was generated here, only that remaining managed draft is committed. There is no push, hook, signing prompt or global Git configuration. A native worker restricted to an isolated worktree drafts there and
returns its changes for integration; it must not use document tools to write outside that worktree.

MCP tools:

- `dogfood_project_readiness` reads the record and current contract.
- `dogfood_save_brief` saves an attributed partial brief. Pass the last read `revision` as
  `input.expectedRevision`; stale writers are rejected.
- `dogfood_create_project_documents` explicitly creates absent drafts.
- `dogfood_review_scope` requires both `expectedRevision` and current `contractHash`.
- `dogfood_save_scope_baseline` records the managed documents in local committed source after explicit operator authorization.
- `dogfood_project_map` reads the connected scope and evidence.

The product map is derived from actual page IDs and explicit task/request links. Planned features
whose expected behavior differs from the registered QA inventory show **Scope changed · recheck**;
they do not inherit the older Good verdict. Unlinked work stays visible separately.

Saved Graphify context is optional and read-only. A bounded regular `graphify-out/graph.json` in the
registered checkout supplies at most twelve files per page, selected only from linked task scope.
No code is fetched or extracted and no runtime edge is invented. Graph metadata must match the
clean source revision to be current; otherwise the references are labeled historical. A missing,
malformed, oversized or external-symlink graph never blocks normal project planning.

Native request processes carry `DOGFOOD_NATIVE_REQUEST=1`. They may save attributed brief proposals, but source-document creation, scope approval and baseline commits are operator-only actions and are refused when a native flag or registered request-worktree context is detected. This prevents accidental self-approval; it is not an OS-user security sandbox. `DOGFOOD_PROJECT` selects a project and is not an authority restriction. Native workers draft documents in their own worktree and return them for operator review.
