---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The Git panel opens only the current project. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0160 — The Git panel opens only the current project"
created: 2026-09-17
updated: 2026-09-17
---

- Date: 2026-09-17
- Status: Adopted
- Partially supersedes: [0115](0115-mew-git-menu-and-repository-picker.md), [0135](0135-mew-git-workspace-panel.md) — unified repository selection, nested discovery, and multiple repository tabs
- Decision maker: User direction, Codex implementation

## Decision

- The Git menu item and Alt+G directly open the Git workbench at the current project root. Work on subprojects in the independent project tabs defined in [0158](0158-mew-subprojects-open-root-tabs.md).
- Remove the selector for nested repositories and separate Documents repositories, along with the New Git Tab button. If the current project root is not a Git repository, show an empty state without opening a parent or child repository instead.
- Normalize previously saved Git tabs to the single current project root. The repository list API also checks only the root of the request scope and does not search recursively. Retain existing path-based Git APIs, including file history and commit lookups for feature results.
- Retain the shared work panel, docking movement, resizing, per-project layouts, draft retention while hidden, and closing on mobile. Closing the panel's single tab or pressing Ctrl+W collapses the Git panel. Refreshing does not restore commit drafts.

## Rationale

The user has already defined the work scope in the project tab, so there is no need to select a repository again in the Git panel. Align Git work boundaries with each project and eliminate unnecessary subrepository discovery. Record a subsequent decision before reintroducing the removed unified selector in the same form.

The current standards are defined in [Git usage](../../../../docs/guides/projects.md#git-operations-panel) and [UI contracts](../../development/ui-contracts.md#git-repository-tabs).
