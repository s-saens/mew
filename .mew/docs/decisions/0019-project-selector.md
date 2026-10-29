---
title: "0019 — Header Project Selector"
description: "Decision to replace the header's project tabs, close, reorder, and group UI with the current project's icon and name and a dropdown selector. The project sidebar in subsequent decision 0082 replaces the desktop list, while the mobile dropdown, path order, restoration on switching, and metadata preparation remain. Access roles and handle-based reordering follow subsequent decisions 0070 and 0071."
created: 2026-10-19
updated: 2026-10-28
---

- Status: Adopted
- Partially superseded: [0082](0082-desktop-project-sidebar.md) replaces the desktop dropdown with a project sidebar to the left of the file explorer. The mobile dropdown and collapsed header display remain.
- Subsequent change: [0071](0071-project-list-reorder.md) adds handle-based reordering to the dropdown list. Project tabs and group UI remain removed.
- Subsequent change: [0070](0070-manager-project-access.md) expands project access from owner-only to owner and manager.
- Partially supersedes: the UI in [ADR 0004](0004-subproject-folder-exploration.md) that displays projects as separate header tabs. General folder navigation, separate navigation arrows, owner permissions, and per-account active root boundaries remain unchanged.
- Scope of replacement: project tab listing, closing, drag reordering, and group operations in the existing header. The project path list, account storage format, and active root switching API remain unchanged.

## Background

Listing header tabs and groups for every project mixes the current project with switching targets, making selection difficult. The user requested a button showing only the current project's icon and name that opens a selection list when clicked, along with shorter switching waits.

## Decision

Place only a button showing the current project's icon and name on the left side of the header. Clicking it lists saved projects in order in the shared menu, with **Add Project** as the last item. Reuse existing project paths and order, and do not display group information. `Alt+1…9` follows the list order, and icon changes remain available from the current project button and list rows.

Retain the owner restriction on adding and switching projects, per-account active roots, per-project restoration of documents, layouts, and scroll positions, and the existing working paths of running agents. Navigate subprojects as ordinary folders in the current tree, and use a separate arrow to select their working root.

When a dropdown item is hovered or focused, prepare only UI metadata scoped to the account and absolute root. Reuse the same request during the actual switch and limit concurrent speculative requests. Do not query files or trees or claim agent sessions before selection. If permissions change, discard previous restoration responses and query with the new permissions.

## Rationale and Impact

Show the current project in one place and switching targets only when needed. Retaining the existing path list eliminates the need to add projects again for the new selector. Tab closing, reordering, and grouping are removed, and no separate management UI is provided for saved groups.

Metadata queries before selection do not change the actual root and reduce duplicate waits in the existing switch POST and cache restoration paths. Delayed responses in isolated tests verify request order and cache reuse; guaranteeing latency across the actual server, large editors, and agent reconnection requires separate production measurements. Current behavior and verification scope follow [Project Features](../features/projects-files-search/opening-projects-tabs-and-groups.md) and the [Project Selector and Fast Switching UI Contract](../development/ui-contracts.md#header-project-switcher).
