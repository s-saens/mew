---
title: "Documents Parent and Child Document Contract"
created: 2026-10-03
updated: 2026-11-03
description: "Documents parent/child storage, explicit selection and opening, inline /page creation, representative files, and link preservation. Defines title previews, structural mutation ordering, draft and tab lifetimes, and compatibility discovery; links the separate database row-page contract."
상위파일: "MOC.md"
---

[Usage](../../../docs/guides/projects.md) · [Features](../features/projects-files-search/documents-and-document-map-management.md) · [Storage decision 0191](../history/decisions/0191-mew-documents-parent-and-child-pages.md) · [Selection decision 0107](../decisions/0107-explorer-selection-and-opening.md)

## Storage Structure

A leaf document is `name.md`. Its first created or moved-in child creates `name/` and moves the body to `name/_name.md`. Apply this recursively to children such as `name/child.md`. Removing the last non-representative child restores `name.md`. Attachments and hidden files count as actual children: never delete a folder containing them. The Docs root never becomes a single file.

Renaming a parent renames its folder and representative together: `dev/_dev.md` becomes `development/_development.md`. Preserve children and body content. Reject a conflicting same-name file/folder without overwriting.

Documents rename updates frontmatter `title`. Update a task's automatic `description` only when it is `태스크: 이전 제목`; preserve manual descriptions, body, other properties, and item IDs. Add no properties to Markdown without frontmatter. Reject malformed frontmatter before renaming. Recover title, path, and link changes together. Task queries never revert filenames to previous titles.

Read existing `MOC.md` and `_MOC.md` as folder representatives without moving files on open. Creating, renaming, or moving a child renames the representative to `_폴더이름.md`; do not bulk-migrate project documents or change `archives/`. The root MOC remains **Document Home**. A folder without a representative is selected by click and expanded/collapsed by its chevron. Double-click/Enter expands it without changing the editor; its first created child creates a representative.

Document display names prioritize the representative's title over the path. File/folder names may contain natural language, spaces, uppercase letters, and Korean; retain reserved entry filenames. Representative frontmatter `title` and first heading use natural language, such as `문서 홈` and `개발 계약 홈`. Existing MOCs serve as the opening view of their parent document rather than as files that enumerate lists.

## Navigation and Editing

