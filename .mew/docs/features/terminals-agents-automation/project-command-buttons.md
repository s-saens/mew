---
id: "mew-agents-project-commands"
parent: "mew-agents"
title: "Project command button"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-17"
status_hash: "11b4825abce468fc30154b3c9ff1e214231099d5c6effbd50778959e7f752969"
files: ["src/components/CommandButtonMenu.tsx", "src/components/CommandButtonResultPopup.tsx", "src/components/SessionTerminalPopup.tsx", "server/cmdButtons.ts", "server/command-button-results.ts"]
commits: []
description: "Contract for the project command menu, root-isolated sessions, latest one-shot output and exit status, found servers and APKs, delivery actions, recovery, and shortcuts."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Run recurring commands for the current project using buttons and view their output.
- The command menu also opens [results and publishing](project-delivery-pipelines.md) and named [Build and Deploy actions](project-build-deploy-actions.md). Their settings do not replace the legacy command file or shortcuts.

### Scope

- When the project sidebar is closed or on mobile, place a ▶ button immediately to the right of the project title in the top bar. When the desktop project sidebar is open, ▶ on each project row opens the same command menu. Existing dropdown items provide per-project command registration, editing, execution, stopping, and a dedicated terminal popup.
- ▶ on an inactive project row handles only that project's commands and does not switch the current project. Fetch, save, and run requests and polling stay pinned to the target project, and the server rechecks the path and existing permissions. If the current project uses a worktree, its row uses the selected actual working root. Root project command sessions are identified by actual folder path and command name, isolating them from commands with the same name in other roots.
- A command configured to close its terminal after completion retains its most recent result, whether successful or failed. The terminal popup shows the live session while it runs, then its saved output and exit code, including when reopened later. A new run replaces that result when it finishes; a second run of the same one-shot command cannot start while its session is active.
- Put Results & release, Build, and Deploy at the top of this same menu, above the saved command rows. Opening one closes the dropdown and opens its existing project-scoped dialog. The entries stay available when command metadata is loading or cannot be read; selecting one does not execute any command or deployment. Do not render separate action buttons beside ▶.
- Show eligible APKs currently found in standard build output locations in this menu with direct download controls. Identify them as found files rather than results of a specific run; their scope and download checks follow the [build action contract](project-build-deploy-actions.md#runs-and-results).
- When a running command session reports a supported local HTTP(S) address, show it with its command name in the menu's Found servers section. Open it through the host Browser with its separate permission and navigation guards. A captured address may be stale or unavailable and does not prove server readiness. No command, server, or deployment starts when opening the link.
- Pressing the button does not open the file explorer or a separate task panel. Close the list by pressing outside it, pressing Esc, or using Back.
- When the project or hamburger dropdown is open, a single click or tap on ▶ closes the existing menu and opens the command list immediately. Pressing another top bar menu button from the command list switches menus the same way.
- Close the dropdown first when opening the edit dialog by pressing Add Command or right-clicking or long-pressing a command name. The menu must not remain above the edit dialog and obscure input, and closing the edit dialog with Cancel, Esc, or Back must not reopen the list.
- Alt+R or the existing Ctrl+E blocks the browser's default behavior and editor or terminal input, and opens the current project's command list. Use ▶ on the current project row when the project sidebar is open, or the top bar ▶ when it is closed or on mobile. After loading the list, focus the first runnable command name, or Add Command if the list is empty. If the list is already open, return to the same position. Preserve the remote screen's dedicated keyboard input priority.
- Unmodified 1–9 and numeric keypad keys run commands in list order, just like clicking their names. Show numbers at the far right of the first 9 items and provide `aria-keyshortcuts`. Exclude web links, Stop, Terminal, Add, and reorder handles from number selection.
- Use the same layout as the project list: handle on the left, name in the middle, and number on the right. Reorder by dragging the handle with a mouse or touch, using ↑/↓ on the handle, or Shift+↑/↓ on the row. Save the order in the existing project command file while preserving command contents, the exit-after-completion option, and running state. Process consecutive saves in order, and prevent status polling from overwriting the order during saving. If saving fails, revert to the last saved order and display an error.
- Highlight running commands using the background of the entire item, including its handle and buttons, instead of a separate checkmark or dot. Show hover and focus across the entire item as well.
- Up and Down cycle through the result/build/deploy entries, command rows, and Add Command; Left and Right cycle through the name, Run/Stop, and Terminal buttons in the same row. Skip disabled buttons, and use Home/End to move to the first/last row. Enter/Space activates the focused button, and closing with Esc returns focus to ▶.
- Do not display internal project identifiers such as `.workspace` at the top of the list.
- The list uses the same shared `ActionMenuSurface` header style as the hamburger and project menus. Width, font, row height, spacing, and focus indicators follow the [shared UI contract](../../development/ui-overlays.md#dropdowns-and-selection-components).
- Restore previously saved file explorer command tabs as the file explorer.

### Boundaries and limitations

- Subprojects registered in the list can also use ▶ on their sidebar rows. If a project is not listed, open it first.
- Button settings are per project and differ from global terminal buttons that insert strings into the current shell.
- Commands started before the root session identifier change are not automatically terminated. The new menu does not continue displaying those sessions' running state; inspect and terminate them through their existing terminals. Subdirectory commands are also identified by their actual folder. Follow [Decision 0082](../../decisions/0082-desktop-project-sidebar.md).
- Output from one-shot commands that finished before result retention was implemented cannot be recovered. Forced termination may interrupt output capture.

### Detailed contracts

- [Commands and scheduled tasks](../../../../docs/guides/commands.md) · [Project tab boundaries](../../../../docs/guides/projects.md)

<!-- mew:implementation:start -->
## Implementation details

- The top bar, project sidebar, and subproject rows use the same `CommandButtonMenu`. Keep the sidebar menu's `workspacePath` as the target for requests, responses, and polling, independently of switching the account's active root. The dropdown provides project results/publishing and Build/Deploy entry points as well as command registration, editing, execution, stopping, and a dedicated terminal popup. Keep the dialogs mounted outside the dropdown so closing it cannot discard an open dialog or its background completion watcher.
- Run one-shot commands through the existing PTY command runner and store their output under the server data directory by command session identity. Preserve the previous result while a new run starts; retain the latest completed result after the next status read. Display a bounded 512 Ki-character plain-text preview and allow the full compressed terminal output to be downloaded. Use the existing terminal permission and project path checks for result and archive requests. Poll while the popup is open, independently of menu polling. The runner saves before closing the session, and results survive a server restart while the data directory remains available.
- Fetch command metadata while the menu is open and poll every 3 seconds. Initial loading and recoverable polling failures show only the shared three-dot loading indicator. Keep the last verified rows visible during recovery, and disable running, stopping, adding, editing, and reordering until metadata is healthy. Serialize metadata reads so a slow request can finish without a later poll superseding it.
- Derive web links only from bounded recent output of that command's own session; do not scan host listeners or expose a generic proxy. Discard credentials and sensitive URL components. Keep capture failures isolated from command status. Session existence and old output are not evidence of an active server. The [Browser contract](../../development/browser-desktop.md) owns navigation restrictions, including Mew's reserved ports.
- After an initial recoverable failure, allow up to eleven automatic retries. Stop polling when that budget is exhausted or a permanent API error occurs, and show a scoped error with an accessible Retry icon. An explicit retry starts a fresh budget without reloading the page. Authentication, permission, and other permanent client errors require explicit recovery immediately; HTTP 408, 429, server errors, and transport failures remain retryable.
- Keep metadata failures separate from explicit execution, stopping, saving, and preview errors. Successful polling must not erase a failed action, and automatic metadata recovery must never replay a command or other mutation. Shared loading and recovery presentation follows the [UI contract](../../development/ui-contracts.md).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `server/command-button-recovery-ui.test.ts` checks quiet initial loading and polling recovery, retained cached rows with disabled actions, eleven retries after the initial failure, stopped polling and explicit recovery after exhaustion or permission failure, preserved command execution errors without replay, and a slow successful request that is not superseded by polling.

- `server/cmd-button-workspace.test.ts` and `server/cmd-button-workspace-ui.test.ts` test target-specific command requests that do not change the current project, along with server permission and execution boundaries. Per-folder session identifiers for root commands are tested in `server/cmd-button-workspace.test.ts`. Results and legacy session limitations follow the [project sidebar work record](../../work/desktop-project-sidebar.md).
- `server/command-button-results.test.ts` exercises isolated tmux completion, errors, replacement, scope, output bounds, and restoration after a failed start. The result popup regression test covers the live-to-saved transition and reopening.
- `server/header-menu-switch-ui.test.ts` tests single-press switching between project, command, and hamburger menus, closing the existing menu, focus, Esc/Back, and blocking ordinary outside clicks on desktop and mobile with light and dark solid and gradient backgrounds.
- `src/utils/command-menu-keyboard.test.ts` tests blocking Ctrl+E default behavior and propagation, excluding repeats, modifiers, and IME input, remote input priority, arrow-key cycling, and skipping disabled buttons in a DOM environment.
- `server/overlay-layers-ui.test.ts` tests whether the list disappears and the edit dialog receives input when adding, right-clicking to edit, or long-pressing to edit, and whether the list stays closed after Cancel or Esc, on desktop and mobile with light and dark gradients.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that execution uses the selected project's cwd and command file, and that closing the popup is distinct from terminating the process.

<!-- mew:validation:end -->
