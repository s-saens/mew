---
id: "mew-editor-code"
parent: "mew-editor"
title: "Code and text editing and in-document search"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "4d8fe6026b3341576de674bb4b2ae85cd1124f3eb3638b2e33e15d8697ed1fc1"
files: ["src/components/EditorPane.tsx", "src/hooks/useTabs.ts", "src/components/CodePane.tsx", "src/utils/codeSearch.ts", "src/utils/code-search-panel.ts", "src/utils/code-pinch-zoom.ts", "packages/editor/src/editor/EditorSearchBar.tsx"]
commits: []
description: "A feature contract covering line numbers, syntax highlighting, supported diagnostics for code and plain text, and compact Find and collapsible Replace controls at the top of the document, result counts, search options, and keyboard behavior. Explains touch pinch zoom for non-Markdown files, the floating mobile keyboard button and Plain auxiliary key bar, and tab switching that preserves horizontal scrolling in the body."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Edit code and plain text and navigate within the open document.

### Scope

- Displays line numbers, syntax highlighting, and diagnostics for supported formats.
- Provides in-document find and replace, undo, and redo.
- On mobile, pinch out or in with two fingers to enlarge or shrink text and line numbers in code and plain text. This also applies to read-only files.

- On mobile, editable Hotview, Plain, and code bodies show a translucent circular keyboard button at the bottom center. Tapping it opens the keyboard at the current selection; it hides while the keyboard is open and returns after dismissal. Read-only, loading, partial-preview, and media views do not show it. See [Mobile Editor and Keyboard](../../development/ui-contracts.md#mobile-editor-and-keyboard).

- When the mobile keyboard opens, reduce the editor height to keep the tapped cursor line and the status bar showing the selected character count and file size above the keyboard.
- The mobile Plain editor displays the shared auxiliary key bar even when the keyboard is closed. It provides Esc, Tab, Ctrl, Shift, arrow keys, and undo and redo for editable files. Horizontal scrolling in the body does not switch tabs; only swiping left or right on the auxiliary key bar selects the previous or next tab. Markdown Plain follows the same rules.

### Boundaries and limitations

- Language-specific support is limited to extensions that are actually registered.
- Project-wide search is covered by the project and search features.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

### In-document search for code and plain text

- `Ctrl+F`·`Cmd+F` opens a find row at the top of the editor. It groups the search query, current result and total result count, case-sensitive, whole-word, and regular expression options, and Previous, Next, Select All, and Close actions.
- The replace row is collapsed by default and expands when needed. Replace input and actions are hidden for read-only files. At widths of 480px or less, search options remain inside the input, while the result count, Previous, Next, Select All, and Close move to the next row.
- Search options are buttons that indicate their pressed state. Icon buttons use translated accessible names and shared tooltips.
- Search results are counted up to 10,000 matches; beyond that, `+` is appended to the total result count. Search navigation, Select All, replace, undo, and keyboard handling inside the search input retain existing CodeMirror search behavior.
- Select All selects each match individually, up to 1,000 matches. Beyond that, the button is disabled and its tooltip shows the limit. Changing the UI language preserves the search query, replacement string, and expanded state of the replace row.

### Touch zoom

- In the CodeMirror file body and line number area, excluding `.md`·`.mdx`, the font size adjusts from 8 to 40px based on the ratio of the distance between two fingers. The toolbar and overall browser zoom remain unchanged.
- Scrolling is adjusted to preserve the reading position between the fingers. One-finger scrolling, text selection, and keyboard editing retain their existing behavior.
- Pinching does not change the body, selection, or undo history, or trigger autosave. Lifting the remaining finger after a pinch does not move the cursor either.
- The size persists only in the open editor. If the editor is recreated, such as when switching files or toggling read-only mode, it returns to the default 14px.

<!-- mew:implementation:start -->
## Implementation details

- Reposition the focused cursor after mobile viewport or editor height changes, and restore the height when the keyboard closes. The detailed contract follows [Mobile Editor and Keyboard](../../development/ui-contracts.md#mobile-editor-and-keyboard).
- `EditorPane` enables the shared `MobileKeyBar` in `CodePane` and reserves space below the status bar. Modifier keys use CodeMirror's existing keymaps and collaborative undo. Panel swipes are owned by [Panel layout and mobile](../appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md).

- Displays line numbers, syntax highlighting, and diagnostics for supported formats.
- `src/utils/codeSearch.ts` connects the dedicated panel in `src/utils/code-search-panel.ts` to the CodeMirror search extension. Search and replace commands and state use CodeMirror, while panel layout, options, and result counts are displayed through the Mew UI.
- The CodeMirror extension in `src/utils/code-pinch-zoom.ts` handles touch events and font size in the scroll area. It allows default one-finger scrolling and handles only pinching in the editor, cleaning up events and pending frames when the editor is removed.

- While the body loads, show a translucent black overlay and a centered indicator in the editor area and block editing.
- Keep tab switching available and remove the overlay on success or failure.
- The detailed contract follows [Editor Body Loading](../../development/ui-contracts.md#editor-body-loading).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `server/mobile-editor-keyboard-ui.test.ts` covers the floating button in Hotview, Markdown Plain, and code, keyboard visibility, selection preservation, keyboard API and native-focus paths, translated labels, and excluded views. Physical OS keyboard behavior still requires device verification.

- `server/code-search-ui.test.ts` passed at 680px with Midnight and Korean, 390px with Rose and English, and 320px with Ocean and Japanese. Checks covered expanding find and replace, result counts, search options, recovery from regular expression errors, Previous, Next, Select All, IME input, keyboard navigation and closing, single and all replacements and undo, read-only mode, and preservation of input and expanded state after language changes. Horizontal overflow, button heights of at least 24px, shared tooltips, blocking Esc propagation, the `10000+` display for 10,001 results, the Select All limit, and continued navigation were also verified.

- `server/code-pinch-zoom-ui.test.ts` verifies mobile touch zoom, size limits, preservation of reading position, browser zoom, body, selection, and undo history, read-only and plain-text support, and Markdown exclusion. It also checks one-finger input, cancellation, event cleanup after editor removal, and desktop scrolling. Safari and Chrome behavior on actual phones requires real-device checks.

- Use `server/editor-keyboard-ui.test.ts` to check that line 28 remains visible in the keyboard-reduced viewport, repeated resizing works, the status bar and auxiliary keys do not overlap, input works, height is restored, and desktop and reading scroll positions are preserved. The OS keyboard itself requires checking on a physical device.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check highlighting, diagnostics, find locations, and undo after edits in supported files.

- Use `server/editor-pane-ui.test.ts` to verify desktop and mobile loading indicators, cache refetching, consecutive switches, and removal of the loading state for empty documents and after failures.

<!-- mew:validation:end -->
