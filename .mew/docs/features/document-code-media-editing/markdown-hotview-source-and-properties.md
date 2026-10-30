---
id: "mew-editor-markdown"
parent: "mew-editor"
title: "Markdown Hotview, source, and document properties"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "2741d359b18c61eecb53b8ce0ba2862f0f42c088d7d02cf55c88a23d1d44a98e"
files: ["packages/editor/src/editor/FrontmatterSelect.tsx", "server/frontmatter-options.ts", "src/hooks/useTabs.ts", "src/components/EditorPane.tsx", "src/components/markdown-error-boundary.tsx", "packages/editor/src/Editor.tsx", "packages/editor/src/editor/FrontmatterPanel.tsx", "src/components/TableOfContents.tsx"]
commits: []
description: "A feature contract covering Markdown Hotview and Plain editing, per-block computation caching and Pretext-based DOM virtualization, preservation of code-block line breaks and internal horizontal scrolling, retaining the line being read when switching views and cursor restoration boundaries in the properties area, checkboxes, document tables of contents, frontmatter properties, and navigation through backlinks and parent-file arrows beside the title. Includes parent-file exclusion, cross-project references, YAML preservation, the floating mobile keyboard button, and source-saving boundaries."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Edit Markdown in both the rendered body and source.

### Scope

- Repeated Hotview computations use per-block caches, and with 120 or more top-level blocks, Pretext height prediction avoids creating DOM for off-screen content. Cursor, selection, and IME positions and the full editing and collaboration model are preserved.
- Provides Hotview/Plain switching, headings, lists, checkboxes, quotes, code blocks, and emphasis.
- Hotview code blocks preserve original line breaks, spaces, and tabs. Long lines do not wrap automatically and scroll horizontally within the block, with the same behavior on mobile and in read-only mode. The copy button remains fixed at the block's upper right.
- Typing `[] ` or `[ ] ` at the beginning of a line creates a checkbox line. Click to toggle completion, press Enter to continue the list, or return to a normal paragraph from an empty item.
- Provides frontmatter property editing, a document table of contents, and list indentation.
- The diagonal arrow to the right of the frontmatter title opens a list of referencing documents and navigates to the selected document. The list includes permitted documents from external projects and excludes the current document's `상위파일`.
- `상위파일` is hidden from regular property rows and opened through the ↑ button beside the title. If one parent can be opened, navigation is direct; if multiple parents can be opened, choose one. The source frontmatter is preserved and edited in source mode.
- Date properties use the same shared calendar as the task panel to select or clear a single date. Direct year and month changes and keyboard navigation are supported, and stored values retain `YYYY-MM-DD`.
- The shared date picker calendar switches months with horizontal touch swipes while retaining the selected value. Vertical scrolling and date tapping remain supported.
- The frontmatter title and each property row also display their Markdown source line numbers.
- Property field indentation is limited to 12px, including the handle icon and right margin.
- Property rows retain a minimum height of 32px and 4px spacing between rows regardless of type. Single-line values are vertically centered at the same height, while rows expand to fit wrapped multi-select values.
- Single-select and multi-select popups support search, entering a new name, and pressing Enter to create and select an option together. Option lists are shared among fields with the same name in the same project.
- Use the handle to the left of a property to reorder it, and the type menu to assign document link, single-select, multi-select, date, text, or number. Each type entry displays a type icon to the left of its name.
- Preserve the visible cursor line or the body line being read when switching between Hotview and Plain.

- On mobile, editable Hotview, Plain, and code bodies show a translucent circular keyboard button at the bottom center. Tapping it opens the keyboard at the current selection; it hides while the keyboard is open and returns after dismissal. Read-only, loading, partial-preview, and media views do not show it. See [Mobile Editor and Keyboard](../../development/ui-contracts.md#mobile-editor-and-keyboard).

- When the mobile keyboard opens, reduce the editor height to keep the tapped cursor line and the status bar showing the selected character count and file size above the keyboard.

### Boundaries and limitations

- Supported Markdown syntax and save rules follow the editing guide and editor implementation contract.
- Do not convert the entire file format into arbitrary rich text.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)
- [Hotview Input and Block Rendering](../../development/hotview-rendering.md) — Caching, visible range, navigation restoration, and limitations for large single lists, tables, and long selections.

