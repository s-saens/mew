---
title: "Body Markers and a Hidden Storage Section for Markdown Annotations"
description: "A decision to store annotations as ^[number] markers in the body and an ordered list under $Annotations$ at the bottom of the file, and present them as superscripts and a separate list in Hotview. Keep them separate from existing References footnotes, and remove the storage section when the last annotation is deleted."
created: "2026-10-22"
updated: "2026-10-22"
---

## Status

Adopted.

## Background

Users need to add short explanations at the cursor position or to selected text in a document and edit them in a popup while reading the body. The user requested superscript numbers and a full annotation list, and specified that annotation content be preserved at the bottom of the same Markdown file rather than in a separate data file.

Existing `Alt+E` footnotes use Unicode subscripts and `# References`. References content remains even after the last marker is deleted to protect manually written bibliographies, so this must be distinguished from the new requirement to remove the storage section when the last annotation is deleted.

## Decision

Store annotation body markers in `^[1]` format. Keep annotation content in an ordered list under `# $Annotations$` at the bottom of the file. Hotview displays markers as small superscripts resembling `1)` and hides the storage section from the body. Plain shows the original text unchanged.

Use `Ctrl+'` in the Markdown editor to insert a marker at the cursor position or after selected text and open a text input popup. Annotation content follows the same document's autosave path and can be reopened for editing from body markers or the separate annotation list next to the comment button. When no annotations remain, remove both the `$Annotations$` heading and the list.

Manage existing footnote markers and the References list separately from annotations. Do not move annotations to the comment store or convert existing footnotes to the new syntax.

## Rationale and Impact

Keeping annotations and the body in the same file makes their relationship visible when copying files, reviewing Git changes, or editing plain text. Dedicated markers and a heading distinguish only the annotation section while preserving existing References footnote storage and deletion rules. Other Markdown tools may show `^[번호]` and the list at the bottom as raw text instead of superscript popups.

[Footnotes and Bibliography Features](../features/document-code-media-editing/footnotes-and-references.md) owns detailed behavior and verification criteria; the [Editing Guide](../../../docs/guides/editor.md#annotations) owns usage steps.
