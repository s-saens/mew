---
title: "Shared Packages"
description: "Shared package responsibilities, engine-independent imports, and host integration APIs, including Hotview voice session cleanup and recording controls. Covers editor metadata and source mapping, terminals, mobile keys, shared UI, diagrams, and verification boundaries."
updated: "2026-11-04"
상위파일:
  - "../MOC.md"
  - "MOC.md"
---
[Installation and execution](../../../docs/guides/getting-started-ko.md)

## Source boundaries

Reusable parts are separated into source packages under `packages/*` (no build—vite and node consume the source directly). Components have no knowledge of fetch paths or authentication; the host app injects server integration through the `api` prop (app implementation: `src/api/client.ts`).

Hotview uses per-block Markdown and line number caches inside the editor package and DOM virtualization based on Pretext 1.0.0. The full ProseMirror and Yjs models are retained, and selection, table of contents, search, and source line navigation restore the required blocks. Storage formats, display ranges, font changes, and limitations of large single blocks follow the [Hotview rendering contract](hotview-rendering.md).

Explorer and mention search functions are imported from `@mew/editor/fuzzy`, and the general API's session classification function is imported from `@mew/tmux-term/command-session`. Neither entry point imports editor or terminal UI. Existing package-root exports remain for compatibility, but pure utilities needed for the start screen use these entry points to keep Tiptap, CodeMirror, and xterm out of initial dependencies. The in-memory bundle regression test `src/api/client-bundle.test.ts` verifies this boundary.

