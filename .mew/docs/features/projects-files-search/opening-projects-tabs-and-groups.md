---
id: "mew-projects-tabs"
parent: "mew-projects"
title: "Opening, Selecting, and Switching Projects"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "03b352e53f93242f9efdfd05c5bd632f9bf92dd1a456279d6b0eb0efd066cd3f"
files: ["src/components/file-action-menu.tsx", "src/hooks/use-external-file-actions.tsx", "src/components/file-browser-favorites.tsx", "server/file-favorites.ts", "src/components/file-browser.tsx", "src/components/OpenProjectDialog.tsx", "src/components/ProjectSwitcher.tsx", "server/projects.ts", "server/cloud-storage.ts"]
commits: []
description: "Defines the project sidebar on the left of the file explorer opened from the desktop header, per-project command buttons, independent restoration of open state and width, and the mobile dropdown. Explains shared handle sorting, numbers on the right, full-row active highlighting, right-click editing, list removal and addition, Alt+P and Alt+1…9, shared icons, per-account restoration of switching state, and the boundaries of server folder browsing, subprojects, worktrees, access permissions, and running sessions."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Owners and managers can use project listing, addition, switching, icon changes, folder creation, Git clone/initialization, and subproject/worktree switching. The list and active root are saved per account. Members and guests see only the current project. Follow [Decision 0070](../../decisions/0070-manager-project-access.md).

- `Ctrl/Cmd+O` opens the server file browser for accounts with server file permissions. Opening a file retains the current project and brings the editor to the front on mobile. `Ctrl/Cmd+Shift+O` opens the Open Project dialog for owners and managers. Combinations with Alt and IME composition are not handled.

- Open server folders as projects and move between workspaces using the current project selector in the header.

### Scope

- Use the project's single `.mew/project-icon.json` as the shared icon in the file explorer and project selector.
- Center project icons in the selector list horizontally and vertically within a 16×16px area. Line icons, custom SVGs, and emoji all use the same area to maintain vertical alignment with the title.

- Provide default OS/cloud folders and per-account favorites at the top of Add Project and the server file explorer.
- The project selection window provides folder browsing, cloud shortcuts, New Folder, Git clone, and Git initialization.
- When the project sidebar is closed, the left side of the header shows the current project's icon and name with a command button beside them. The project button has equal left and right padding of 10px, and the icon fills a 16×16px area so no extra internal spacing is added on the left. Clicking it on desktop (768px or wider) opens the **project sidebar** to the left of the file explorer; on mobile, it opens the existing dropdown. The last list item is **Add Project**. No tab listing or group UI is provided.
- The project sidebar is a fixed panel that does not cover the work content. It opens and closes independently of the file explorer and can be resized using its right edge. Its open state and width are saved in per-account browser settings and retained across project switches. Selection, clicking outside, Esc, and Back do not close the panel. Closing it with the Close button or header selector restores the existing header display. It is hidden while a work panel is maximized and returns to its previous state when the panel is restored.
- Each row in the project sidebar provides a ▶ command button. Clicking another project's command button opens that project's command list without switching the current project. When the panel is open, the duplicate header command button is hidden. Command execution, editing, output, Alt+R, and Ctrl+E follow the [command button contract](../terminals-agents-automation/project-command-buttons.md).
- Right-clicking, `Shift+F10`, or pressing the Menu key on the current project button or a list row opens a menu with **Edit** and **Delete**. Touching and holding the current button opens the same menu. Opening a menu from a list row keeps the project list open. Esc and Back first close only the Edit/Delete menu and return focus to the invoking row. Deleting an inactive project removes only that row from the open list. Edit opens the existing icon picker; Delete removes the project only from the account's project list and preserves the actual folders and files. Deleting the current project switches to another project before removing it; if switching fails, the list is preserved. Deletion is disabled for the last remaining current project.
- Drag the handle on the left of a list row up or down with a mouse or touch to reorder it. The name area is used to select projects and scroll the list. Rows can also be moved using `Shift+↑/↓` on the row or `↑/↓` on the focused handle. Reordering does not switch projects or close the menu and is saved to the account's path list and browser copy. The final Add Project item does not move. Follow [Decision 0071](../../decisions/0071-project-list-reorder.md).
- `Alt+P` opens the desktop project sidebar or mobile list for an owner or manager and focuses the first item. If it is already open, it only moves focus to the first item. If a work panel is maximized, it restores the panel before opening the sidebar. It also works in regular input fields, but does not open the list when combined with Shift or Ctrl/Cmd, during IME composition, key repeat, or modal input, or without permission. Special characters produced by macOS Option are also recognized using the physical `KeyP` key, and the remote keyboard takes priority when a remote screen has focus. The invoking button provides `aria-keyshortcuts="Alt+P"`.
- Project selection, icon changes, and per-account screen restoration are provided. `Alt+1…9` selects projects in list order. The first 9 items display `Alt+1` through `Alt+9` on the right and also expose them through `aria-keyshortcuts`. Reordering updates the displayed numbers. No number is displayed for the 10th item onward or for Add Project.
- The current project is highlighted with a background across the entire row, including the handle, without a check icon, and retains its `aria-checked` state. It shares handle and row highlight styles with the command list, and hover and focus also appear across the entire item background.

