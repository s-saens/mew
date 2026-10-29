---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Project feature ledger and agent implementation requests. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0159 — Project feature ledger and agent implementation requests"
created: 2026-09-17
updated: 2026-09-17
---

- Date: 2026-09-17
- Status: Adopted
- Follow-up decision: [0194](0194-mew-readonly-feature-panel.md) — Make the feature panel read-only; retain documents, APIs, CLI, and execution queue
- Follow-up decision: [0161](0161-mew-feature-markdown-source.md) — Move the canonical source for features and results to project Markdown; retain execution history on the server
- Follow-up decision: [0173](0173-mew-inline-feature-edit-dispatch.md) — Save specifications and accept agent jobs when applying inline edits to the feature hierarchy
- Follow-up extension: [0095](0095-mew-agent-sets-as-tab-presets.md) — Add a mew feature job system separate from set presets
- Decision makers: User direction, Codex design and implementation

## Decision

- Manage the feature tree, requirements versions, user judgments, implementation requests, and results based on the current project tab's absolute root. Store the ledger in the server data directory, separated by project. Unlike per-account UI state, features are shared by project members. Viewing requires the agent feature permission and project-wide read access; changes require full edit permission.
- Open the feature screen from **Features** in the menu. Place a tree with single-line rows beside the details, and switch between list and details on small screens. The top-level `+` request accepts a title, content, and agent set, allowing the agent to determine whether it is a new feature, a modification to an existing feature, or a subfeature.
- Use sets only as snapshots of runtime, model, and role. For classification, item updates, and result reporting, mew provides all sets with the same instructions and common CLI. Do not create feature-specific sets or a separate classification model.
- Use a unique tab in the existing independent agent supervisor for each request. Run requests within a project sequentially; different projects are independent. Closing the browser or switching projects does not cancel execution. Only a user stop cancels it. Server restoration reconnects only to the existing supervisor and does not automatically resend requests whose delivery status is unclear.
- Before implementation, the agent links items through the CLI, and before completion, it reports the implementation description, verification, actual files, and actual commits. Display mint only after confirming the report and a normal turn ending. Display missing reports, errors, and interruptions separately as execution statuses. Do not require automatic commits.
- Blue means implementation in progress, mint means implementation complete and awaiting user confirmation, green means user confirmation complete, red means the user has determined that revisions are needed, and orange means requirements changed. Saving the title or content changes the status to orange without automatically starting execution. From orange, users can change directly to green or assign it to the agent again.
- Check versions for user edits and judgments. Completion of an earlier run must not overwrite requirements or judgments changed after that run started. Parent statuses are independent, and subfeature approval does not propagate automatically. Sort within sibling groups and reflect descendant modification times in ancestor groups.
- Validate files and commits using paths within the project and actual Git objects. Ledger changes by the server and agent CLI share interprocess locking and atomic writes. Failed validation must not overwrite the existing ledger.

## Rationale

Features must remain the same items through repeated implementation and user review. Do not use agent conversations or set configurations as the ledger; provide a verifiable common update path to ensure consistent behavior across runtimes.

Detailed execution and storage contracts are defined in [Feature-driven development](../../specs/feature-development.md).