<!-- mew:implementation:start -->
## Implementation details

- Apply `white-space: pre` and `overflow-wrap: normal` to code block `pre` and retain the existing `overflow-x: auto`. Use the `.tiptap.ProseMirror pre` selector to override Tiptap's default `pre-wrap` injected later. Keep existing line wrapping behavior for regular body text and inline code.

- The Parent File ↑ button reuses the `parents` paths and titles returned by backlink analysis. It can also open permitted external parents and excludes missing or unreadable files from navigation. It provides direct opening for a single parent, list selection for multiple parents, and loading, empty, failure, and retry states.

- Backlinks beside the title use a shared popup to provide a list of titles and paths, plus loading, empty list, failure, and retry states. The popup can also open in read-only mode and cancels pending requests when switching documents. It queries through the host's optional `EditorApi.fetchBacklinks` and uses existing file link handling to open documents outside the project. It shares the analysis cache with the graph, counts only body links, and excludes frontmatter and parent files. Navigation scope, permissions, and reverse indexing follow the [Graph and Backlink Engine](../../development/document-graph.md#backlinks).

- Read YAML block and inline arrays/objects and multiline strings in frontmatter as complete properties. When saving the body or other properties, preserve unchanged original YAML and comments to prevent task tags and assignee lists from being reset. Apply explicit changes to values, keys, and types and field deletions as requested. The detailed save contract follows the [Editor Package](../../development/packages.md).

- Changed the shared calendar's date display to segmented year, month, and day inputs. The same `DateField` handles direct editing of single dates and both ends of a date range, automatic segment navigation, preservation of invalid dates, and read-only mode. Keep the calendar open during direct input.

- Handle horizontal touch and pen swipes on the shared `DateCalendar` date grid as month navigation. Vertical scrolling and cancellation do not change the month, and date clicks after a swipe are blocked.

- Replaced the date property's native browser calendar with the shared `DateCalendar` in single-date mode. The task panel retains the same component's date-range selection mode. The detailed contract follows the [Editor Package](../../development/packages.md).