### Boundaries and limitations

- Project switching is allowed for owners and managers and changes only their own account's active project. Other connections for the same account are notified of the switch, while other accounts' and guests' screens and file request paths are preserved.
- The existing project path list and order are preserved, and saved group information is not displayed in the selector.
- Running agents retain their existing working paths.
- When a Git branch selection opens an existing worktree in the same repository, the current project's name, layout, editor panes and tabs, and agent and terminal tabs are preserved, and only the file operation root changes. The worktree path is not added to the list as a separate project. Opening a folder through the project selector or Add Project is handled as a regular project switch and restores that folder's screen.

### Detailed contracts

- [Project and file usage](../../../../docs/guides/projects.md) · [Switching and restoration contract](../../development/ui-contracts.md)

<!-- mew:implementation:start -->
## Implementation details

- Direct and nested subprojects appear at their actual locations and sort positions in the regular file tree, and clicking a folder only expands or collapses it. The adjacent arrow selects that project through the existing project-opening API, adding only paths not already in the list. Owner and manager permissions, reuse of duplicate paths, per-account restoration, and running agents' working paths are preserved. Folder browsing follows the [subproject browsing decision](../../decisions/0004-subproject-folder-exploration.md), and the header and panel follow the [project sidebar decision](../../decisions/0082-desktop-project-sidebar.md).

- The project selector's global capture listener opens the desktop panel or mobile `ActionMenu` with Alt+P and maps Alt+1…9 to projects in saved list order. It uses the same switching path as existing clicks, including from regular panel inputs. It supports the numeric keypad and macOS Option physical keys, and does not switch for the current project, nonexistent numbers, modals, key repeat, or users without owner or manager permissions. Ctrl/Cmd+number remains assigned to internal panel tabs, and Alt+number and Alt+P are also forwarded remotely when the login video or remote screen has focus.

- The active project is stored in `activeWorkspace` in the account UI ledger. HTTP and project WebSocket requests pin the account's root in the async context, and switching does not change the server startup root, environment settings, or other accounts' watchers or collaborative editing rooms. File lists, search, watchers, and collaboration rooms are separated by root path. If no value is saved or the folder no longer exists, the server's default root is used. Follow the [per-account path contract](../../development/architecture.md#per-account-active-project).

