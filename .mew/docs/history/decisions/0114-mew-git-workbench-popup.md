---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The Git workbench opens as a sidebar popup. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0114 — The Git workbench opens as a sidebar popup"
created: 2026-09-04
updated: 2026-09-23
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0170](0170-mew-git-selected-files-and-composer.md) — Default composer area and committing selected files
- Follow-up decision: [0168](0168-mew-git-changes-history-split.md) — Splits the default view into a changed-file list and commit graph; replaces the working tree as the first item
- Follow-up decision: [0135](0135-mew-git-workspace-panel.md) — Replaces the standalone popup with a shared docking panel with repository tabs; retains the graph, details, diff, and Git API
- Follow-up decision: [0115](0115-mew-git-menu-and-repository-picker.md) — Git button placement and immediate repository selection; retains the popup graph/details/diff
- Partially supersedes: 0113 — The Git workbench's file tab lifecycle and sidebar toolbar placement
- Decision maker: Song Sanghoon (directive)

## Background

Opening the Git graph creates a tab that replaces the file currently being edited, interrupting the document workflow. Git is a tool for
briefly exploring a repository, so it does not need the same lifecycle as document and code editing tabs.

## Options

1. Keep it as a file tab — Shares splitting and restoration but occupies editor space.
2. Use a standalone popup opened from the sidebar toolbar — Preserves editing tabs and can be closed when needed.

## Decision

Adopt option 2.

- Place the root Git button immediately after the explorer in the sidebar toolbar, second from the left.
- All Git buttons pass the repository-relative path to a popup that displays the Git graph, commit details, patches, and allowed Git operations. Clicking
  outside, clicking the close button, or pressing Esc closes the popup.
- The popup navigates through the `그래프 → 커밋 또는 작업트리 상세 → 파일 diff` hierarchy within a single view. In details and diff views, the back button
  at the top left returns to the previous level, while the close button at the top right remains visible.
- The first graph entry is always the uncommitted working tree. Its details show all changed files and allow users to open
  per-file diffs; entering a title and optional description creates a single commit containing all changes.
- Past commit details also initially load only the changed-file list; selecting a file displays its patch and before-and-after line
  numbers in a separate diff view.
- The Git workbench is not included in file tabs, splits, tab ordering, or per-account tab restoration. Existing saved `mew:git:` virtual tabs are
  removed during restoration and resaving.
- Repository detection, permitted Git APIs, and safe operation boundaries follow ADR 0113 unchanged.

## Rationale

Exploring repository history is a temporary supporting task, so a popup preserves the editing context. Cleaning up previously saved
virtual tabs ensures that Git views no longer appear in the editor after deployment.
