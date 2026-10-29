---
id: "mew-projects-files"
parent: "mew-projects"
title: "File and Folder Navigation and Operations"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "67a95247d8f805106459a6f3cc3fd61abca57f6504dbe508c57550c824406a0a"
files: ["src/components/file-action-menu.tsx", "src/hooks/use-external-file-actions.tsx", "src/components/file-browser-favorites.tsx", "server/file-favorites.ts", "src/components/file-browser.tsx", "src/components/FileTree.tsx", "src/App.tsx", "src/components/virtual-tree-rows.tsx", "src/utils/treePersistence.ts", "server/fsBrowse.ts", "src/components/ServerFileExplorer.tsx", "server/api.ts", "server/fileCatalog.ts"]
commits: []
description: "The file explorer naming and scope contract, including Documents, Files, and filename/content search, plus hierarchical navigation, operations, virtualization, list caching, shortcuts, and one-time location reveal on file selection in Documents and Files. Describes compact lists and parent-path navigation in Add Project and the server explorer, server catalog visibility and permissions, and exclusion of .worktrees copies."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

File Explorer is the panel name encompassing hierarchical navigation in Documents and Files, filename search, and file content search.

- Browse, create, move, upload, and download files.

### Scope

- Expanded folder and parent document rows stack by level at the top of the scrolling list and are pushed out at the end of each child list. Leave no gaps between sticky rows and continue displaying vertical ancestor hierarchy lines.

- Show vertical guide lines in the child lists of expanded folders and parent documents. Continue one line for each nested ancestor, so an item three levels down shows three lines; collapsing removes the corresponding line.

- Provide default OS/cloud folders and per-account favorites at the top of Add Project and the server file explorer.
- File/folder rows in both popups and nested rows in the server explorer use a minimum height of 28px on desktop and 36px in touch environments. Text and icon sizes remain unchanged.
- The first item in file/folder lists is `상위경로`; clicking it or pressing Enter or Space navigates to the parent of the current path. It is displayed even with search filters and in empty folders, and disabled at the root. Remove the up arrow to the left of the address bar, and exclude the parent-path row from item counts.
- Separate navigation lists with a full-width Documents/Files toggle at the top. Preserve the selected view and each tree's expansion and scroll state per project.
- In the file explorer, distinguish the currently active file with the existing selection background and inactive files open in other tabs or split panes with a lighter background. Remove the open-file background when a tab is closed, and do not display a theme-colored border.
- After expanding or collapsing a parent document or folder, do not retain background highlighting based solely on internal focus state. Retain the selection background for the currently open document and hover/keyboard focus indicators.
- Provide creation, renaming, duplication, copying, cutting, pasting, deletion, and drag-to-move in the file explorer.
- When file/document moves are applied, animate the moved item and surrounding rows with the same 180ms motion as tabs and Dock; place them immediately when reduced motion is enabled.
- Clicking an editor file tab once reveals that file's location in the file explorer.
- Request parent folder expansion and location reveal only when selecting a file or reselecting a tab. Once the request ends because the reveal is complete or the user navigates, list updates must not reset scrolling or reopen collapsed parent folders.
- On mobile, selecting another file tab keeps the editor open; switch to the file explorer only when reselecting the currently active file tab.
- Authorized accounts can work with paths outside projects in the server-wide file explorer.
- Apply the hidden list and file permissions to the tree and search.
- Exclude the parent project's `.worktrees` from the tree, search, backlinks, and file watching even in show-all-files mode. When the worktree itself is opened as a separate project root, handle its internal files normally.

### Boundaries and limitations

- Do not automatically append .md when the extension is omitted.
- The server-wide explorer is a server control feature governed by OS permissions, not a sandbox governed by ordinary file permissions.

### Detailed contracts

- [Project and File Usage](../../../../docs/guides/projects.md) · [File Permissions](../../development/access-control.md)

<!-- mew:implementation:start -->