The document pane also imports frontmatter, source annotations, comment anchors, and annotation UI through `@mew/editor/frontmatter`, `annotation-source`, `comment-anchor`, and `annotation-popover`. The `@mew/editor/database` entry exports the database panel and glyph without importing the Hotview editor. These entries preserve independent Plain and Hotview downloads: Plain must not load Tiptap or ProseMirror, and Hotview must not load CodeMirror or Lezer. Use `import type { TreeNode } from '@mew/editor'` for types from the package root. With verbatim module syntax, an inline `import { type TreeNode }` can retain an empty runtime import and download the editor engine, as the background agent panel previously did. The [startup contract](browser-startup.md#workspace-initialization) owns view and popup preparation; `src/components/editor-view-startup.test.ts` checks the actual pane, engine, and agent-panel static dependency closures.

## Shared translations

Shared UI text is translated with `uiText` from `@mew/ui/i18n-core` and `useUiLocale` from `@mew/ui/i18n`. Hosts pass the language through `setUiLocale`, and Mew connects it to the existing `I18nProvider`. The editor, mobile modifier keys, terminal, shortcut errors, and confirmation dialogs use the same language. Utilities used in Node use the `i18n-core` entry point, which does not load React. Dictionaries, subscriptions, and verification criteria follow the [UI translation contract](ui-foundations.md#ui-translation).

## Editor package

`@mew/editor` — TipTap Markdown editor (`Editor`). Includes a frontmatter panel, tables, link/mention tooltips, and media uploads. Injects `EditorApi` (fetchFile, uploadAsset, fetchLinkPreview). Optional `resolveImageUrl(src, documentPath)` computes image display URLs based on the host's project and document paths. Image node views receive the current path through context without changing the original Markdown `src`; hosts that do not inject it use the existing `src`. Also exports fuzzy search and frontmatter utilities. `@` **and** `/` **input detection uses** `onUpdate` **/** `onSelectionUpdate` **(transaction-based)**, **not** `keydown` — keydown space triggers silently fail on mobile (`SlashMenu.tsx` is the current implementation).

### Host APIs and clipboard

Optional `EditorApi.fetchFileCandidates(signal)` returns all viewable file paths in the current project. The editor queries it when opening the `@` menu and filters by filename prefix while typing. Requests are canceled on closure or API changes; if the method is absent or the query fails, candidates from the `tree` prop are used. The Mew host connects `fetchFullTree(project)` with `flattenFiles` from the pure `@mew/editor/fuzzy` entry point to separate candidate queries from the explorer's lazy-loading state.

Optional `renderDrawingEditor(EditorDrawingOptions)` supplies a host-owned drawing popup with `onClose` and async `onSave(File)` callbacks. It enables Hotview's `/paint` and `/그림` commands in editable documents. The editor maps the insertion position through transactions and uploads through `EditorApi.uploadAsset`; changes to the editor, path, API, or editability invalidate pending callbacks. Mew's `EditorPane` lazy-loads `DrawingEditor` in document context, which exports a PNG without calling agent history APIs. The reusable package does not import app drawing code or storage endpoints. See [ADR 0115](../decisions/0115-hotview-drawing.md) and the [Hotview feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#drawing-insertion).

Optional `allowVoiceRecording` defaults to `true` and enables `/voice` in editable Markdown. Hosts without a document-scoped upload destination must set it to `false`; Mew disables it for external server-file tabs. `InlineVoice` is a client-only decoration extension: pending microphone and upload state never change the shared document schema. `useInlineVoice` owns context invalidation and mapped insertion, `VoiceRecordingBlock` owns controls and retry/preview state, and `voiceCapture` owns native recording and track cleanup. Successful uploads insert the existing shared `audio` node; no new server extension or capture endpoint is needed. See the [voice feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#voice-recording).

The `EditorContextTarget` returned by `prepareContextMenu(x, y)` maps the selection as the document changes, and the host releases it with `dispose()` when menu and asynchronous clipboard operations finish. The host owns the menu UI, permissions, and lifetime boundaries, and imports target types and clipboard read/write utilities from `@mew/editor/context-target`, which does not initialize the editor UI ([body context menu contract](ui-editor-input.md#editor-body-context-menu)).

Hotview's view-level `utils/clipboardText.ts` serializer emits readable text from the selected model, sharing the path used by native copy/cut and context-menu `serializeForClipboard`. Keep ProseMirror's rich HTML and slice metadata for formatted destinations and internal paste. Disable the client's Markdown `transformCopiedText` fallback so an empty text result cannot fall through to Markdown serialization; keep Markdown paste parsing and saved-file serialization. Unwrap open list ancestors, retain code whitespace and literal punctuation, separate table columns with tabs, preserve single-cell text selections, and omit the implicit final input paragraph. The complete behavior is owned by the [clipboard feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#copying-and-cutting). Plain/code source copying, explicit table exports, and success-before-deletion cut semantics remain unchanged.

### Source lines and document structure

**Line numbers in the left gutter replace drag handles.** Numbers are always visible regardless of hover (`data-mew-line-numbers` in `LineFocus`), and the handle element is a **transparent handle** overlaid on the number (click selects the block). Block movement starts only **after pressing and holding still for 0.7 seconds**. A drag started before that is not promoted to a move and is handled as the existing drag/scroll gesture through completion. 3 brightness levels: normal → currently grabbed line (`mew-line--hover`, applied by DragHandle's `onNodeChange`) → line containing the cursor (`mew-line--focus`, a decoration from `editor/lineFocus.ts`).

The counting unit must match the unit grabbed by the handle—**one top-level block is one line, and each list item is one line**; `ul`/`ol` themselves are not lines. List padding is 24px per level, and `LineFocus` passes `--mew-list-depth` calculated with `listLevel` to the number decoration. CSS `li[data-mew-line-numbers]::before` reverses indentation by depth to align line numbers at every nesting level in the same gutter. The transparent JS handle must also use 24px per level to remain over the number—do not change only one side.

Checklists register `TaskList` and `TaskItem(nested: true)` from `@tiptap/extension-list` identically in client and server schemas. Default input rules convert `[] ` and `[ ] ` at the beginning of a paragraph, and completion states are saved as Markdown `- [ ]` and `- [x]`. Supports splitting with Enter, exiting empty items, and nesting with Tab/Shift+Tab. Like regular list items, `taskItem` is subject to source line numbering, nesting depth, selection ranges, and copy wrapper removal. Checkboxes are placed in the marker area within the 24px list indentation so they do not intrude on line height or body text.

Frontmatter title and property rows display line numbers calculated from the source by `splitFrontmatter` in the same left gutter. They account for blank lines, comments, and title position and update after additions, deletions, and reordering.

The number is the **starting line in the Markdown source** of the block or list item. If the source normalized to the current schema matches the edited document, the source's blank lines and soft breaks are preserved; if the source prop lags immediately after an edit, numbers are calculated from the serialized save output of the entire current document. The frontmatter line count is added, and property-only changes also update the gutter without a body change. Number decorations are reused per document, source, and offset to avoid reparsing the source on every cursor movement.

Line numbers also appear on the first paragraph of an empty document and consecutive empty paragraphs. Line numbers use `::before` and the first paragraph's input hint uses `::after` so the hint does not obscure the number even in the empty-document state (`is-editor-empty`). Empty paragraphs created by users between content are preserved as `<br/>`.

The automatically generated final empty input paragraph is saved as one trailing newline in Markdown and displays the line number immediately after the last content line (the first body line for an empty document). Even if deleted with Backspace after a list or checklist and regenerated, it leaves no extra empty block or line number two lines later. Intermediate empty paragraphs are calculated from the saved `<br/>`. CSS block indices must not be used as a substitute. Regression verification is handled by `packages/editor/src/editor/lineFocus.test.ts` and `server/editor-line-numbers-ui.test.ts` in the actual desktop and mobile editors.

Horizontal rules display their source line number on the Hotview NodeView's `.mew-horizontal-rule` wrapper. The number aligns with the body gutter and is vertically centered on the horizontal rule; Markdown saves retain the existing `horizontalRule` serialization.

The table scroll container's left edge aligns with the start of the body, with no space before the table inside it. Line numbers appear in the left gutter outside the container and remain fixed during horizontal scrolling. `.tableWrapper` retains `position: static`, and line numbers are positioned relative to `.tiptap`. Negative left margins and compensating padding must not place the gutter inside the scroll area.

`EditorHandle` and the host's `CodePaneHandle` pass source line numbers and vertical positions within the scroll area through `getViewAnchor` and `restoreViewAnchor`. Hotview reuses the gutter's source mapping, and Plain uses CodeMirror document lines. `EditorPane` captures the anchor immediately before a mode change and applies it through the existing MutationObserver and ResizeObserver restoration path. It does not force focus or save the body, and stops restoration on user input, document switches, or the 10-second limit.

### Frontmatter and project options

Frontmatter property line numbers are fixed in the same gutter as the title and body. Property rows use 12px left padding (a 10px handle icon and 2px right spacing) to position field content to the right, with the handle inside that padding between the number and field. Pointer capture handles PC and touch reordering, ending on cancellation, capture release, or blur. Reordering is available through right-click, click, keyboard menus, and Alt+Up/Down. Delete Field at the bottom of the type menu uses the same path as the row's delete button, closes the menu, and removes the document's property, type, and option comments together. Deleting a field does not remove shared option lists. Type menus and single-select and multi-select lists follow portal, visual viewport boundary, `useOverlayDismiss`, and focus restoration rules. Selection values are edited through `FrontmatterSelect`'s own searchable list with option creation. Search input autofocus is allowed only on PC, and Enter during IME composition is not treated as confirmation.

Property types are `text`, `link`, `select`, `multi-select`, `date`, and `number`; unspecified date, number, and link types are inferred from existing values. Document links support relative document paths, external URLs, and Markdown links. Options are shared across single-select and multi-select fields with the same name in the same project. Searching in the picker or entering a new name and pressing Enter or Add creates and selects the option together. Single-select closes after confirmation; multi-select keeps the list open. Changing types does not clear existing values, and converting multiple selections to a scalar type preserves the entire array string. Existing values invalid for numbers or dates are also preserved, with input validation status displayed.

Valid and empty date properties use `calendar="task"` on `DateField`. `DateCalendar` from `@mew/ui` is shared with the task date-range calendar and opens in single-date selection mode for properties. The calendar's date, start date, and end date use `DateField(calendar="none")` to edit year, month, and day segments directly without opening a nested calendar. Existing values that do not match the format retain their original text input and validation state.

When the host injects `FileLinkContext.projectRoot`, Markdown under `features/` in the configured Documents displays the `files` array as a 12px version of the same internal file links used in the body, and the `commits` object array as `FrontmatterTag`. Files open relative to the project root regardless of the document's location, preserving spaces, Korean characters, `#`, `%`, and `?`. Commit tags display the first 7 characters of the hash and provide the full hash, repository, and title in a tooltip. Values whose format differs from the specified property type use the existing property editor. Reading alone preserves the original YAML and comments; JSON array input opened with the edit button saves on Enter or focus change and cancels on Esc. Invalid arrays are not saved. Saving preserves the actual YAML array and commit object structure, and read-only accounts can only navigate files. `feature-frontmatter.test.ts` and `server/feature-frontmatter-ui.test.ts` verify paths, YAML preservation, editing, and both themes on desktop and mobile.

YAML block and inline arrays/objects and multiline strings are parsed as complete properties. `FrontmatterField.source` stores the original key, display value, and YAML so properties whose value, key, and type have not been modified retain their original representation and comments when the body or other properties are edited or reordered. Arrays are not converted to a single empty string, so task tags and assignees are not reset. Fields edited directly or assigned a type follow the existing string storage rules, and converting an array to multiselect preserves individual items.

`FrontmatterField.type` and `options` are stored in a ` # mew:field {"type":"select","options":["Draft"]}` comment at the end of the corresponding YAML line. Regular property values and names are preserved, and the comment does not become an additional property. Multiselect values are stored as a JSON string of a string array without duplicates. Settings move with the field when it is renamed or reordered, and existing documents open without a separate migration. `frontmatter.test.ts` and `server/frontmatter-ui.test.ts` verify saving, reopening, value preservation, and actual input.

`tags` and `assignees` without an explicit type display as multiselect by default. This applies to YAML string arrays, array strings, single names, and empty values; malformed arrays, arrays containing non-string values, and objects retain the existing text editor. Explicit user types take precedence. Both display and selection behavior use `frontmatterType`, so tasks created without type comments or whose arrays are saved again in the panel also display each value as a tag. Reading alone does not modify files or recreate deleted fields. Tab refreshes for task creation and deletion follow the [task contract](task-list.md#client-lifecycle-and-errors). `server/task-frontmatter-ui.test.ts` checks display, deselection, switching to a new document, and read-only behavior on desktop and mobile.

Shared option lists are stored in `<프로젝트>/.mew/frontmatter-options.json` as `{version: 1, fields: {필드명: string[]}}`. `EditorApi.frontmatterOptions` injects per-field lookup and add/remove delta APIs; lookup requires project-wide read permission, and modification requires project-wide edit permission and login. Field names and items are trimmed and deduplicated (limits: 500 fields, 200 characters per field name, 500 items, and 500 characters per item name). Initial list creation uses the current document's existing options as the seed; afterward, the shared list is authoritative. Existing YAML option comments remain for compatibility, but stale comments do not undo deletions from the shared list. Deleting a shared item does not clear selected values in other documents, and those documents continue to display the selected values. Lists are fetched again when a document or selector opens, so changes from other editors appear on the next opening. Concurrent additions apply deltas to the server's current list and save atomically without overwriting a corrupted registry. Failed saves do not apply to the field value and display an error. `server/frontmatter-options.test.ts` verifies project isolation, concurrent additions, refetching, permissions, and save failures.

Documents and Files use the same project-owned option registry. Documents does not create its own nested `.mew`; legacy registries merge on access under the [document metadata contract](architecture.md#project-owned-document-metadata).

### Viewport and auxiliary-key integration

`observeEditorViewport` observes height and viewport changes to keep the current cursor visible after the mobile keyboard opens. Cursor bounds use `visibleEditorBounds` to account for both the actual viewport and the auxiliary key bar's position. [Mobile editor and keyboard](ui-editor-input.md#mobile-editor-and-keyboard) owns the shared contract for Hotview and CodeMirror.

The host controls auxiliary keys through `showMobileKeyBar` (default: `true`). Display requires mobile width and this flag, independently of editor focus. Switching to `false` clears Ctrl/Shift toggles and bottom cursor spacing. Hosts may restrict display further: shared notes require an open Hotview and software keyboard, while regular document editors retain their existing display conditions.

## Shortcut bindings

`@mew/shortcuts` — Keyboard shortcut bindings.

## Terminal package

`@mew/tmux-term` — Provides the terminal body (xterm.js) and server (`@mew/tmux-term/server`: `createTmuxManager`, `createTmuxRouter`, `attachTmuxWebSocket`, cwd parameter). Mew's primary UI is `TmuxTerminal` inside `AgentPanel`; the package's general-purpose `TmuxTerminalPanel` is not currently mounted as an auxiliary panel. The tools on the right side of the button row **each consist of a single icon** (Scroll to Bottom, Keyboard Lock, Selection Mode, Copy). The host app sends the `경로:줄` reference from Ctrl+L in the editor through `mew:insert-ref`, and only the active tab of the selected panel receives it.

**Scroll to Bottom** handles all three cases depending on **what owns the scrolled-up position**: ① For xterm's own scrollback, `scrollToBottom`. ② For tmux copy-mode (programs that do not use the mouse), WebSocket `exitCopyMode` → the server runs `tmux copy-mode -q` (idempotent; sending `q` or Esc to the PTY causes unintended input in the TUI when it is not in that mode). ③ When **the app scrolls directly** (a TUI that captures the mouse, such as Claude Code), tmux has only forwarded wheel events to the app, so ① and ② do not work. In this case, a burst of SGR wheel-down events makes the app scroll to the latest content itself.

**Keyboard Lock** (padlock) prevents the mobile software keyboard from opening by applying `inputMode='none'` to the terminal's auxiliary textarea and bottom input field. Focus remains active, so paste, hardware keyboards, and command buttons still work. This is a browser setting rather than a session setting and persists in `localStorage: mew:tmux-keyboard-lock`.

Successfully sent input from terminal sessions and agent tabs is stored separately in the browser, up to the most recent 100 entries each. It also follows the total capacity and 7-day retention period in the [browser storage contract](browser-storage.md); unsent drafts are excluded from automatic cleanup. Pressing `↑` on the first line or `↓` on the last line of the input recalls the previous or next entry as in a shell, while movement within multiline input retains normal cursor behavior.

The terminal input area uses the same color tokens as the agent composer. The toolbar and input area background use `surface-deep`, the borderless input field uses `surface`, text uses `ink`, and hints use `ink-muted`. The send button is a 32px square with an `accent` background and an `ink-on-accent` upward arrow, retaining its accessible name and Ctrl+Enter tooltip. The shell input's monospace font, automatic height, and send behavior are preserved.

The bottom input field grows automatically with its content within the 32\~160px range. Even when `scrollHeight` measures 0 in a hidden panel, it does not shrink below 32px.

The host translates and passes the bottom input hint through the `inputPlaceholder` prop of `TmuxTerminal` and `TmuxTerminalPanel`. Mew uses the same `common.textInput` translation as the ACP input field.

## Mobile auxiliary keys

`@mew/mobile-keys` provides `MobileKeyBar` for editors and terminals.

**Geometry.** Fit content rather than fixing height: 24px buttons, 4px top/bottom padding, and the top border, with horizontal scrolling when needed. The editor bar stays at the actually visible screen bottom, even in short documents, and moves above the keyboard as viewport size/offset changes. See [Mobile editor and keyboard](ui-editor-input.md#mobile-editor-and-keyboard). The terminal bar occupies layout space between the command toolbar and input, immediately above the input without covering it.

**Terminal keys.** `stretch` and `extraKeys` distribute 11 keys evenly in one row: **Esc · Tab · Ctrl · Shift · ← · ↑ · ↓ · → · Home · End · ^C**. `Home`/`End` send line-start/end and clear toggles after Ctrl/Shift combinations. `^C` sends Ctrl+C to request interruption without sending/deleting the draft or changing focus, keyboard lock, or history arrows. Editors retain their configuration without extra keys or even distribution.

**Layers.** Keep the fixed bar at `z-20`, below fullscreen file explorer/chat/agent/terminal overlays at `z-30`. Using the same `z-30` would place it above the explorer because the editor follows it in DOM order. The bar itself provides no swipe switching.

**Comment action.** `onComment` adds a selected-text comment icon. On mobile it opens the same composer as `Ctrl/Cmd+Shift+C`; the host's `EditorPane.startComment` creates the anchor.

| Optional editor icons | Behavior |
| --- | --- |
| `onCodeBlock` and `onTable` | Toggle the cursor's paragraph as a code block or insert the slash menu's 3×3 table; only editors pass these because terminals have no target |
| `onUndo` and `onRedo` | Use `runUndoRedoKeepingView`, like Ctrl+Z/Y, moving the cursor to the changed location |

In read-only mode, the editor hides all four controls.

## Shared UI package

`@mew/ui` exports `ActionMenu`, `ActionMenuItem`, and `ActionMenuSeparator`; see the [menu contract](ui-overlays.md#shared-action-menus).

| Input | Contract |
| --- | --- |
| `x`, `y`, `onClose` | Placement coordinates and close callback |
| `label`, `trigger`, `portalContainer` | Optional label, trigger, and portal host |
| `orientation` | `vertical` by default; `horizontal` uses the same `ActionMenuItem` children as one scrollable icon row, without separate action data |
| `outsideDismiss` | `pointerdown` by default, or `click`; editor body menus use click dismissal to preserve scrolling/drags |

String children supply accessible names/tooltips; complex labels provide `aria-label`, and explicit `data-tip` is retained. Separators and hidden labels/hints follow orientation context. The shared menu filters movement, scrolling, and cancellation. Native-selection menus retain body focus and delegate body clicks to their selection hook; the menu consumes outside-body clicks. Items accept icons, hints, disabled/destructive/checked states, and execution functions.

`packages/ui/src/action-menu.css` owns styling; hosts import `@mew/ui/action-menu.css` once. Functional wrappers add neither styling nor placement logic. `HeaderMenuPopup` uses the shared ActionMenu header variant, whose appearance is owned by the same shared stylesheet ([hamburger contract](ui-overlays.md#header-hamburger-menu)).

| Other shared pieces | Contract |
| --- | --- |
| Inline `ColorPicker` | [Color input](ui-foundations.md#theme-colors-and-derived-accents) |
| Text-date/custom-calendar `DateField` | [Date storage and calendar](task-list.md#date-storage-and-calendar) |
| Custom single-select `SelectField` | [Dropdowns](ui-overlays.md#dropdowns-and-selection-components) |
| `ConfirmDialog` | Replace native confirm to avoid leaving fullscreen |
| `useToast` | Brief, response-free bottom pill; one toast, auto-dismissed after 2.6 seconds, using `pointer-events-none`. Never register in the overlay stack: Android Back must not dismiss it |
| `pathDrag` | [File explorer drag/drop](../../../docs/guides/editor.md#dragging-and-dropping-file-explorer-items) |
| `useReorderAnimation` and `reorderLayoutRect` | [Drag motion](ui-workspace-layout.md#drag-reordering-motion) |
| `useOverlayDismiss` | [Dismissal rules](ui-overlays.md#overlay-dismissal-rules-useoverlaydismiss) |

Confirmation, toast, file dragging, reordering, and dismissal utilities are dependency-free.

`useDragReorder` handles in-row reordering and reports outside-row drops through `onDragMove`/`onDrop`, including document-tab screen splitting:

| Input | Pickup behavior |
| --- | --- |
| Mobile | 0.35-second long press; earlier movement retains native scrolling |
| Mouse, `immediateMouseDrag` on document/agent/terminal/browser-task tabs | Immediate drag |
| Default mouse | 0.5-second hold; earlier dragging adjusts `scrollLeft` |

A body-hosted visual copy follows the pointer while the original leaves a placeholder; exclude the copy from accessibility and pointer input. For touch holds with a menu, show it only after movement. Remove it on drop, cancellation, Esc, blur, window resize, page hiding, or unmount.

## Verification

Terminal auxiliary key verification: `node --test server/terminal-keybar-ui.test.ts`. Using actual xterm and TmuxTerminal with isolated WebSocket recordings, it checks key sequences, Ctrl/Shift release, draft/focus preservation, a single row above the input at 320/390/767px in both themes, no horizontal or vertical overflow, accommodation of buttons and vertical padding, and hiding on desktop. No actual shell process runs.

## Diagrams

Hotview's `/diagram` inserts a basic Mermaid flowchart. `mermaid` blocks display code by default; pressing the **View Diagram** button with the image icon at the upper right displays the diagram in a popup. Existing Mermaid blocks and read-only documents provide the same view button. The popup closes with the close button, Esc, Back, or an outside press, and restores focus to the invoking button. Source and collaborative saves retain standard code fences. Syntax errors appear in the popup, while the code remains intact for editing. The renderer loads when the popup opens and restricts HTML and click actions in strict mode. Large diagrams scroll inside the popup.
