---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: inline specification editing and immediate task submission in the feature hierarchy. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0173 — Inline specification editing and immediate task submission in the feature hierarchy"
created: 2026-09-23
updated: 2026-09-23
---

- Status: Adopted
- Follow-up decision: [0194](0194-mew-readonly-feature-panel.md) — Make the feature panel read-only; retain documents, APIs, CLI, and execution queue
- Partially supersedes: [0159](0159-mew-feature-driven-development.md) — separate list and detail views, and separate redelegation after GUI editing
- Decision maker: User direction, Codex implementation

## Decision

- Display requirements, implementation descriptions, and verification as individual text items within the feature hierarchy and edit them inline. View related files, commits, and task history under the same feature. Use the same hierarchy on mobile.
- Applying an item edit in the GUI immediately submits a task to the currently selected agent set. Saving the specification and creating the request form a single locked, recoverable write unit. Preserve drafts on transmission failure or version conflict, and do not execute duplicate requests when retrying with the same request ID.
- Capture the complete modified specification and its before-and-after versions in the request. Interpret edits to implementation descriptions and verification wording as new behavior the user wants, and update completion reports with actual implementation and verification results. Preserve file and commit evidence and past execution reports even when the user edits the wording.
- Maintain existing duplicate prevention for queued or running tasks for the same feature. Users may draft edits, but can apply them only after the existing task completes or is stopped.
- Do not automatically execute tasks for edits to general documents or external Markdown. Preserve the canonical source, concurrent editing, and permissions in [0161](0161-mew-feature-markdown-source.md), along with the existing queue and supervision contracts.

Detailed contract: [Feature-Driven Development](../../specs/feature-development.md).
