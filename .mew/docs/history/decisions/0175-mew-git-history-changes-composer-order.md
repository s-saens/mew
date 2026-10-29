---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: arrange the Git panel in the order of history, changes, and commit input. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0175 — Arrange the Git panel in the order of history, changes, and commit input"
created: 2026-09-23
updated: 2026-09-23
---

- Status: Adopted
- Decision maker: User request
- Partially supersedes: [0170](0170-mew-git-selected-files-and-composer.md) — the position and vertical order of the default composition area

## Decision

The default Git view places commit history, the changes list, and commit input in that order from top to bottom. Initial heights are approximately 20:50:30. Preserve existing independent scrolling, list boundary adjustment, input area resizing, selected files, and drafts. Do not recreate the tab bar.

Reflect the user's request to review recent history at the top, select files in the middle, and commit at the bottom. Preserve the actual automatic commit contract in [0174](0174-mew-commit-skill-and-automatic-commits.md). Current operations are documented in [Git Usage](../../../../docs/guides/projects.md#git-operations-panel).