- In the account ledger, `activeWorkspace` is the actual file operation root, and `activeProjectPath` is the logical project root for screen restoration. Regular project selection sets both values to the target path, while switching worktrees within the same project preserves `activeProjectPath`. The header name, project list, account UI, docking and popups, editor tab structure, and AgentPanel are retained based on the logical root. File, Git, search, and body content caches are separated by actual root, and open files have their target content and permissions checked again. Running sessions' cwd values are not changed; only the default cwd for new sessions uses the selected worktree. Follow the [worktree switching contract](../../development/ui-contracts.md#switching-worktrees-within-the-same-project) and [Decision 0068](../../decisions/0068-project-worktree-context.md).

- `server/projectIcons.ts` handles reading and saving per-project icons and migrating existing values. Direct and nested trees and the project selector display the same value, and changing it in the selector updates the project file.

- Right-clicking an item in either explorer provides Copy, Cut, Paste, Rename, and Delete through the same menu component as the file explorer, and shows Add to Favorites for folders.
- Touch and hold on mobile is also supported.

- Favorites at the top of both explorers is a separate, initially collapsed dropdown that expands to let users navigate to or remove folders.
- Supports keyboard, touch, Esc, and Back.
- The list provides the server OS's default folders, detected cloud folders, and manually added paths.
- Additions and removals are saved per account.

- Add Project and the server file explorer use shared explorer components based on the Add Project dialog's design.
- They share the address bar, filter, list rows, and bottom path display while retaining each screen's existing operations.

