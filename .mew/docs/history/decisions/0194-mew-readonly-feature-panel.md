---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Read-only feature panel. Preserves the choices and rationale from that time and links to subsequent decision 0049, which changed it to a per-branch work and preview panel, and to the current contract."
title: "0194 — Read-only feature panel"
created: 2026-10-04
updated: 2026-10-04
---

- Status: Adopted
- Partially supersedes: [0173](0173-mew-inline-feature-edit-dispatch.md) — Inline editing and immediate submission in the feature panel
- Partially supersedes: [0159](0159-mew-feature-driven-development.md) — Request, judgment, and stop controls in the feature panel
- Decision maker: User direction, Codex implementation
- Subsequent decision: [0196](0196-mew-file-backed-feature-tree.md) — Simple tree of titles, child items, and document opening; retain the read-only boundary

- Subsequent decision: [0198](0198-mew-inline-feature-title.md) — Inline title editing for accounts with edit permissions; open documents only through icons
- Subsequent decision: [0049](../../decisions/0049-branch-feature-previews.md) — Switch the panel to per-branch work, previews, and user judgments; preserve existing documents and execution APIs

## Decision

- Provide the feature panel as read-only for all accounts. Remove the UI for agent set selection, title and body editing, item and feature creation, requests, redelegation, retries, status judgments, and stopping execution.
- Retain hierarchy and section collapsing and expansion, sorting and refreshing, opening source documents, related files, commits, and existing conversations, viewing work history, and restoring view state.
- Retain the document editor, external Markdown editing, and existing APIs, CLI, and execution queue. Do not call mutation APIs or query agent sets from the panel.
- Separate viewing from modification as requested by the user. Do not reintroduce removed panel controls without an explicit follow-up request.

Detailed contract: [Feature-Driven Development](../../specs/feature-development.md).
