---
id: "mew-projects-documents"
parent: "mew-projects"
title: "Documents and document map management"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "67f36d128f8ff98f55ff2f44e2197710413f6968309439a998bd606dad06b477"
files: ["src/components/DocsSettingsModal.tsx", "src/components/FileTree.tsx", "server/docsRepo.ts", "src/components/DocumentGraph.tsx", "server/document-graph.ts", "src/utils/document-graph-layout.ts", "server/document-pages.ts", "src/hooks/useTabs.ts"]
commits: []
description: "Feature contract covering file/folder transitions for Documents representative and child documents, list caching and virtualization, graphs, and import/export. Explains inline naming and link insertion at the Markdown /page command position, preserving input and the parent view during creation, preserving open tabs and drafts, and project boundaries."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Browse parent and child documents in Documents and open them in the same editor.

### Scope

- The parent document name and expansion arrow share the same child-list cache and in-flight requests. Preserve existing documents during refetching, and render rows near the viewport for large lists. Representative content, sticky rows, hierarchy lines, keyboard navigation, and offscreen tab location indicators follow the [explorer implementation contract](file-folder-exploration-and-operations.md#implementation-details).

- Expanded folder and parent document rows stack by level at the top of the scrolling list and are pushed out at the end of each child list. Leave no gaps between sticky rows and continue displaying vertical ancestor hierarchy lines.

- Show vertical guide lines in the child lists of expanded folders and parent documents. Continue one line for each nested ancestor, so an item three levels down shows three lines; collapsing removes the corresponding line.

- Display folders as parent documents, and open the `_폴더이름.md` representative content when the name is clicked. Do not duplicate the representative file in the child list.
- For documents with no children, show a small bullet in place of the expansion chevron. The bullet is decorative and adds neither a tab stop nor an accessible name. Folders whose child lists have not yet been fetched retain the existing chevron.
- Save documents without children as `이름.md`, and switch the storage structure when adding the first child or removing the last child.
- Running `/page` in Hotview for editable project Markdown shows a focused name field inline at the command position. Enter or the Create icon confirms; Esc or the Cancel icon cancels and restores editor focus. IME confirmation and empty names do not create a page. Unfinished names remain outside saved and shared document content; navigation or loss of edit access cancels entry. Creation uses the same structural change as **+**, inserts a link at the command position, and stays in the parent document. Open the created page by clicking the list or link. Do not insert a link on cancellation or failure. If the name already exists, append a number and use the finalized name in the link as well. Save the draft before creation and preserve input entered during creation. Adjust open tabs and autosave paths for the parent and referencing documents, preserve the cursor, focus, and scroll position, and support nested creation. Do not offer the command for guests, read-only files, archives, or files outside the project.
- A normal click opens in the current tab, while Ctrl/Cmd+click continues to open in a new tab.
- Show only the document list through the full-width Documents toggle at the top of the explorer. Preserve open editor tabs when switching to and from the file view.
- Provide a graph view entry point above the document home at the Docs root for quickly navigating internal document links.
- The graph supports zooming, panning, node dragging, search, connection highlighting, and opening documents.
- Support changing the document folder, importing, and exporting.
- Documents and regular files use the same editor tabs and split layout for the current root project. Preserve existing tabs and moved panel positions when alternating between files.

### Boundaries and limitations

- Importing documents replaces existing content.
- Documents is not a separate project tab, and path changes are allowed only within the current project.

### Detailed contracts

- [Project and File Usage](../../../../docs/guides/projects.md)
- [Documents link graph engine](../../development/document-graph.md)
- [Documents parent and child document contract](../../development/document-pages.md)

<!-- mew:implementation:start -->
## Implementation details

- Sticky parent items during scrolling are provided again in response to the user's renewed request on 2026-10-06. `TreeHeader` adjusts top spacing to stack rows without gaps, and per-node `isolate` keeps ancestor guide lines continuing above child sticky rows. Preserve unsticking on collapse and at the end of child lists, along with file location indicators. Follow the [sticky parent row contract](../../development/ui-contracts.md#sticky-ancestor-rows-in-the-file-explorer-tree).

- The shared `TreeChildren` in `FileTree.tsx` overlays a 1px theme divider line on each child list. Position the line 2px left of the center of the folder icon or document expansion button. Preserve the existing 14px indentation and continue the line through creation inputs and loading rows without affecting clicks, dragging, or accessibility navigation.

- Separated clicking a Docs name from expanding its children. Adding, moving, deleting, renaming, and duplicating child documents handles representative files and body links together and updates open tabs and autosave paths. Existing MOCs remain compatible, and actual documents are not migrated in bulk. Follow [ADR 0191](../../history/decisions/0191-mew-documents-parent-and-child-pages.md).
- The document graph connects Markdown, reference-style, and wiki links within Docs according to permissions. The server reparses only changed documents, and a custom Web Worker layout engine and Canvas rendering reduce the load on the UI thread. Show the graph entry point only above the document home at the Docs root.

- The Documents/Files toggle fills a separate full-width row at the top of the explorer, with the two buttons sharing the width. It does not overlap the list and preserves keyboard switching. It uses the same appearance and colors as the Runtime/Agent Set toggle in the agent panel's + tab. Within a rounded rectangle with the default surface background, only the selected item uses a raised background and default text color; unselected items use muted text.
- The file view displays an entry point named after the linked document folder. Clicking it switches to the document view without expanding the folder and changes the new-file destination to the document root.
- The Documents tree and editor tabs use natural-language display names such as `document-pages` → `Document Pages` and `api-reference` → `API Reference` instead of actual filenames. Storage paths and link targets retain the existing lowercase kebab case.

- Display Documents as a separate list rather than nesting it in the regular file tree. Preserve expansion, scrolling, and the new-file destination separately for each view, and let the owner right-click the Documents toggle to open the existing folder settings. Follow [ADR 0190](../../history/decisions/0190-mew-explorer-top-toggle-and-docs-entry.md).

- `useTabs` manages Documents files alongside regular files, distinguishing them with tab identifiers that include their original API scope and relative path. Saving, collaboration, comments, attachments, and the document DB retain each file's existing scope.
- Merge existing saved Documents and regular-file tabs once, preserving files with the same name and editor pane IDs. After integration, do not restore closed tabs from the old saved Documents tabs.

- The top of Docs offers only New Document, and each document's + creates a child. The regular file view retains New File and New Folder.
- `/page` in `Editor` runs `useTabs.createChildPage` through a creation callback injected by the host. On success, it inserts a link at the tracked command position before adjusting paths. Both Documents and regular projects reuse the existing `DocumentPages` engine, incorporate input entered during creation into the edit buffer, and autosave to the new path. Detailed saving, permission, and duplicate-name handling follows the [parent and child document contract](../../development/document-pages.md).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->

- 2026-10-06 document bullets: `server/document-pages-ui.test.ts` verified bullets for standalone and nested documents, switching to a chevron after adding the first child, and bullets for folders containing only a representative document. Sticky parent UI regression, type, targeted oxlint, document placement, and diff checks also passed. The workspace link check failed because MOCs were missing for 2 separate work documents.

- 2026-10-06 reapplication of sticky parent rows: `server/sidebar-sticky-ui.test.ts` verified three-level sticky coordinates, no top gaps, ancestor-line pixels in both themes, unsticking at list ends, collapsing, and location indicators in desktop/mobile file and document trees. 4 Documents, tab location indicator, touch, and move UI regression tests passed, along with TypeScript, targeted oxlint, document placement, and diff checks. The workspace link check failed because MOCs were missing for 2 separate work documents. No build or server restart was performed.

- 2026-10-06 removal of sticky parent rows: 2 existing Documents navigation and tab location indicator UI tests, `npx tsc -b`, targeted oxlint, document placement and workspace link checks, and `git diff --check` passed.

- 2026-10-06: `server/sidebar-sticky-ui.test.ts` verified three-level parent-row sticking and stacking order, unsticking at each level's list end, collapsing sticky rows, clicking files, and tab location indicators on desktop/mobile, and screenshots in both themes were reviewed. 4 existing Documents, tab location indicator, touch, and drag-move UI tests passed, along with TypeScript, targeted oxlint, document placement, and link checks. No build or server restart was performed.

- 2026-10-06: An isolated temporary Chromium fixture verified three-level guide-line counts, 14px spacing, continuous height, removal on collapse, and click-through behavior in file and document trees, and desktop/mobile screenshots in both themes were checked. `server/document-pages-ui.test.ts`, `server/sidebar-tab-reveal-ui.test.ts`, `npx tsc -b`, `npm run lint` (existing warnings), document placement, and workspace link checks passed. No build or server restart was performed.
## Verification

- 2026-10-26: `server/editor-page-command-ui.test.ts` verified link insertion at the command position, duplicate names, nested creation, input during delayed responses, and preservation of the cursor, focus, and long-body scroll position after path changes on desktop and mobile, with and without collaboration. The file API and collaboration socket were isolated test doubles; no build or server application was performed for the running app.

- 2026-10-04: Organized Documents representative documents to look like parent page homes and added display-name conversion for the tree and tabs. `MEW_DATA_DIR="${TMPDIR:-/tmp}/mew-test-data" node --test server/document-pages.test.ts server/document-pages-ui.test.ts`, `npm run lint`, `npx tsc -b`, and `python3 ../.mew/docs/.github/scripts/check_doc_links.py --workspace` passed. `python3 ../.mew/docs/.github/scripts/check_repo_docs.py` exited with code 0 but emitted `todo/docs/*` placement warnings unrelated to this change. The full `npm test -- --runTestsByPath ...` run was stopped because the script ran all patterns together, including unrelated agent UI timeouts and environment failures.

- 2026-10-03: Tests passed for parent/child storage transitions, moving, copying, renaming, link adjustments, recovery from conflicts and write failures, and actual API permissions. The actual FileTree and useTabs verified representative-file hiding, separate arrows, current-tab replacement, Ctrl/Cmd tabs, moving immediately after editing, preserving input during structural changes, and autosaving to new paths. Existing App switching, creation, tab location indicator, touch, and unified editor regressions were checked. TypeScript, targeted lint, and document link checks passed; no build or restart was performed.

- 2026-10-02: Graph link analysis, permission, change/deletion, root replacement, and layout engine tests passed, along with actual API permission checks and desktop/mobile UI tests using actual Worker/Canvas implementations. Search, opening documents, zoom, node dragging, panning, pinch, error/empty states, permission changes, and Esc focus restoration were verified. Placement of the Docs root button before the MOC and hiding it in the file view were also verified. TypeScript, targeted lint, and document link checks passed; no build or restart was performed.

- 2026-10-02: `workspace-switch-ui.test.ts` verified view switching through the document folder entry point, existing keyboard switching and state restoration, and the full-width top placement on mobile. Desktop dark and mobile light screenshots, TypeScript, and targeted lint were checked. No build or restart was performed.

- 2026-09-29: `workspace-switch-ui.test.ts`, using the actual App, verified exclusive document/file display, arrow-key and Home switching, new-file input in the current view, view switching when selecting a file tab, project restoration, and bottom placement on mobile. Expansion/scrolling and creation regressions, storage format and translation tests, TypeScript, targeted lint, and document checks passed. Desktop dark and mobile light screenshots were checked; no build or restart was performed.

- Verify that the graph view button appears exactly once, only at the Docs root and before the document home, and that search, selection, and opening documents connect to the existing editor. Unreadable documents and their connections must remain hidden after permission changes.

- Verify that Documents and regular files with the same name appear together in the tab bar and each opens and saves the correct content. Tabs and layout must persist through file switching and refreshes after moving panels.
- 2026-09-29: `editor-files.test.ts`, `unified-editor-ui.test.ts`, and `workspace-switch-ui.test.ts` verified separate tabs and saving for same-name files, integration of existing tabs, position preservation after moving panels, and restoration after refreshes and root switches. 10 tests passed, including editor, view-switching, and file explorer regressions.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the actual path linked to Documents matches the MOC and that the entry point in the file view switches to the document view.

<!-- mew:validation:end -->

2026-10-04 Preserve capitalization and spaces when displaying natural-language filenames, and encode paths containing parentheses as safe Markdown links when renaming. The shared map check recognizes `_폴더이름.md` representative documents and encoded paths and paths containing spaces.
