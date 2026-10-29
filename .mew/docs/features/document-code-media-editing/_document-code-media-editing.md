---
id: "mew-editor"
parent: null
title: "Document, code, and media editing"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "5405e740d54631862951e658052a02f4a4136a8ef96ba7298acb03a646db3588"
files: []
commits: []
description: "Parent feature document grouping Markdown, source, document properties, code, links, tables, footnotes, media, and PDF editing with autosave. Provides child feature scopes and links to detailed contracts, and distinguishes ownership of individual implementations and validation."
상위파일: "../_features.md"
---

## Requirements

- Provide editing and reading experiences suited to each file format.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Markdown Hotview·Source·Document Properties](markdown-hotview-source-and-properties.md)
- [Code·Text Editing and In-Document Search](code-text-editing-and-document-search.md)
- [Links·File References·Attachments](links-file-references-and-attachments.md)
- [Markdown Table Editing·Copying](markdown-table-editing-and-copying.md)
- [Footnotes·References](footnotes-and-references.md)
- [Media·Spreadsheet Previews](media-and-spreadsheet-previews.md)
- [PDF Reading·Annotation·Saving](pdf-reading-annotation-and-saving.md)
- [Autosave·Undo](autosave-and-undo.md)

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- Groups the currently available child features into one work area.
- Each child feature links to the basis for its implementation and limitations.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review child feature boundaries and omissions.
  - Parent status does not automatically approve child statuses.

<!-- mew:validation:end -->
