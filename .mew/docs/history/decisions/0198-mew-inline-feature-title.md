---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Inline feature title editing. Preserves the choices and rationale at the time and links to subsequent decision 0049, which replaces document title editing with branch work settings."
title: "0198 — Inline feature title editing"
created: 2026-10-06
updated: 2026-10-06
---

- Status: Adopted
- Decision maker: User direction, Codex implementation
- Partially supersedes: [0194](0194-mew-readonly-feature-panel.md) — Prohibition on title editing and no calls to mutation APIs
- Partially supersedes: [0196](0196-mew-file-backed-feature-tree.md) — Open a document by clicking its title
- Subsequent decision: [0049](../../decisions/0049-branch-feature-previews.md) — Display branch-specific work settings and previews instead of a document list

## Decision

- Accounts with edit permission click a title in the feature panel to edit it directly. Save with Enter or by moving focus, and cancel input with Esc. Open the original document only through the document icon on the right.
- Titles are based on filenames and use the existing feature editing API's version checks, file/folder renaming, and link correction. Save using the version from when input began to avoid overwriting external changes, and retain input when saving fails.
- Read-only accounts cannot edit titles. Title changes do not create agent runs, and other removed detail and execution controls are not reintroduced.

Detailed contract: [Feature-Driven Development](../../specs/feature-development.md).
