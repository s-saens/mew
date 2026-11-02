---
id: "mew-projects-tabs"
parent: "mew-projects"
title: "Opening, Selecting, and Switching Projects"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-02"
status_hash: "03b352e53f93242f9efdfd05c5bd632f9bf92dd1a456279d6b0eb0efd066cd3f"
files: ["src/components/file-action-menu.tsx", "src/hooks/use-external-file-actions.tsx", "src/components/file-browser-favorites.tsx", "server/file-favorites.ts", "src/components/file-browser.tsx", "src/components/file-browser-path.tsx", "src/components/file-browser-path-suggestions.ts", "src/components/OpenProjectDialog.tsx", "src/components/LinkProjectDialog.tsx", "src/components/ProjectCreationAgentDialog.tsx", "server/project-registry.ts", "src/components/ProjectSwitcher.tsx", "server/projects.ts", "server/cloud-storage.ts"]
commits: []
description: "Defines name-first managed project creation, empty and agent-assisted setup, existing-folder linking, the shared projects.yaml catalog, and each account’s My Projects shortcuts. Covers first-use onboarding, non-guest access, personal ordering and removal, desktop/mobile selection, switching and restoration, and retained folder, icon, subproject, worktree, and session boundaries."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

### Projects and My Projects

- **Projects** is the instance-wide catalog of folders added to Mew. **My Projects** is an ordered set of shortcuts for one signed-in account; it is not a folder or a private copy of a project.
- All signed-in users, including members, can browse registered projects, add them to My Projects, and switch to them. Guests cannot use the catalog, create or link projects, or maintain My Projects. Existing feature and file permissions continue to apply after selection.
- Creating a project or linking an existing folder registers it for the instance and adds it to the creator's My Projects. Other accounts can add that same project to their own lists without copying files or affecting the creator's list.
- `DATA_DIR/projects.yaml` owns both the shared catalog and personal shortcuts. Existing per-account lists migrate without moving project folders. The [registry and storage contract](../../development/architecture.md#shared-project-registry-and-my-projects) owns the schema and APIs; [ADR 0118](../../decisions/0118-shared-project-registry.md) supersedes the account-isolated catalog and member restrictions in [ADR 0070](../../decisions/0070-manager-project-access.md).

### Create or link a project

- A fresh account opens the project welcome screen. If a saved active root is unavailable, restore the first existing My Projects directory; if none exists, show onboarding while preserving unavailable entries. The server startup folder is not automatically presented as that account's first project.
- **Add Project** opens a project catalog and creation flow centered on names. The ordinary flow does not require a filesystem path. Users can choose an existing registered project, create a managed project, or explicitly link an existing folder.
- Creating a project requires a name. Mew creates the directory at `~/.mew/projects/<name>` on the server. **Create Git repository** is checked by default. Names must be safe single directory names; duplicate names never reuse or overwrite an existing folder.
- **Create empty project** creates `.mew/docs/` inside `.mew/` as its initial Documents location, and when Git is selected, initializes `.git/` and writes `.gitignore` with Mew temporary uploads excluded. It registers, pins, and opens the result.
- **Create with agent** creates and opens the same managed project, then opens a popup using the existing `AgentPanel` conversation component. The agent asks about the intended project before implementation, incorporates the answers, and documents the project under the applicable Mew default and project guidance. Runtime selection, authentication, permissions, conversation retention, and errors reuse the ordinary agent controls.
- **Link existing project** retains the folder browser for selecting a directory on the server. Linking preserves the folder's location and contents, registers its canonical path, adds it to My Projects, and opens it. Existing aliases resolve to one catalog entry.
- The linked-folder browser retains keyboard and home/parent navigation for signed-in users. Path suggestions, favorites, and missing-path creation remain conditional on their existing role and feature checks. Creating folders or running Git tools at arbitrary server paths remains limited by the existing manager/owner and feature checks. These tools are separate from managed name-only creation.
- `Ctrl/Cmd+O` opens the server file explorer for accounts with the required server file permission. Opening a file keeps the current project. `Ctrl/Cmd+Shift+O` opens Add Project for a signed-in user. Alt combinations and IME composition do not trigger these actions.

### Select and organize projects

- The header and project lists show project names and their shared icons; managed creation and catalog browsing do not depend on knowing storage paths. Icons remain owned by each project's `.mew/project-icon.json`, shared by the explorer and selector. Signed-in users can edit shared icons, with members restricted to registered project roots.
- The header project button opens the leftmost project sidebar on desktop (768px or wider) or the full-screen project panel on mobile. The sidebar is outside the Dock and file explorer, opens independently, and remembers its width and open state per browser and account. Desktop selection does not close it. Mobile selection, Close, Esc, and Back dismiss the panel and restore focus to the invoking control. Safe-area padding, focus containment, internal scrolling, and touch-sized rows are retained.
- My Projects supplies the switcher list and its order. The Add Project action opens the shared catalog. Opening a catalog row does not add a shortcut; Add to My Projects is explicit. Adding an already pinned project reuses it. Duplicate names show a path detail only where needed to distinguish the choices. Removing a shortcut preserves the shared catalog, filesystem, and other accounts' shortcuts; removing an active shortcut retains the existing requirement to switch successfully to another project first.
- Drag the left handle with mouse or touch to reorder My Projects. `Shift+↑/↓` on a row or `↑/↓` on its handle performs the same reorder without switching. Personal order is persisted in `projects.yaml`; the add action is not sortable. The active row is highlighted across its full width, without a checkmark.
- `Alt+P` opens the project list for signed-in users and focuses its first item. `Alt+1…9` selects My Projects in personal order, with numbers displayed on the right. Existing IME, repeat, modifier, modal, remote-input, and focus boundaries remain. `Ctrl/Cmd+number` continues to select tabs within the focused panel.
- Each project row's command button targets that project without changing the active root, and remains conditional on command/terminal permission. [Project commands](../terminals-agents-automation/project-command-buttons.md) owns execution, editing, and session isolation.
- Signed-in users’ context menus retain shared icon editing and personal shortcut removal, keyboard invocation, nested-menu dismissal, focus restoration, and touch long-press. No project tab strip or group UI is restored.

### Switching and boundaries

- Selecting a registered project changes only the requesting account's active project and notifies that account's other connections. Other users' roots, watchers, and collaboration rooms are preserved. Accounts opening the same actual root share its files and permitted collaboration.
- The browser restores each logical project's documents, layout, and scroll state without refreshing. Selecting another project during loading cancels obsolete preparation and applies only the latest selection. Returning to the displayed project while a different switch is pending reasserts that project through the server.
- Running agents and terminals retain their original working paths. New sessions use the selected working root.
- Subproject arrows and Git worktree switching retain their existing manager/owner checks. Switching a registered root does not grant arbitrary OS operations. Within a logical project, switching an existing worktree preserves the project identifier, panels, tabs, and sessions while refreshing files against the actual working root; the worktree is not automatically a separate catalog project.
- A missing catalog directory remains listed so unavailable mounts and migrated entries are not silently removed. Opening it reports the existing path error instead of creating or replacing it.

<!-- mew:implementation:start -->
## Implementation details

The [architecture contract](../../development/architecture.md#shared-project-registry-and-my-projects) owns catalog persistence, migration, and API payloads. The [shared UI contract](../../development/ui-project-navigation.md#shared-ui-for-adding-projects-and-browsing-server-files) owns the creation/catalog dialog and the explicit linked-folder browser. [Project usage](../../../../docs/guides/projects.md#프로젝트-탭) explains the flow to users.

`activeWorkspace` in the account UI ledger is the actual file root, and `activeProjectPath` is the logical root used for screen restoration. Ordinary project selection sets both values; an existing-worktree switch preserves the logical root. `hasProject` distinguishes first-use onboarding from the server's internal fallback root. HTTP and project WebSocket requests pin the authenticated account's actual root; switching never changes the startup root or other accounts' contexts.

Project icons use the existing shared read, migration, and validation code. Personal ordering uses the compatible root-project API backed by YAML. Existing browser path copies are recovery/migration data; they do not define the global catalog or make another user's shortcut visible in My Projects.

The agent-assisted popup reuses the project-bound AgentPanel and normal runtime selection rather than introducing a separate chat implementation. Its opening request asks for project discovery first and applies the existing documentation instructions to the resulting work.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->

The [2026-11-02 work record](../../work/shared-project-registry.md) owns verification of the shared catalog and name-first flow. Entries below preserve checks of earlier implementations; their previous role and storage assumptions are historical.
## Verification

- For the path-first picker, immediate suggestions, edited-path safeguards, creation/clone selection, and local verification, see the [work record](../../work/project-picker-path-ux.md).

- For the 2026-10-31 leftmost project panel correction, regression checks, and application boundary, see the [work record](../../work/desktop-project-sidebar.md#leftmost-project-panel-fix-2026-10-31).

- For the 2026-10-30 rapid-switch cancellation change, regression checks, and application status, see the [work record](../../work/project-switch-cancellation.md).

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

- 2026-09-30: Related drag UI regression checks verified reordering animations and existing input and cancel behavior. The scope and limitations follow [shared motion verification](../../development/ui-workspace-layout.md#drag-reordering-motion).

- `projectIcons.test.ts` and `project-icons-api.test.ts`: Verify shared SVGs, nested icons, migration priority, initialization, renaming, corruption/link protection, owner permissions, and exclusion of account copies.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify the icon, name, and command button in the collapsed header, and selection and the final Add item in the desktop sidebar and mobile full-screen panel.
  - Verify that documents and layout are restored when switching to another project and back, that selecting the current project with no pending switch does not trigger a duplicate switch, and that selecting it while another target is pending restores it through the server.

- 2026-09-24:
  - Isolated Chromium verified Favorites dropdowns on desktop and mobile in both themes, keyboard/touch navigation and removal, Esc, Back, outside presses, and existing file operations.
  - Verified initial title focus, confirmation and cancellation for nonexistent paths, retries after creation failure, and confirmation dialogs in four languages at 320px; filesystem and HTTP permission tests also passed.

<!-- mew:validation:end -->