- Reposition the focused cursor after mobile viewport or editor height changes, and restore the height when the keyboard closes. The detailed contract follows [Mobile Editor and Keyboard](../../development/ui-contracts.md#mobile-editor-and-keyboard).

- Provides Hotview/Plain switching, headings, lists, checkboxes, quotes, code blocks, and emphasis.
- Position the slash insertion menu above or below the input location based on the screen space available excluding the mobile keyboard. Detailed behavior follows [Basic Editing](../../../../docs/guides/editor.md#basic-editing).

- Isolate Hotview initialization and rendering errors within the document and provide recovery in source mode.
- View switching passes the source line number and its vertical position on screen, and uses the existing restoration observer to maintain the position during editor initialization and delayed rendering. Stop restoration on user input.
- When switching to Hotview from frontmatter title or property lines or surrounding blank lines, restore only the scroll position of the corresponding property area. Do not convert the property panel outside the body into a ProseMirror cursor position, preventing an invalid selection position from scrolling the entire app down.
- Detailed behavior follows [Basic Editing](../../../../docs/guides/editor.md#basic-editing).

- Register the same `TaskList` and `TaskItem` schemas for checklists on the client and collaboration server. Markdown saving, nesting, line numbering, and copying contracts follow the [Editor Package](../../development/packages.md).
- Align list line numbers in the same left gutter as regular paragraphs, regardless of nesting depth. Lists containing internal file links also retain the body line height.
- Align property line numbers with the x-coordinate of title and body line numbers, and move handles and field contents right to prevent overlap. Provide mouse and touch reordering; a type menu accessible by right-click, click, and keyboard, with field deletion at the bottom; adding and deleting selection options; and restoration of types and options after reopening the document. The storage format follows the [Editor Package](../../development/packages.md).
- Always show line numbers for the first line of an empty document and consecutive empty paragraphs. Use separate pseudo-elements for the input hint and line numbers, and retain the existing `<br/>` save contract for intermediate empty paragraphs. Save the final empty input paragraph as a single trailing newline and use the immediately following source line number. Deleting a blank line after a bulleted list or checklist leaves no extra blank lines or skipped numbers.
- Show source line numbers for horizontal rules in the same left gutter as the body.
- Hotview line numbers show the starting Markdown line of the current body content and update immediately after edits in the middle, changes to the final empty paragraph, and frontmatter changes. Calculation and update contracts follow the [Editor Package](../../development/packages.md).

- Single-select and multi-select fields use custom lists that support searching and creating options. Shared storage, compatibility with existing documents, refetching, and failure handling follow the [Editor Package](../../development/packages.md).
- While the body loads, show a translucent black overlay and a centered indicator in the editor area and block editing.
- Keep tab switching available and remove the overlay on success or failure.
- The detailed contract follows [Editor Body Loading](../../development/ui-contracts.md#editor-body-loading).

- Insert a Mermaid flowchart with `/diagram`. In Hotview, show the code by default and open a diagram popup with the image icon button. Retain the standard `mermaid` code fence.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `server/mobile-editor-keyboard-ui.test.ts` covers the floating button in Hotview, Markdown Plain, and code, keyboard visibility, selection preservation, keyboard API and native-focus paths, translated labels, and excluded views. Physical OS keyboard behavior still requires device verification.

- 2026-10-29: `server/editor-code-block-scroll-ui.test.ts` verified preservation of the original two lines, spaces, and tabs in dark and light themes at 1100px and 390px; internal horizontal scrolling for long lines while retaining the editor width; copy button position; regular paragraph wrapping; and read-only mode. Scope and check results follow the [Work Record](../../work/editor-code-block-scroll.md).

- 2026-10-14: Reproduced and fixed an issue where switching from Plain to Hotview in the property area scrolled the app down to an incorrect body cursor position. `server/editor-view-switch-ui.test.ts` passed checks for preserving the view, restoring body lines, and preserving source text on PC and mobile, for guest and logged-in users, and with delayed collaboration initialization. Existing error isolation and source recovery checks in `server/editor-collab-ui.test.ts` also passed. Application to the running app will be checked after the user builds it.

- 2026-10-08: Backlink analysis, actual API, and PC/mobile UI checks passed for hiding the property row; directly opening a single parent; selecting among multiple parents; empty and failure states; external parent path resolution; and parent permission filtering.

- 2026-10-08: `server/document-backlinks.test.ts`, `server/document-backlinks-access.test.ts`, and `server/document-backlinks-ui.test.ts` passed checks for excluding parent files, external references, reflecting changes, API permissions, and popup behavior, keyboard operation, closing, retrying, request cancellation, and opening external document tabs on PC/mobile in both themes. Graph analysis and API permissions, shared overlay unit checks and back navigation UI, and full type, lint, and documentation checks also passed. In additional regression checks, `server/frontmatter-ui.test.ts` failed due to an existing mismatch between `guide.md`/`../guide.md` expectations, and `server/overlay-layer-ui.test.ts` failed due to a mismatch in the expected dock divider click area before opening the popup.

- 2026-10-08: Temporary browser validation using the existing frontmatter UI fixture confirmed a row height of 32px for text, link, single-select/multi-select, and date fields, row spacing of 4px, and read-only height on PC (1280px) and mobile (390px). Targeted lint, documentation description, and documentation allowlist checks also passed. The existing full frontmatter UI regression check stopped due to a mismatch between the expected link path `guide.md` and the actual `../guide.md`.

- 2026-10-05: `server/date-calendar-ui.test.ts` and `server/frontmatter-ui.test.ts` verified direct segment input, automatic navigation, keeping a single popup open, correction of reversed date ranges, preservation of nonexistent dates, deletion, and read-only mode on PC and mobile. Existing `server/date-field-ui.test.ts` and targeted lint also passed. The full type check failed due to an unused variable error in `server/task-schedule-ui.test.ts` outside this work's scope.

- 2026-10-05: `server/frontmatter-ui.test.ts` passed checks using actual mobile touch for left/right month navigation, preserving the selected value, vertical gestures, cancellation, and subsequent date taps, along with PC regression checks. Lint for the changed calendar also passed. The full type check failed due to task Gantt and tag code errors outside this work's scope.

- 2026-10-05: `server/frontmatter-ui.test.ts` passed checks for opening the shared calendar, selecting and saving dates, and closing with Esc on PC and mobile. `server/date-field-ui.test.ts` and lint for the changed UI code also passed. Task UI checks could not be completed because task save code undergoing concurrent changes rejected input and timed out.

- Use `server/editor-keyboard-ui.test.ts` to check that line 28 remains visible in the keyboard-reduced viewport, repeated resizing works, the status bar and auxiliary keys do not overlap, input works, height is restored, and desktop and reading scroll positions are preserved. The OS keyboard itself requires checking on a physical device.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check that body content, properties, and list structure are preserved after switching between Hotview and source mode.

- Regression validation:
  - `server/editor-collab-ui.test.ts` injects initialization and rendering errors into the actual collaborative editor to check that the app remains usable, source recovery works, other documents can be opened, body content is preserved, and unnecessary saves are prevented on desktop and mobile.
  - This test does not reproduce the conditions that originally caused a specific user's error.

- Use `server/editor-pane-ui.test.ts` to verify desktop and mobile loading indicators, cache refetching, consecutive switches, and removal of the loading state for empty documents and after failures.

- Use `server/frontmatter-options.test.ts` to verify shared option storage, project and field isolation, concurrent additions, deletion and prevention of restoration from stale seeds, permissions, invalid input, and preservation of a corrupted ledger.
- `server/frontmatter-ui.test.ts` also verifies direct input, creation and selection in the selection popup, duplicate prevention, shared lists in other documents, reopening, and value preservation on save failure on PC and mobile.
- Use `server/frontmatter-ui.test.ts` and `packages/editor/src/utils/frontmatter.test.ts` to verify PC and touch reordering, type switching and value preservation, saving and reopening options and single-select/multi-select fields, opening internal links, displaying external links, Esc, back navigation, outside presses, menu boundaries in both themes, and read-only mode.
- Use `packages/editor/src/editor/markdownBehavior.test.ts` to verify checklist completion states, nesting, Markdown save round trips, and body preservation when mixed with regular lists. `server/editor-line-numbers-ui.test.ts` verifies `[] ` input, completion toggling, continuing with Enter and exiting empty items, Tab nesting, and checkbox/line number layout in both themes on PC and mobile.
- Use `server/editor-line-numbers-ui.test.ts` to verify line 1 in an empty document, nonoverlapping input hints, consecutive empty paragraph numbers, `<br/>` saving, and restoration of line 1 after deleting everything on PC and mobile.
- Use `packages/editor/src/editor/lineFocus.test.ts` and `server/editor-line-numbers-ui.test.ts` to verify line numbers for insertions and deletions in the middle, the final empty paragraph, multiline lists, code, horizontal rules, and property changes.
- Use `server/editor-view-switch-ui.test.ts` to verify view preservation after switching to Hotview from the property area, delayed collaboration initialization, repeated view switching, preservation of source line 180, reading positions with the cursor offscreen, and source preservation on PC and mobile for guest and logged-in users.

- Use `server/editor-diagram-ui.test.ts` to verify default code display and the image button popup on desktop and mobile, actual remote desktop flowchart rendering, Esc, closing, focus restoration, and syntax errors and recovery. `packages/editor/src/serverExtensions.test.ts` verifies round-trip preservation of Mermaid fences through the collaboration schema.

- Use `packages/editor/src/editor/slashMenuPosition.test.ts` to verify placement below, placement above in a keyboard-reduced viewport, viewport movement, height/width limits on narrow screens, and shrinking search results. Keyboard animations on physical devices require user verification.

<!-- mew:validation:end -->

- 2026-10-03: Verified deletion and recreation of the final empty paragraph after bulleted, ordered, and checklist items, the final source newline, and line numbers after rereading. PC and mobile Backspace regression checks, 132 editor and memo collaboration checks, the full type check, and lint for changed code passed.
