---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Git commits for selected files and the default composer area. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0170 — Git commits for selected files and the default composer area"
created: 2026-09-23
updated: 2026-09-23
---

- Status: Adopted
- Follow-up decision: [0175](0175-mew-git-history-changes-composer-order.md) — reorder as history, changes, and input; retain selected-file commits and composition
- Follow-up decision: [0174](0174-mew-commit-skill-and-automatic-commits.md) — AI Auto Commit executes actual split commits; retain selected-file boundaries and manual composition
- Partially supersedes: [0168](0168-mew-git-changes-history-split.md) — retain the separate commit composition screen
- Partially supersedes: [0114](0114-mew-git-workbench-popup.md) — committing the entire working tree
- Decision maker: User direction, Codex implementation

## Decision

The default Git view places commit composition, changed files, and commit history in that order, with initial heights of approximately 30:50:20. Place a vertically resizable description field below the title and commit button. File checkboxes and Select All determine the commit scope. Exclude unchecked files from the commit regardless of staging status, and preserve their existing staging status. Do not automatically select newly changed files.

The AI Auto Commit button generates draft titles and descriptions for the selected files. Preserve the boundaries in [0166](0166-mew-git-ai-commit-drafts.md) for agent sets, independent tasks, user application of drafts, and explicit commit confirmation. Do not apply existing results if the selection or the corresponding changes have changed.

## Rationale

The user requested completing change selection and message composition in one screen. Detailed behavior is documented in [Git Usage](../../../../docs/guides/projects.md#git-operations-panel).
