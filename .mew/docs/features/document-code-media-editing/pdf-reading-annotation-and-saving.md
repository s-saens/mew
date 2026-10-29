---
id: "mew-editor-pdf"
parent: "mew-editor"
title: "PDF Reading, Annotation, and Saving"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-25"
status_hash: "b749b40de63eb8c6d48b59612004c55dac7bc042f3883af412cbf26f08966f92"
files: ["src/components/pdf-viewer.tsx", "src/components/pdf-page.tsx", "server/pdf.ts"]
commits: []
description: "Feature contract covering PDF page navigation, zoom, text selection, fullscreen, and pen and highlighter annotations. Explains saving to the original, downloading a copy, file permissions, and annotation and physical-device limitations."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Read PDFs, add pen and highlighter annotations, and save them.

### Scope

- Provide fullscreen, page navigation, zoom, text selection, and floating tools.
- Save pen and highlighter annotations to the original PDF or download a copy.

### Boundaries and limitations

- PDF access and saving follow the target file's permissions.
- Supported annotations, rendering, and physical-device limitations follow the PDF development contract.

### Detailed contracts

- [Editing Guide](../../../../docs/guides/editor.md) · [PDF Development Contract](../../development/pdf-viewer.md)

<!-- mew:implementation:start -->
## Implementation details

- Zoom and pen width use custom dropdowns that retain selection and close-first behavior in PDF fullscreen and the mobile fullscreen fallback.

- Provide fullscreen, page navigation, zoom, text selection, and floating tools.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check page navigation, zoom, annotation positioning, and reopening saved copies on desktop and mobile.

<!-- mew:validation:end -->