- Documents without children show a 4px bullet in the chevron position (the existing 20px column). This applies to single documents and folders that, after loading, have no children other than their representative or MOC. Unloaded folders retain the existing chevron for lazy loading. The bullet is an `aria-hidden` decoration, and existing document opening and child addition behavior is retained.
- `FileTree.documentPages` displays the Docs list as parent and child documents. The regular file view retains existing navigation.
- Child list requests from names and arrows share a per-folder cache and Promise and retain existing rows during revalidation. For runs of 200 or more files and closed folders, only rows near the viewport are rendered, while expanded parent document and representative body detection is retained. Detailed criteria follow [File and Folder Navigation](../features/projects-files-search/file-folder-exploration-and-operations.md#implementation-details).
- Clicking a parent document's name selects it; double-clicking or pressing Enter opens its representative body. The arrow only expands or collapses its child list. The representative file is hidden from that list. Document names and editor tab names omit `.md` and the representative file's underscore.
- Documents editor tabs prioritize the current body's frontmatter `title` and use the path's display name if no title exists. Title input changes are reflected in the tab immediately. Confirmed task path changes and open body updates follow the [Task Storage Contract](task-list.md#client-lifecycle-and-errors).
- The Documents tree and editor tabs convert storage path slugs to natural-language display names. For example, `document-pages.md` is displayed as `Document Pages`, and `api-reference.md` as `API Reference`. Capitalization and spaces in natural-language names are displayed as written. Actual storage paths and link targets are unchanged.
- Explorer selection is independent of the active editor tab. Ctrl/Cmd+click toggles selection, Shift+click selects a visible hierarchy range, and Ctrl/Cmd+Shift+click adds the range. Space selects without opening. Double-click or Enter opens the page through the existing editor tab flow and preserves unsaved content; Ctrl/Cmd+Enter opens a separate tab, while modified double-click stays a selection action. Collapsing or filtering removes hidden rows from selection, while offscreen virtualized rows remain selected. Selection, virtualization, keyboard shortcuts, context menus, and grouped clipboard, delete, and drag operations follow the [explorer selection contract](../features/projects-files-search/file-folder-exploration-and-operations.md#selection-opening-and-context-menus).
- Each document's **+** prompts for a child document name. The top **New Document** action also uses the selected document as the parent, or creates the document at the Docs root if nothing is selected. The `.md` extension may be omitted from the name. Docs does not have a separate New Folder button.
### Inline child page creation

In editable project Markdown, Hotview's `/page` → **Child Page** replaces the command with a focused inline name field at that position, without a dialog.

| Action or condition | Behavior |
| --- | --- |
| Enter or Create icon | Create the child, insert its link at the command position, and keep the parent open |
| Enter during IME composition | Confirm composition only |
| Empty/whitespace name | Reject submission |
| Esc or Cancel icon | Dismiss, restore editor focus, and create nothing |
| Document navigation or lost edit access | Cancel unfinished entry |
| Existing same-name file/parent | Append the first available number starting at 2; link the finalized name |
| Guest, read-only, archive, or outside-project file | Command unavailable |

Open the new page by double-click, selection + Enter, or its link. Reuse Documents' **+** structural engine for `abc.md` → `abc/_abc.md`, link adjustment, draft saves, and tab updates. In an existing representative, create a sibling in that folder; new pages support nested children. Remove the `/page` text before creation. Cancellation/failure inserts no link.

### Moving pages and graph entry
- Child documents can be moved by dropping them onto a page or by cut/copy and paste. If the destination is a single document, it is converted to a parent document. When duplicating a folder, the copy's representative name is also matched to the new folder name.
- **View Graph** appears once at the Docs root above Document Home. Graph connections use actual body hyperlinks; folder containment is not substituted for links.

Titles being edited in the editor or tasks appear in the explorer immediately as they are entered. Actual file paths are adjusted after save confirmation; until then, documents open using their original paths. Renaming the same document retains its document identifier in the open editor, preserving title input focus and cursor position, body selection, and scroll position. Task save ordering and validation follow the [Task Contract](task-list.md#client-lifecycle-and-errors).

## Change Handling

`shared/document-pages.ts` shares representative detection, path mapping, and link adjustment. It adjusts relative Markdown, reference-style, and wiki links and image paths to new locations while preserving external URLs, anchors, body labels, code, and frontmatter. Only editable current documents are updated; read-only documents and archives bodies are not modified. Links outside this scope must be checked separately during external document migration.

`server/document-pages.ts` first checks conflicts, path escapes, and permissions. Changes run as a single synchronous batch; failures roll back paths, bodies, and creations. Deletion targets are held in a temporary location on the same filesystem and removed after success. This is not a persistent transaction that provides automatic recovery from process interruption.

`POST /api/docs/pages/{create,rename,delete,move,copy}` checks login, `filesWrite`, and source/destination file permissions. Recursive operations require edit permission for every child. Input is `{path,name?,destination?,project?,unique?}`, and the response is `{path,moves,changed,removed?}`. `project` defaults to `docs`, and Markdown in regular projects uses the same engine. `unique: true` avoids name conflicts during creation by adding numbers; the default `false` retains conflict rejection for the existing **+** action. Structural changes do not create automatic Git commits. Caches, search, and watch lists are updated starting from the surviving parents of changed paths.

`useTabs.prepareDocumentPageMutation` waits for prior structural changes and active saves, then saves the target project's drafts (Docs by default). Defer that project's autosaves, manual saves, and modified-tab closing until the mutation and subsequent body fetches finish.

On success, `applyDocumentPageMutation` updates paths, body links, and save baselines across all project panes, then waits for new-path body fetches. Preserve edits made during the mutation and autosave them to new paths; late older fetches cannot overwrite newer saved bodies or cache. Keep other projects' tabs and split layouts. `createChildPage` combines preparation, API creation, and application without opening a tab or changing the active document. A response after working-folder switching cannot update the new folder's tabs. No separate collaboration protocol broadcasts path migrations to other users' existing tabs.

The inline name field is a local ProseMirror widget with a React portal. Its unfinished value and controls are absent from Markdown, autosave, undo history, and collaboration data. The widget tracks the insertion position through document transactions. The editor passes the confirmed name to the host's `onCreateChildPage(name, insert)` callback; the host handles page creation without a name dialog.

Input continues to be reflected in the editing buffer during structural changes. `/page` tracks the command position through transactions and inserts the link in the creation success callback before changing the path or collaboration room. Subsequent path adjustment rewrites both the new and existing links. Reapplying the body preserves the local editor's selection and scroll position. The host communicates the new collaboration room's readiness through `collaborationPending`; cursor, focus, and scroll restoration are deferred in the temporary editor while it is preparing.

Links with natural-language paths URL-encode spaces, Korean characters, parentheses, `#`, and `?`. Shared documentation checks read encoded links and `<공백 있는 경로>` and follow `_폴더이름.md` representative documents in the map chain in addition to `MOC.md` and `_MOC.md`.

## Database Row Subpages

The [database row-page contract](database-row-pages.md#database-row-subpages) owns name-based paths, title previews, migrations, shared-field synchronization, permissions, and live updates. It uses the same parent/child structural engine described above.

## Verification

- `server/document-pages.test.ts`: first-child/last-child conversion, existing MOC compatibility, relative link and code preservation, name conflicts, permissions, archive boundaries, path escapes, and recovery from move, copy, and write failures.
- `server/document-pages-access.test.ts`: actual API login, write capability, child permissions, creation/deletion, and path and conflict errors.
- `server/document-pages-ui.test.ts`: name/arrow clicks, representative hiding, current-tab replacement, Ctrl/Cmd tabs, switching during editing and autosaving to new paths in actual FileTree and useTabs, on desktop dark and mobile light themes.
- `server/editor-page-command-ui.test.ts`: `/page` inline entry without a dialog, field focus and viewport fit, empty-name rejection, IME Enter handling, keyboard and button confirmation/cancellation, navigation cancellation, exclusion of unfinished names from autosave, link insertion at the command position, keeping the parent view open, explicit link opening, input during creation, cursor and focus preservation after path switching, duplicate and nested creation, regular project Markdown, permission errors, and read-only and guest boundaries in actual EditorPane, Editor, and useTabs on PC and mobile, with and without collaboration. The file API and collaboration sockets use isolated test doubles.
- `server/workspace-switch-ui.test.ts`: regression checks for Docs creation, view switching, and project tab restoration in the actual App.
- `server/db/row-page-layout.test.ts`: verifies source document conversion, natural-language filenames and conflicts, UUID migration, title-driven leaf and parent renames, manual locations, deferred autosave renames, composed child mappings, nested DB bindings, attachments, body/link preservation, and rollback after DB failures.
- `src/utils/database-page-mutations.test.ts`: verifies the order of draft saving, path application, and autosave resumption, and cancellation of pending requests after working folder switches.
- `server/database-page-title-ui.test.ts`: verifies immediate explorer/open-tab previews, delayed saves and renamed-file reads, preservation of tab identity and newer drafts, confirmed page links, failure recovery, and ordering of page-path refreshes. `src/utils/document-title-preview.test.ts` checks preview identity across path remaps and protection against stale completion.
- `server/db/rowPages.test.ts`: Verifies numeric and list frontmatter for rows, no date field creation, file save permissions, preservation of current fields and rejection of conflicts when saving stale bodies, and connection recovery after external edits and file moves in an isolated Postgres instance.

Touch interactions on physical devices and simultaneous structural changes by multiple connected users are not verified by this isolated Chromium check.

On 2026-10-04, display name conversion was added so slug filenames appear as natural language in the Documents tree and tabs. `server/document-pages.test.ts` and `server/document-pages-ui.test.ts` were run directly to verify parent and child document operations and display name regressions. TypeScript, lint, and document link checks passed. The full `npm test -- --runTestsByPath ...` run was stopped because the repository script ran all patterns together, mixing in unrelated agent UI test timeouts and environment failures.

## description-based discovery and new files

AI selects documents by path and description according to the [document rules](../README.md). Existing MOCs are retained for screen representation and link compatibility; creating a new Markdown file does not add an MOC link. Default Documents documents generate a title-based description, which authors refine to match the body’s scope. File-level commits include only the requested files and do not automatically include other modified MOCs.