- `use-tree-move-animation.ts` records existing row positions after a successful move and maps paths after the asynchronous tree update. Detailed behavior follows the [shared motion contract](../../development/ui-contracts.md#drag-reordering-motion).
## Implementation details

- Server `FileCatalog` list retrieval prepares the project root, server data base path, and hidden list once within the same synchronous operation and reuses them for each entry. Checks resolving each file's real path continue to run, and per-account file permissions are applied separately in the existing API. The prepared predicate is not passed to the next request or asynchronous work, so the next retrieval rechecks hidden settings, account roots, and symbolic link changes. The catalog's path list is not used as a permission result cache. Follows [Decision 0058](../../decisions/0058-search-query-and-catalog-batches.md).
- With `MEW_PERF_LOG=1`, `catalog.visibility` records the time spent evaluating catalog list visibility and looking up icons, the input entry count (`entries`), and whether all entries are shown (`showAll`). Logs do not include real paths or per-account permission results, and the timing excludes subsequent API permission filtering, serialization, transfer, and screen rendering.

- Structural path exclusion in `tree.ts` prevents synchronous/asynchronous tree traversal, single-level listing, and file catalog traversal under `.worktrees` regardless of hidden settings. `watcher.ts` also checks project-relative paths during initial collection and new-directory synchronization. The document backlink scanner does not read copies, so duplicate filenames do not change wiki link resolution. When the worktree itself is opened as the root, relative paths do not contain `.worktrees`, so navigation and watching work normally. Mew's regular and demo Vite development watchers also exclude internal worktrees. Placement criteria follow [Decision 0054](../../decisions/0054-internal-worktrees.md).

- Subprojects use the same placement, sorting, expansion, child-list loading, and cache restoration as ordinary folders. Clicking a folder or pressing Enter or Space toggles expansion, and internal files open in the current project. File creation, uploads, and moves are also handled in the current tree; only the adjacent arrow opens that project as the active root. The path is added to or reused in the header project list. The arrow's owner permission restriction and project icon are retained. Follows the [folder navigation decision](../../decisions/0004-subproject-folder-exploration.md) and [header selector decision](../../decisions/0019-project-selector.md).

- Folder rows, including document folders and subprojects, support expansion/collapse, right-click, and touch interaction in the empty space to the right of the navigation arrow beside the name; hover, long-press, menu, drag-target, and keyboard focus highlighting extend to the end of the row. The navigation arrow remains an independent button above the row and does not toggle folder expansion.

- Child listings share an in-flight Promise for each folder path. Initial expansion, restoration effects, and the Documents name and arrow do not issue duplicate requests. Restored open folders show existing rows first and revalidate once; folders beneath collapsed ancestors are not queried.
- Updating the root array alone does not clear child caches. Explicit full refreshes in App and completed creation/manipulation operations revalidate currently open listings through a separate `refreshSignal`, so they do not rely solely on watcher events. Open listings for changed parents are fetched again while retaining existing rows; closed listings revalidate on their next expansion. If invalidated during a request, the stale response is not applied and the latest listing is fetched again. Child caches and in-flight results for folders that no longer exist are removed.
- `virtual-tree-rows.tsx` virtualizes runs of at least 200 consecutive files and collapsed folders, rendering rows near the viewport plus 12 rows before and after. Wrappers for expanded folders and parent documents remain to preserve sticky rows, ancestor lines, and drop targets. Actual row heights are measured, focused items, menu targets, and dragged items remain rendered, and groups containing rename or child-creation inputs are displayed in full. Tab/Shift+Tab also moves through offscreen neighboring rows in order.
- Revealing a file tab's location and restoring the center anchor first render offscreen rows, then scroll. Stored paths and the complete child-listing cache retain their existing formats; virtual row ranges are not stored.
- `FileTree` consumes reveal requests keyed by selected path and `revealSignal` on completion or cancellation. It waits for initial listings and child rows to load and for a hidden file explorer to become visible, but root-list replacement or a temporarily empty listing after completion does not create a new request. User scrolling, pointer, touch, keyboard, and scrollbar interactions cancel the active request and release observers and event listeners. StrictMode effect resets do not consume requests, so a tree newly mounted by a tab click also reveals the location.
- The server explorer's `/api/fs/entries?size=0` skips individual stat calls for regular-file sizes that are not displayed. Default API requests continue to return sizes, and symbolic-link type checks remain. The receive window for remote responses follows the [P2P contract](../../development/remote-access.md#protocol-and-resource-lifetimes).

- In the editor and file explorer, Ctrl/Cmd+N and Ctrl/Cmd+T, along with the existing Alt+N, open the new-file name input; Ctrl/Cmd+Shift+N opens the existing new-folder flow. The document tree uses the existing document-creation rules. The file explorer uses the selected directory, and the editor uses the active document's folder. App checks file read/write permissions and shares per-project one-time requests through `useSidebarCreate`. Handled requests are consumed, and stale inputs do not reopen when the tree remounts or projects change. File and folder creation runs only when the editor or file explorer is selected. New tabs in the agent, terminal, and browser are owned by their respective surfaces; clicking an empty area to clear input focus or a surface rejecting creation does not fall through to new-file creation. New files are not created in other task panels, modals, or hidden areas.

- Each item in the shared file context menu displays a 16px Iconoir icon alongside text. Corners are square and shadows are removed; item padding is reduced to 8px horizontally and 4px vertically, with a 6px icon gap. Download aligns with the same icon column, and icons are excluded from accessible names. This applies equally to the file explorer, Add Project, and server file explorer.

- Sticky parent items during scrolling are provided again in response to the user's renewed request on 2026-10-06. `TreeHeader` adjusts top spacing to stack rows without gaps, and per-node `isolate` keeps ancestor guide lines continuing above child sticky rows. Preserve unsticking on collapse and at the end of child lists, along with file location indicators. Follow the [sticky parent row contract](../../development/ui-contracts.md#sticky-ancestor-rows-in-the-file-explorer-tree).

- The shared `TreeChildren` in `FileTree.tsx` overlays a 1px theme divider line on each child list. Position the line 2px left of the center of the folder icon or document expansion button. Preserve the existing 14px indentation and continue the line through creation inputs and loading rows without affecting clicks, dragging, or accessibility navigation.

- In Files view, the documents folder appears as a regular folder at its actual project-relative path and uses the same sorting, expansion, file operations, lazy loading, and state persistence as other folders. Only the diagonal arrow beside its name switches to Documents view. Representative documents and MOCs inside retain their filenames and extensions and are not converted into a Documents page structure. Even when the configured path is nested, such as `.mew/docs`, it is explored under its actual parent folder without inserting a separate row at the top. Server listings also include the documents folder and apply normal file visibility, permission, and blocking rules.

- Only the tree for the selected scope is mounted, and the existing top-level Documents expansion row is removed. The toggle sits in a separate row at the top, independent of scrolling, and supports keyboard arrow keys and Home/End. New File, New Folder, and Alt+N target the current view. `sidebar.explorerScope` is saved in account and local state and migrated from the existing `docsExpanded`.

- When a file tab is selected, `App.tsx` opens the file explorer's Files view and switches to the selected file's Documents/Files view. `FileTree.tsx` opens parent folders and scrolls after the lazily loaded file row appears. This also works when reselecting the same tab and excludes files outside the project.
- Selecting an inactive tab on mobile keeps the foreground panel and only updates the reveal request. A closed or hidden file explorer scrolls to the selected file when it is subsequently shown.
- Initial screen restoration preserves saved expansion and scroll state, and revealing a location takes priority over restoring a closed tree only when the user selects a tab.

- Right-clicking an item in either explorer provides Copy, Cut, Paste, Rename, and Delete through the same menu component as the file explorer, and shows Add to Favorites for folders.
- Mobile long presses are also supported. As with tabs and the Dock, dragging becomes ready after 350ms and movement immediately starts a move; releasing after holding still for at least 500ms opens the menu.
- In the file explorer, the pressed item receives a background highlight after 500ms. The highlight remains while the menu is open and is cleared when the menu closes or touch is canceled.
- The mobile menu's position is adjusted to sit above the bottom dock. If height is insufficient, the menu scrolls internally so the last item remains selectable.

- Favorites at the top of both explorers is a separate, initially collapsed dropdown that expands to let users navigate to or remove folders.
- Supports keyboard, touch, Esc, and Back.
- The list provides the server OS's default folders, detected cloud folders, and manually added paths.
- Additions and removals are saved per account.

- Add Project and the server file explorer use shared explorer components based on the Add Project dialog's design.
- They share the address bar, filter, list rows, and bottom path display while retaining each screen's existing operations.

- Provide creation, renaming, duplication, copying, cutting, pasting, deletion, and drag-to-move in the file explorer.

- The file explorer provides 2px of space above the file list and 300px of scroll space at the end.
- This applies equally to each Documents/Files tree on desktop and mobile.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->

- 2026-10-24: 5 new checks in `catalog-visibility.test.ts` verified root and hidden-setting preparation counts, real-path rechecks for all files, changes to hidden/show-all settings, symbolic-link replacement pointing to server data, and different roots for two accounts. Together with existing search, tree, access-control, file-read, and platform checks, 58 passed and 2 Windows-only checks were skipped on Linux. TypeScript and full lint passed (with existing warnings), and comparison conditions and results were recorded in [isolated performance measurements](../../research/search-catalog-performance.md). No app build or server restart was performed.

- 2026-10-23: 56 related regression tests verified exclusion of `.worktrees` from normal and showAll trees, single-level listings, initial/incremental catalog queries, and backlinks, as well as synchronous/asynchronous watching and exclusion of dynamically created entries. Cases where the worktree itself is opened as the project root and explored and watched normally also passed. TypeScript, full lint (with existing warnings), document description, link, and diff checks passed. No app build or server restart was performed.

- 2026-10-17: `subprojects-ui.test.ts` verified expansion/collapse by clicking the empty space to the right of document folders and subprojects and by mobile touch, along with full-row highlighting on desktop hover and independent arrow behavior. TypeScript, targeted oxlint, document description, and link checks passed. No build or server restart was performed.

- 2026-10-15 subprojects: `subprojects-ui.test.ts` verified normal sorting, direct/nested folder expansion, lazy loading, new-file input, opening tabs with the separate arrow via keyboard/touch, permission restrictions, and tab reuse. The documents-folder scenario in `workspace-switch-ui.test.ts` using the actual App also confirmed that subprojects expand within the same file tree. 8 project API and tree-restoration tests, TypeScript, targeted oxlint, and document description checks passed. The full document link check failed on 2 links due to deletion of `docs/deployment/MOC.md` outside this work. No build or server restart was performed.

- 2026-10-15: 12 tests in `server/tree.test.ts` using an isolated data folder and the `Files opens Documents` scenario in `workspace-switch-ui.test.ts` passed. Normal sorting, actual file listings, file opening, collapse, arrow-based switching, and expansion restoration for the documents folder were confirmed, and desktop/mobile captures were reviewed. TypeScript, targeted oxlint, document description and link checks, and targeted diff checks passed. The UI fixture was adjusted so lazily loaded components also use the existing substitute components. No build or server restart was performed.

- 2026-10-08: The `Files opens Documents` scenario in `workspace-switch-ui.test.ts` confirmed normal folder expansion/collapse, actual filenames, opening code files, switching with the separate arrow, and expansion restoration in desktop light and mobile dark themes. Screen captures, 12 server-tree tests, TypeScript, targeted oxlint, description, and document placement checks passed. The existing `App keyboard aliases` scenario run alongside it failed while waiting for the document-creation input. The full diff check failed due to existing trailing whitespace in `docs/deployment/MOC.md` outside this work. No build or server restart was performed.

- 2026-10-07 expansion optimization: `server/explorer-performance-ui.test.ts` verifies DOM range limits for 1,000 items each in Files/Documents in actual Chromium, 1 initial query and shared name/arrow requests, cache retention, in-flight invalidation, ignoring late responses after deletion, revealing offscreen tabs, StrictMode restoration, and Tab navigation in both directions. Desktop light and mobile dark captures were reviewed. `fsBrowse.test.ts` verifies skipping regular-file stat calls, symbolic links, and default-size compatibility. Existing Documents, sticky-row, touch, move, creation, and tab-reveal UI checks and type checks also passed. The missing `.mew/docs/decisions` dependency in `tree.test.ts` was replaced with an isolated temporary documents-folder fixture. No build or changes to the running server were performed.

- 2026-10-07 reserved keys: The `App keyboard aliases` scenario in `server/workspace-switch-ui.test.ts` using the actual App confirmed Ctrl+N/T in the current Documents view, Ctrl+Shift+N in Files view, and Ctrl+W for the active document. The existing full project-switching scenario failed on mobile because `Select extra.md` was hidden, and the same failure was reproduced with the pre-change App code. No build or server restart was performed.

- 2026-10-06 reapplication of sticky parent rows: `server/sidebar-sticky-ui.test.ts` verified three-level sticky coordinates, no top gaps, ancestor-line pixels in both themes, unsticking at list ends, collapsing, and location indicators in desktop/mobile file and document trees. 4 Documents, tab location indicator, touch, and move UI regression tests passed, along with TypeScript, targeted oxlint, document placement, and diff checks. The workspace link check failed because MOCs were missing for 2 separate work documents. No build or server restart was performed.

- 2026-10-06 menu spacing and corner adjustments: Mobile light and desktop dark captures were reviewed, and file-explorer touch tests, type checks, targeted oxlint, and diff checks passed. The project-explorer test passed on an isolated rerun after the initial run failed to confirm path navigation/opening. The workspace link check continues to fail because 2 separate work documents are missing from MOCs.

- 2026-10-06 menu icons: `server/sidebar-touch-ui.test.ts` and `server/project-dialog-ui.test.ts` passed, and mobile light and desktop dark menu captures were reviewed. `npx tsc -b`, targeted oxlint, document placement, and diff checks passed. The workspace link check failed because 2 separately added work documents were missing from MOCs.

- 2026-10-06 removal of sticky parent rows: 2 existing Documents navigation and tab location indicator UI tests, `npx tsc -b`, targeted oxlint, document placement and workspace link checks, and `git diff --check` passed.

- 2026-10-06: `server/sidebar-sticky-ui.test.ts` verified three-level parent-row sticking and stacking order, unsticking at each level's list end, collapsing sticky rows, clicking files, and tab location indicators on desktop/mobile, and screenshots in both themes were reviewed. 4 existing Documents, tab location indicator, touch, and drag-move UI tests passed, along with TypeScript, targeted oxlint, document placement, and link checks. No build or server restart was performed.

- 2026-10-06: An isolated temporary Chromium fixture verified three-level guide-line counts, 14px spacing, continuous height, removal on collapse, and click-through behavior in file and document trees, and desktop/mobile screenshots in both themes were checked. `server/document-pages-ui.test.ts`, `server/sidebar-tab-reveal-ui.test.ts`, `npx tsc -b`, `npm run lint` (existing warnings), document placement, and workspace link checks passed. No build or server restart was performed.

- 2026-10-04: `sidebar-touch-ui.test.ts` confirmed immediate dragging after a 400ms hold, the menu after a long stationary hold, and existing cancellation, scrolling, and external-drop behavior. Haptics on physical devices require separate verification.

- 2026-10-04: `sidebar-move-ui.test.ts` confirmed intermediate positions and 180ms motion for moved items and surrounding rows after a delayed tree update, switching to reduced motion during animation, and moves with reduced motion enabled.
## Verification

- 2026-10-26: The `compact rows` scenario in `server/project-dialog-ui.test.ts` confirmed the first parent-path row in both popups, removal of the address-bar arrow, navigation with filters and in empty folders, and disabling at the root. Mouse row heights of 28px and touch row heights of 36px were checked at 1200px in dark theme and 390px in light theme. The existing full scenario failed at the Favorites popup boundary check, which was also reproduced with the pre-change code. No build or server application was performed.

- 2026-10-26: `server/sidebar-tab-reveal-ui.test.ts` confirmed preservation of manual scrolling and parent-folder collapse after listing updates, Files and nested Documents, cancellation during lazy loading, request consumption before and after empty listings, and tab reselection. 3 Chromium tests, including existing virtualization and Documents UI tests, plus TypeScript, targeted oxlint, and UI static checks passed. `treePersistence.test.ts`, run alongside them, reproduced 1 DOM event type error even with unchanged source and tests. Document description checks passed; the full link check failed on 1 deleted task link in `docs/tasks/_tasks.md` outside this work. No app build or server application was performed.

- 2026-10-04: `sidebar-touch-ui.test.ts` in isolated Chromium confirmed file highlighting during long presses and while menus are displayed, clearing highlights after menu closure, and folder menu targets. Existing touch-move, cancellation, and scrolling regression checks, type checks, targeted lint, and document checks also passed.

- 2026-10-02: `workspace-switch-ui.test.ts` verified view switching through the document folder entry point, existing keyboard switching and state restoration, and the full-width top placement on mobile. Desktop dark and mobile light screenshots, TypeScript, and targeted lint were checked. No build or restart was performed.

- 2026-09-29: `workspace-switch-ui.test.ts`, using the actual App, verified exclusive document/file display, arrow-key and Home switching, new-file input in the current view, view switching when selecting a file tab, project restoration, and bottom placement on mobile. Expansion/scrolling and creation regressions, storage format and translation tests, TypeScript, targeted lint, and document checks passed. Desktop dark and mobile light screenshots were checked; no build or restart was performed.

- Verify that the file becomes visible when clicking the same file tab again, when the file explorer or Documents is closed, and when a different file-explorer view is active. Selecting another file or scrolling manually during lazy loading must prevent the previous reveal request from interfering.
- On mobile, verify that tapping a different file tab keeps the editor visible and tapping the active tab again switches to the file explorer. Both behaviors were verified in `server/workspace-switch-ui.test.ts`, and scrolling after showing a hidden file explorer was verified in `server/sidebar-tab-reveal-ui.test.ts` (2026-09-29).
- 2026-09-29: Isolated Chromium in `server/sidebar-tab-reveal-ui.test.ts` confirmed initial expansion restoration, scrolling after lazy loading, repeated clicks and cache reuse, Documents remounting, independent close-button behavior, and cancellation by selecting another tab or user interaction. Existing tab-dragging, file-explorer touch, and workspace-restoration UI tests also passed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that filenames are created unchanged and that move/upload destinations and read-only/blocked items are correct.

- 2026-09-24:
  - Isolated Chromium verified Favorites dropdowns on desktop and mobile in both themes, keyboard/touch navigation and removal, Esc, Back, outside presses, and existing file operations.

<!-- mew:validation:end -->
