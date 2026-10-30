---
title: "Hotview Input and Block Rendering Contract"
description: "Defines Hotview's per-block Markdown serialization and line number caches, Pretext height prediction and offscreen DOM placeholders, preservation guarantees for ordinary and IME composition input at file link boundaries, selection, collaboration, navigation, and font changes, and verification methods."
created: 2026-10-19
updated: 2026-10-30
---

# Hotview Input and Block Rendering Contract

Hotview separates computation for changed blocks from the DOM displayed onscreen while retaining the full ProseMirror document and existing Markdown storage format. It is based on the [adoption decision](../decisions/0016-hotview-pretext-windowing.md) and [pre-adoption measurements](../research/editor-input-performance.md). Performance comparisons and verification results are kept in [post-adoption measurements](../research/hotview-pretext-performance.md).

## Input and Serialization

[IncrementalMarkdown](../../../packages/editor/src/editor/incrementalMarkdown.ts) is installed after `tiptap-markdown` initialization. It uses the existing node and mark renderers and state constructor, without importing private package paths or separately duplicating Markdown rules.

- Caches unchanged top-level ProseMirror nodes and block boundary state. Editing one paragraph reserializes only that block and neighbors whose boundaries changed. Each node has at most 8 boundary variants.
- Retains the completed document string for only the most recent document. Repeated queries for the same document do not rebuild the entire output.
- Preserves separation between adjacent lists, empty paragraphs and the final newline, and storage formats for code, tables, and HTML. Custom renderers that also modify preceding output fall back to the existing full serialization.
- Clipboard `Fragment` retains the existing serialization path. When a selected line range is requested, completed preceding blocks are reused and only the prefix of the relevant block is rendered.
- `onUpdate` save notifications continue to be delivered synchronously. Latency is not hidden by delaying saves or dropping some input. Reserialization is skipped when React returns the body just emitted. Lightweight transactions that align the browser cursor on either side of links are retained, and line number and body analysis reuse caches during these transactions.
- Cancelable, non-composition `insertText` occurring inside the cursor widget at a [file link boundary](../../../packages/editor/src/editor/file-link.ts) is applied as a model transaction in `beforeinput`. This prevents input loss where characters remain only in widget DOM ignored by ProseMirror, and keeps the widget's zero-width characters out of the source. This handling does not apply during composition or to read-only input.

- When IME composition starts in the same cursor widget, explicit stored marks retain surrounding formatting and exclude the file link mark. ProseMirror then starts its normal composition in the document DOM outside the widget. Cursor alignment waits until composition ends so ongoing preedit text stays in editable content. The handler preserves the native composition lifecycle and leaves the document unchanged until text is entered.

[LineFocus](../../../packages/editor/src/editor/lineFocus.ts) stores line numbers in plugin state. Initially loaded source uses a Markdown line map to account for spacing, comments, and blank lines; after edits, numbers are updated using cached blocks' contributions to the source. Cursor movement and viewport updates do not rerun line number analysis. External body replacement resets source mapping with explicit `source` metadata even if the model or saved string is identical. Local echoes and changes to the number of property rows pass `offset` metadata to reuse the existing body cache.

## Pretext and the DOM Display Range

[VirtualBlocks](../../../packages/editor/src/editor/virtualBlocks.ts) uses the screen height plus an overscan of 700px above and below when there are at least 120 top-level blocks. Editing DOM for offscreen blocks is omitted starting with initial EditorView creation.

Offscreen blocks are height placeholders without `contentDOM`. The model is not truncated, and nodes are not removed from the Yjs document. One placeholder remains for each top-level block, so the total DOM count is not completely independent of document length.

Uses `prepare`, `layout`, and the rich inline API from [Pretext 1.0.0](https://github.com/chenglou/pretext) to predict paragraph and heading heights. Preparation results are associated with nodes and font, letter spacing, and line wrapping settings, and are reused when width changes. Inline differences such as code and links are reflected, but initial heights for tables, media, and complex blocks are estimates. Actual heights and margins are measured after display to correct them.

Scroll and resize handling is batched per frame. Actual heights are measured, and positions are corrected relative to the first visible block to reduce scroll jumps. Font loading, width changes, and theme changes update the height cache. Positions are not searched again from the document start for each node, and ProseMirror decorations for line numbers and file link cursors are also limited to the display range. Drag copies sharing the same node object also have separate DOM and retention ranges for each document position.

## Preserving Editing and Navigation

- The block containing the cursor and the entire selection remain mounted. Long range selections or Select All can create substantial DOM to ensure accurate copying and browser selection.
- When a separate input such as a DB cell or title has focus, its block is also retained to preserve the unsaved draft. Playing HTML audio and video are also retained, and the display range is recalculated when focus or playback ends.
- The position undergoing IME composition is tracked through transaction mapping and retained until composition ends. Full composition behavior with an actual OS Korean keyboard requires hands-on verification.
- Displayed blocks use the existing code, table, image, and media node views. Existing views are cleaned up when hidden and recreated when displayed again. Playback positions of paused video and audio and internal state of unfocused iframes are not preserved.
- Source line navigation from the table of contents, search, or a return from Plain to Hotview does not depend on searching the entire DOM. It finds the model position, creates the target block with `materializeVirtualPosition`, and then queries its coordinates.
- Undo, redo, and Yjs collaboration operate on the entire document. Transactions that change the display range are excluded from save and undo history.
- Closing the editor cleans up RAF, scroll/resize, font, theme, composition, focus, and playback observers.

Items and rows inside a huge list or table that forms a single top-level block are not virtualized separately. The browser's built-in Find in Page can see only mounted text, so use Mew's document search to search the entire document. Offscreen text also does not remain in the accessibility tree.

## Verification

Verification runs in isolated fixtures without building the app or starting a server.

```bash
node --test packages/editor/src/editor/incrementalMarkdown.test.ts packages/editor/src/editor/lineFocus.test.ts packages/editor/src/editor/virtualBlocks.test.ts
node --test server/editor-virtual-blocks-ui.test.ts
MEW_BENCH_SAMPLES=20 node server/editor-performance-benchmark.mjs
```

`server/editor-ime-ui.test.ts` sends trusted Chromium composition updates and commits through CDP. It checks Hotview, Plain, and code before and after selection-menu actions and keyboard reopening, file-link boundaries on mobile and desktop, adjacent links, surrounding bold formatting, cancellation and reentry, and Hotview code blocks. The [IME input work record](../work/editor-ime-input.md) records debugger evidence, verification, and physical-device limits.

Unit tests verify exact matches with the existing native serializer, changed-block recomputation, line number preservation, display ranges, selection, IME, focus, playback positions, cleanup, and position distinctions between copies of the same node object. UI tests verify input, undo, copying, table of contents, search, source line navigation, restoration of table and image node views for hidden blocks, and preservation of DB title drafts while scrolling and saving on blur, across desktop and mobile and local and Yjs editing. Performance figures are based on ASCII input in synthetic Markdown and do not guarantee field INP or performance on actual mobile devices.
