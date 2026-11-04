# Task context and image evidence

Reviewed Paperclip source on 2026-11-04 at `52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2` (MIT). This is a source study, not a production comparison or a copied subsystem. Dogfood keeps its native JavaScript stack and existing PAL sessions.

## Patterns adopted

| Pattern | Source inspected | Dogfood application |
| --- | --- | --- |
| Durable handoff independent of a provider conversation | [native-session-handoff.ts](https://github.com/paperclipai/paperclip/blob/52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2/server/src/services/native-runtime/native-session-handoff.ts) | Preserve sent decisions, the latest reported outcome and task handoff. Bound inline context and explicitly identify omitted material and its retrieval path. Never turn older text into new authorization. |
| Check session/workspace compatibility before continuation | [session-preparation.ts](https://github.com/paperclipai/paperclip/blob/52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2/server/src/services/heartbeat/session-preparation.ts) | Verify launch acknowledgement against the expected turn and isolated checkout; retain queued feedback on failure. Keep existing PAL resume behavior. |
| Attachments are task-scoped records with integrity metadata | [issues.ts](https://github.com/paperclipai/paperclip/blob/52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2/server/src/routes/issues.ts), attachment upload/content routes; [runner-task-attachments.ts](https://github.com/paperclipai/paperclip/blob/52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2/server/src/services/native-runtime/runner-task-attachments.ts) | Store immutable raster images with each comment; validate actual image bytes, bound uploads, retain SHA-256 metadata, and restrict downloads to the registered request. Provide native agents the local image path. |
| Show and remove image drafts before posting | [ComposerImageAttachments.tsx](https://github.com/paperclipai/paperclip/blob/52b4b3ccd7c8436a7c0e61e7080f0a9ee47c4aa2/ui/src/components/task-chat/ComposerImageAttachments.tsx) | A compact image picker/paste area beneath the existing reply, removable previews, full-size image links in the thread, and drafts that survive polling. |

## Scope and decisions

The request screen answers **what does this agent need from me, and what evidence came back?** Its primary action stays the reply. The three changes with the largest impact are reliable context on every turn, recoverable dispatch/result handling, and images beside the conversation that explains them. No new dashboard, storage service or provider framework is needed.

Dogfood's task claim, source integration, independent checks and acceptance remain separate from a completed conversation. A screenshot is evidence to inspect, not an automatic pass. Local notes are not sent as fresh instructions. Historical results are agent-reported.

Source-read evidence: repository HEAD and license read locally; handoff limits and omission markers, session compatibility/handoff loader, attachment upload/metadata/content routes and runner integrity reads inspected. Search discovery used Exa request `d16fcc9767424f247780f3830b529837` and GitHub source. No paid model execution was needed for the study.
