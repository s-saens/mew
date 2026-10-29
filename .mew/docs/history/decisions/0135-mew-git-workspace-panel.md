---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The Git workbench is a workspace panel with repository tabs. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0135 — The Git workbench is a workspace panel with repository tabs"
created: 2026-09-12
updated: 2026-09-12
---

- Date: 2026-09-12
- Status: Adopted
- Follow-up decision: [0160](0160-mew-git-current-project-only.md) — a single repository for the current project; removes the picker and additional tabs, preserves docking and drafts
- Partially supersedes: [0114](0114-mew-git-workbench-popup.md) — standalone popup, exclusion from split layouts, and popup closing behavior
- Partially supersedes: [0115](0115-mew-git-menu-and-repository-picker.md) — the lifecycle that starts from the popup picker every time
- Partially supersedes: [0134](0134-mew-dockable-workspace-panels.md) — adds Git to shared workspace panel types
- Decision maker: User (requested changing the Git popup into a panel like other workspace panels)

## Decision

- manager and owner open the Git workspace panel through the existing header menu or `Alt+G`. Use repository tabs separate from editor file tabs, and do not restore `mew:git:` virtual file tabs.
- Initial entry and `+` open a picker for the root project, Documents, and nested Git repositories. For a repository with the same project scope and relative path, select the existing tab.
- In `DockWorkspace`, Git can be moved by its handle, its tabs can be detached or merged, and its boundaries can be resized. Preserve the browser's vertical layout restriction. The tab bar, add, and close UI use the same form as agents, terminals, and browsers.
- Closing a panel gathers its tabs into remaining Git panels or collapses the last panel according to the shared docking contract. Moving tabs or hiding panels does not remount the body, preserving the current detail view and commit draft. Closing a tab closes only that repository view.
- Save open state, repository tabs, and docking assignments in the account's workspace UI state per root project. Refreshing restores repository tabs and layout but does not persist commit drafts.
- On mobile, use the same foreground switching, Esc, and back-navigation stack as other workspace panels. Do not close Git when another workspace area is clicked.
- Preserve graph → details → diff, return to repository list, Git APIs, permissions, user confirmation, and commit scope. Remove the popup backdrop and redundant window close buttons inside the body. Do not reintroduce the Git popup.

Keep current usage instructions in [Projects and Git](../../../../docs/guides/projects.md) and layout contracts in [UI contracts](../../development/ui-contracts.md).
