---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Split changes and commit history in the default Git view. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0168 — Split changes and commit history in the default Git view"
created: 2026-09-23
updated: 2026-09-23
---

- Date: 2026-09-23
- Status: Adopted
- Follow-up decision: [0170](0170-mew-git-selected-files-and-composer.md) — Default composer area and committing selected files
- Partially supersedes: [0114](0114-mew-git-workbench-popup.md) — default view showing the working tree as the first graph entry
- Decision maker: User direction, Codex implementation

## Decision

Split the current project's default Git panel view into a changed-file list above and a commit graph below. The two lists scroll independently, and their height ratio can be adjusted by dragging the divider or using the keyboard. Diffs can be opened directly from changed files; retain the existing views for composing commits and viewing past commit details.

Each commit row displays a small graph, title, relative time, short hash, and author on one line. Use only the largest applicable unit among minutes, hours, and days. Remove the empty top bar and duplicate project root text from the default view. Do not change the current project scope, docking, drafts, or Git operation permissions.

## Rationale

This addresses a user request to directly compare current changes with past history and see more commits even in a narrow panel. The detailed contract is defined in [Git usage](../../../../docs/guides/projects.md#git-operations-panel).