- The Add Project window focuses its title when first opened.
- When a nonexistent path is entered, confirmation shows the existing parent, the first missing name, and the full path to create in four languages. On confirmation, it creates any intermediate folders and navigates to that location.
- Follow the [path creation contract](../../development/ui-contracts.md#confirming-and-creating-missing-project-paths).

- The project selection window provides folder browsing, cloud shortcuts, New Folder, Git clone, and Git initialization.

- The project list shares rows, icons, and ordering between the desktop panel and mobile menu. Use Up/Down arrow keys and Home/End to navigate, and Enter/Space to select. Only the mobile menu closes on selection, Esc, Back, or an outside click and restores focus to the invoking button. Hovering or focusing a list item prepares only the screen state in advance and reuses the same request when the item is actually selected. Files, trees, and agent occupancy are not queried in advance; follow the [fast switching contract](../../development/ui-contracts.md#fast-root-project-switching).
- A centered loading indicator is shown during project switching and closed after completion or failure.
- Click, touch, and keyboard interactions remain available without a black overlay.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- For the checks performed, results, and scope not applied to production for the desktop project sidebar and per-project command buttons on 2026-10-28, see the [work record](../../work/desktop-project-sidebar.md).

- 2026-10-26 header spacing fix: The icon and its container were aligned to 16px to fix the appearance of wider left spacing caused by a container larger than the icon. Isolated browser tests verified equal left and right CSS padding and actual outer spacing around the icon and name on desktop and mobile in dark and light themes. Targeted lint passed with warnings, while the full documentation check failed due to 17 existing broken links. No build or server application was performed.

- 2026-10-26 shortcut display: Isolated browser tests for the project selector verified each item's `Alt+1…9` and accessibility attributes, number updates after reordering, and exclusion of the 10th item onward from the display. A mobile dark capture was reviewed, and targeted lint passed with warnings. The full documentation check failed due to 17 existing broken links. No build or server application was performed.

- 2026-10-26 menu retention and left handle fix: Passed 2 isolated browser tests for the project selector and shared menus. Verified that the underlying list remains open for right-click and keyboard menus, Esc and Back close one layer and restore row focus, the list updates after deleting an inactive project, and the left handle is positioned correctly on desktop and mobile in both themes. Type checking and targeted lint passed with warnings. The documentation description check passed, while the full link check failed due to 17 existing references to deleted documents. No app build or server application was performed.

- 2026-10-26 list reordering: Verified mouse and mobile touch handle dragging, keyboard row reordering, order retention after reopening the menu, and preservation of the active project during reordering in isolated Chromium. Desktop light and mobile dark screens were also reviewed. Type checking and targeted lint passed with existing warnings. Account persistence reuses the existing path list saving mechanism; actual server persistence and reconnection were outside this test's scope.

- 2026-10-26: Passed 2 isolated browser tests for the project selector and icon entry paths. Verified the Edit menu through right-click, keyboard, and touching and holding the current button; removal of inactive projects from the list without switching; and disabled deletion of the last remaining current project. Type checking and targeted lint passed with warnings. The full documentation check failed due to missing frontmatter in existing tasks. Actual server application and the App switching path for deleting the active project were not verified in the browser.

- 2026-10-26: Passed 9 tests in `project-access-api.test.ts`, `project-icons-api.test.ts`, `mewcat-assistant.test.ts`, `access-policy.test.ts`, and `account-workspace.test.ts`, and 6 isolated browser tests in `workspace-switch-ui.test.ts`. Verified manager list saving, folder creation, Git initialization, project/subproject switching, icon changes, and Mewpet project tools, as well as member and guest blocking and preservation of other accounts' roots. Type checking and targeted lint passed; existing lint warnings remain. The full documentation check failed due to missing frontmatter in existing tasks and links to deleted documents. No app build or server restart was performed.

- 2026-10-19: `server/project-switcher-ui.test.ts` verified the current project display, selection, final Add item, keyboard and touch interactions, icon changes, owner permission boundaries, and desktop/mobile screen boundaries. The 6 tests in `workspace-snapshot-cache.test.ts` and checks in `server/workspace-switch-ui.test.ts` verified no POST, file, tree, or agent occupancy queries before selection, reuse of prepared responses, 0 additional UI and icon GET requests on warm return, discarding late responses from previous permissions, and switching and panel restoration. The isolated changes passed TypeScript checking, lint with existing warnings, documentation checks, and capture reviews at 320px in dark mode and 1100px in light mode. This was isolated browser verification; total switching latency in production was not measured. No build or server restart was performed.

- 2026-10-07 Alt+number switching: Actual project tabs in `project-tab-groups-ui.test.ts` verified number shortcuts at 1100/390px, numeric keypad and Option physical keys, group and reordered display order, exclusions for the current or nonexistent number, modals, key repeat, IME, and permissions, and remote input priority. The actual App's `workspace-switch-ui.test.ts` keyboard scenario verified per-project body content switching with Alt+2/1 and exclusion of duplicate handoffs; the Chromium iframe in `browser-dom.test.ts` verified forwarding of Alt+2. Type checking, targeted lint, and documentation description and placement checks passed. No build or server restart was performed.

- `server/account-workspace.test.ts`: Checks active roots, same-named files, trees, async paths, and default terminal paths for multi-account HTTP; switch notifications delivered only to the same account; collaborative editing isolation across different roots; and default root restoration for deleted paths.

- 2026-09-30: Related drag UI regression checks verified reordering animations and existing input and cancel behavior. The scope and limitations follow [shared motion verification](../../development/ui-contracts.md#drag-reordering-motion).

- `projectIcons.test.ts` and `project-icons-api.test.ts`: Verify shared SVGs, nested icons, migration priority, initialization, renaming, corruption/link protection, owner permissions, and exclusion of account copies.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify the icon, name, and command button in the collapsed header, and selection and the final Add item in the desktop panel and mobile dropdown.
  - Verify that documents and layout are restored when switching to another project and back, and that selecting the current project again does not trigger a duplicate switch.

- 2026-09-24:
  - Isolated Chromium verified Favorites dropdowns on desktop and mobile in both themes, keyboard/touch navigation and removal, Esc, Back, outside presses, and existing file operations.
  - Verified initial title focus, confirmation and cancellation for nonexistent paths, retries after creation failure, and confirmation dialogs in four languages at 320px; filesystem and HTTP permission tests also passed.

<!-- mew:validation:end -->
