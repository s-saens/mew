---
id: "mew-editor-footnotes"
parent: "mew-editor"
title: "Footnotes and References"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-22"
status_hash: "ab341935e2410ba0c99243d66dc3d86f79a79d87958f44d2e54bca6974166417"
files: ["packages/editor/src/editor/footnoteSync.ts", "packages/editor/src/utils/footnotes.ts", "packages/editor/src/editor/annotations.ts", "packages/editor/src/editor/annotationSource.ts"]
commits: []
description: "Feature contract covering Markdown footnotes and References, and insertion, popup editing, and the full list of annotations added with Ctrl+' or the body right-click menu. Defines storage as inline markers and an ordered list under $Annotations$, hiding in Hotview, and section removal when the last annotation is deleted."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Insert document footnotes and organize their numbering and references.
- Add an annotation at the cursor position or after selected text, and read and edit it in a popup or the full list.

### Scope

- Provide footnote insertion, automatic renumbering, and navigation between body markers and References.
- Provides annotation creation, editing, and deletion, superscript markers, and a complete annotation list.

### Boundaries and limitations

- Footnote syntax and cleanup rules follow the formats supported by the editor.
- Annotations are stored in Markdown files and managed separately from comments, replies, and existing `Alt+E` footnotes.
- Citation sources are not automatically fact-checked.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)
- [Annotation storage format decision](../../decisions/0047-markdown-annotations.md)

### Adding and editing annotations

In Markdown Hotview and Plain, pressing `Ctrl+'` inserts an annotation marker at the current cursor position. If text is selected, the selected text is preserved and the marker is inserted after it. Hotview displays markers as small superscripts `1)` and `2)`.

**Add Annotation** in the body context menu uses the same insertion and editing flow. Right-clicking within an existing selection inserts the marker after the selection; right-clicking outside it inserts the marker at the relocated cursor position. The item is disabled for non-Markdown files and positions that cannot be edited. Shared menu behavior follows the [editor context menu contract](../../development/ui-contracts.md#editor-body-context-menu).

Adding a marker opens a small popup with one text input. The entered content is included in document autosave. Clicking a superscript marker in Hotview reopens the same popup to edit the content or delete the annotation.

An **Annotations** button shaped like a closing double quotation mark sits directly beside the floating comments button. Use it to view all annotations in the current document and select an item to open its editing popup.

### Annotation storage and display

Annotation markers in the body are stored as `^[1]` and `^[2]`, and their content is stored as an ordered list under `# $Annotations$` at the bottom of the file.

```markdown
선택한 구절^[1]과 다른 구절^[2].

# $Annotations$

1. 첫 번째 주석
2. 두 번째 주석
```

Hotview displays only the superscript markers in the body and hides the annotation storage section. Plain shows the source, including markers, the heading, and the list. Deleting all annotations also removes the `# $Annotations$` heading and list. This is separate from the deletion rules for the existing `# References` footnote section.

The annotation storage section extends from the document's top-level level-1 heading `$Annotations$` to immediately before the next top-level heading. Any subsequent headings and body content are preserved. Code blocks, inline code, frontmatter, and escaped `\^[1]` are not read as annotation markers.

Numbers follow the order of markers in the body, with content moved together with its associated existing number. Manually written list items are not automatically deleted even if they have no corresponding marker. If unrecognized body content remains in the storage section, it is preserved even after the last marker is deleted.

During collaborative editing, stable identifiers within the document model link markers to list items, preserving each item's content even when concurrent insertions change the displayed numbers. Identifiers are not added to Markdown. If another participant's edit changes the number of an open annotation or deletes it, the input popup closes to prevent accidental edits to a different annotation.

Markdown and HTML symbols in the input are stored as text rather than interpreted as formatting. Multiple lines are preserved as paragraphs within a list item, and blank lines use the existing editor's `<br/>` format. Annotation operations in Plain change only the necessary marker and list ranges without converting the entire body to Hotview.

<!-- mew:implementation:start -->
## Implementation details

- Provide footnote insertion, automatic renumbering, and navigation between body markers and References.
- Annotations store body markers and a list at the bottom of the file in the same Markdown file, with the storage section hidden in Hotview.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following are user verification criteria, not execution results:
  - Verify that marker and reference numbers match after adding, deleting, or moving footnotes.
  - In Hotview and Plain, use `Ctrl+'` to add annotations at the cursor position and after selected text, and verify that the entered content persists when reopened.
  - Verify that the same content can be opened, edited, and deleted from Hotview markers and the complete annotation list.
  - Verify that the `$Annotations$` storage section is hidden in Hotview and its source is visible in Plain.
  - Verify that deleting the last annotation removes the markers, list, and `# $Annotations$` heading together while preserving existing footnotes and body content.

<!-- mew:validation:end -->
