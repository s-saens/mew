---
id: "mew-agents-project-commands"
parent: "mew-agents"
title: "Project command button"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "11b4825abce468fc30154b3c9ff1e214231099d5c6effbd50778959e7f752969"
files: ["src/components/CommandButtonMenu.tsx", "src/components/SessionTerminalPopup.tsx", "server/cmdButtons.ts"]
commits: []
description: "Contract for registering, running, and stopping per-project commands and viewing output from ▶ in the top bar and desktop project sidebar. Explains Alt+R, Ctrl+E, number selection, handle-based reordering, highlighting the entire running row, pinning request targets without switching projects, per-root session isolation, legacy session limitations, and the boundary with global terminal buttons."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Run recurring commands for the current project using buttons and view their output.

### Scope

- When the project sidebar is closed or on mobile, place a ▶ button immediately to the right of the project title in the top bar. When the desktop project sidebar is open, ▶ on each project row opens the same command menu. Existing dropdown items provide per-project command registration, editing, execution, stopping, and a dedicated terminal popup.
- ▶ on an inactive project row handles only that project's commands and does not switch the current project. Fetch, save, and run requests and polling stay pinned to the target project, and the server rechecks the path and existing permissions. If the current project uses a worktree, its row uses the selected actual working root. Root project command sessions are identified by actual folder path and command name, isolating them from commands with the same name in other roots.
- Pressing the button does not open the file explorer or a separate task panel. Close the list by pressing outside it, pressing Esc, or using Back.
- When the project or hamburger dropdown is open, a single click or tap on ▶ closes the existing menu and opens the command list immediately. Pressing another top bar menu button from the command list switches menus the same way.
- Close the dropdown first when opening the edit dialog by pressing Add Command or right-clicking or long-pressing a command name. The menu must not remain above the edit dialog and obscure input, and closing the edit dialog with Cancel, Esc, or Back must not reopen the list.
- Alt+R or the existing Ctrl+E blocks the browser's default behavior and editor or terminal input, and opens the current project's command list. Use ▶ on the current project row when the project sidebar is open, or the top bar ▶ when it is closed or on mobile. After loading the list, focus the first runnable command name, or Add Command if the list is empty. If the list is already open, return to the same position. Preserve the remote screen's dedicated keyboard input priority.
- Unmodified 1–9 and numeric keypad keys run commands in list order, just like clicking their names. Show numbers at the far right of the first 9 items and provide `aria-keyshortcuts`. Exclude ports, Stop, Terminal, Add, and reorder handles from number selection.
- Use the same layout as the project list: handle on the left, name in the middle, and number on the right. Reorder by dragging the handle with a mouse or touch, using ↑/↓ on the handle, or Shift+↑/↓ on the row. Save the order in the existing project command file while preserving command contents, the exit-after-completion option, and running state. Process consecutive saves in order, and prevent status polling from overwriting the order during saving. If saving fails, revert to the last saved order and display an error.
- Highlight running commands using the background of the entire item, including its handle and buttons, instead of a separate checkmark or dot. Show hover and focus across the entire item as well, and place port buttons on a lower line within the same item.
- Up and Down cycle through command rows and Add Command; Left and Right cycle through the name, Run/Stop, and Terminal buttons in the same row. Skip disabled buttons, and use Home/End to move to the first/last row. Enter/Space activates the focused button, and closing with Esc returns focus to ▶.
- Do not display internal project identifiers such as `.workspace` at the top of the list.
- The list uses the same shared `ActionMenuSurface` header style as the hamburger and project menus. Width, font, row height, spacing, and focus indicators follow the [shared UI contract](../../development/ui-contracts.md#dropdowns-and-selection-components).
- Restore previously saved file explorer command tabs as the file explorer.

### Boundaries and limitations

- Subprojects registered in the list can also use ▶ on their sidebar rows. If a project is not listed, open it first.
- Button settings are per project and differ from global terminal buttons that insert strings into the current shell.
- Commands started before the root session identifier change are not automatically terminated. The new menu does not continue displaying those sessions' running state; inspect and terminate them through their existing terminals. Subdirectory commands are also identified by their actual folder. Follow [Decision 0082](../../decisions/0082-desktop-project-sidebar.md).

### Detailed contracts

- [Commands and scheduled tasks](../../../../docs/guides/commands.md) · [Project tab boundaries](../../../../docs/guides/projects.md)

<!-- mew:implementation:start -->
## Implementation details

- The top bar and project sidebar use the same `CommandButtonMenu`. Keep the sidebar menu's `workspacePath` as the target for requests, responses, and polling, independently of switching the account's active root. The dropdown provides per-project command registration, editing, execution, stopping, and a dedicated terminal popup.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `server/cmd-button-workspace.test.ts` and `server/cmd-button-workspace-ui.test.ts` test target-specific command requests that do not change the current project, along with server permission and execution boundaries. Per-folder session identifiers for root commands are tested in `server/cmd-button-workspace.test.ts`. Results and legacy session limitations follow the [project sidebar work record](../../work/desktop-project-sidebar.md).
- `server/header-menu-switch-ui.test.ts` tests single-press switching between project, command, and hamburger menus, closing the existing menu, focus, Esc/Back, and blocking ordinary outside clicks on desktop and mobile with light and dark solid and gradient backgrounds.
- `src/utils/command-menu-keyboard.test.ts` tests blocking Ctrl+E default behavior and propagation, excluding repeats, modifiers, and IME input, remote input priority, arrow-key cycling, and skipping disabled buttons in a DOM environment.
- `server/overlay-layers-ui.test.ts` tests whether the list disappears and the edit dialog receives input when adding, right-clicking to edit, or long-pressing to edit, and whether the list stays closed after Cancel or Esc, on desktop and mobile with light and dark gradients.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that execution uses the selected project's cwd and command file, and that closing the popup is distinct from terminating the process.

<!-- mew:validation:end -->
