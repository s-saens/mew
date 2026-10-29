---
title: "0082 — Desktop project sidebar"
description: "The decision to move desktop project selection into an independent panel to the left of the file explorer and provide command buttons for each project. Retains the mobile dropdown and existing list sorting, and defines project binding for command requests, root session isolation, and migration limitations for previously running sessions."
created: "2026-10-28"
updated: "2026-10-28"
---

- Status: Adopted
- Partially replaces the desktop dropdown in [0019 — Header project selector](0019-project-selector.md). Retains the mobile dropdown, project path list, and per-account switching and restoration.

## Background

When switching between projects to run commands, the dropdown closed, requiring the list to be reopened repeatedly. The user requested keeping the existing header display collapsed while opening the project list in a panel to the left of the file explorer on desktop, with command buttons for each project.

## Decision

At widths of 768px or more, the project selector in the header opens and closes a separate **project sidebar**. The sidebar is fixed to the left of the file explorer and shares the workspace width. It opens independently of the file explorer, is resizable, and preserves its open state and width in per-account browser settings. It stays open when a project is selected or another area is clicked. Close it with the close button or header selector; the panel itself is not registered in the Esc or back-navigation stack. Mobile uses the existing dropdown.

It shares the existing icons, handles, shortcut numbers on the right, full-row active highlighting, reordering, and right-click editing and deletion. The ▶ on each row opens that project's command list. While the sidebar is open, the duplicate command button in the header is hidden, and Alt+R and Ctrl+E open the command button on the current project's row. Alt+P opens the sidebar and moves focus to the first item. If a regular work panel is maximized, it is restored before the sidebar is shown.

Command listing, editing, execution, and status queries for inactive projects pin the request target using the optional `workspacePath`. They do not switch the current account's active project, and the server rechecks the target path and existing feature and project access permissions. Session identifiers for root project commands include the actual project folder path to prevent commands with the same name in different roots from colliding. Subdirectory commands are also identified by their actual folder.

## Alternatives and Rationale

- Keeping the dropdown uses less space but cannot keep the project list and command buttons visible.
- A floating list obscures the file explorer and work content. A fixed panel lets both navigation areas sit side by side and collapse independently.
- Putting the project list in the docking tree would let users move it elsewhere. It remains in a separate fixed area to preserve its position to the left of the file explorer and the mobile dropdown.
- Switching projects before running a command would also change the current document and layout. Pinning the target per request runs that project's command while preserving the work view.

## Impact and limitations

The project sidebar uses desktop workspace width; closing it restores the existing header icon, name, and command button. It is hidden while a panel is maximized, like other auxiliary panels, and its open state and width are restored afterward. The existing storage contracts for the project list, order, icons, and active root remain unchanged.

Root command sessions already running under previous identifiers are not terminated automatically. The new menu does not continue displaying their running status, so users can check output and terminate them in the existing terminal. Folder-specific identifiers are used starting with new executions.

Current behavior follows [Project features](../features/projects-files-search/opening-projects-tabs-and-groups.md), [Command button](../features/terminals-agents-automation/project-command-buttons.md), and [Shared UI contract](../development/ui-contracts.md#header-project-switcher). Validation and production application scope are recorded in the [Work record](../work/desktop-project-sidebar.md).
