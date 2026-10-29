---
title: "PDF Rendering, Ink Annotation, and Saving Contract"
created: 2026-09-15
updated: 2026-10-19
description: "Defines the contracts for PDF.js Range rendering and virtualization, color inversion, fullscreen, compact floating tools, conditional saving to the original file, draft lifetime, file limits, and verification."
상위파일: "MOC.md"
---

[Usage](../../../docs/guides/editor.md#reading-and-annotating-pdfs) · [ADR 0147](../history/decisions/0147-mew-canvas-pdf-and-ink-annotations.md)

## Execution and Rendering

`MediaViewer` lazy-loads `pdf-viewer.tsx` only in PDF tabs. It uses the installed PDF.js display API instead of the browser's built-in PDF iframe. The PDF.js worker parses PDFs, while app-created Canvas and text layers handle display and ink annotations. No other PDF UI framework or CDN is used.

- After obtaining the original version and editability through HEAD requests to `/api/pdf` or `/api/fs/pdf`, the document opens at the same path with a version condition. It uses Express Range responses and 256KiB requests, with PDF.js automatic prefetching of the entire document and streaming disabled. The bytes needed for the first page vary with the file structure. Saving requires the entire original file's bytes.
- Only visible pages and one page before and after are mounted. Page offsets are calculated using a cumulative height array and binary search. Before a page is visited, its size is estimated from the first page; it is then corrected using the visited page's actual size, rotation, CropBox, and UserUnit. When preceding page sizes are corrected, zoom changes, or the split pane width changes, the current reading page is preserved before paint.
- Each document's render queue draws one page at a time. Pending work outside the viewport or at a previous zoom level is skipped, and work in progress is canceled. Expensive drawing yields PDF.js continuations to animation frames.
- A single Canvas is limited to 4 million pixels, 8192 pixels per side, and DPR 2. The combined budget for PDF, completed ink, and current-stroke Canvases on visible pages is 16,000,000 pixels. Work buffers during page replacement and PDF.js internal decoding memory are separate; this value is not a memory limit for the entire process. The paper's CSS size is preserved while raster resolution is limited at high zoom.
- Each page's operator list and Canvas are cleaned up when leaving it, and the document, worker, and render tasks are destroyed when the tab unmounts. Scroll saving and restoration connect `.pdf-scroll` and `.pdf-pages` to `EditorPane`'s existing [UI contract](ui-contracts.md) and `scrollMemory`.
- `pdf-assets-plugin.ts` serves the installed PDF.js version's worker, CJK CMaps, standard fonts, WASM/JS decoders, ICC, and licenses at `/pdf-assets/<version>/`. Development middleware and production asset emission use the same file set. The server must apply the new viewer and assets together.
- CSP retains `frame-ancestors 'none'` and `object-src 'none'`. `'wasm-unsafe-eval'` in `script-src` allows WASM compilation for local image decoders; JavaScript `'unsafe-eval'` is not added. No UI is provided for executing PDF scripts or form actions.

## Floating Tools and PDF Fullscreen

Zoom and pen width are selected from the shared `SelectField`'s custom lists. The current zoom level set with zoom buttons also remains in the option list. Lists are portaled to body in a regular editor pane and to the PDF root in fullscreen, avoiding clipping by the floating bar's transform and overflow or the fullscreen boundary. Fullscreen exit is also registered in the shared overlay stack, so Esc or Back closes the dropdown first and exits fullscreen on the next input. Navigating the list alone does not change zoom or width.

Navigation, saving, ink, color, and fullscreen controls are collected in one translucent floating bar centered near the bottom over the document. Its background uses theme tokens at 84% opacity, local backdrop blur, and 12px corners. Buttons provide a default 24px target and at least 28px for touch pointers, with 14px icons and 11px text. Internal padding is reduced to 4px, cutting its footprint to roughly half the previous size. In narrow panes, redundant zoom buttons and save text are reduced, and the ink row scrolls horizontally. Space equal to the tool height is reserved at the end of the body so the last content remains readable without being covered. Status and save errors also appear inside the bar.

`use-pdf-fullscreen.ts` requests `requestFullscreen` only on the **div inside the PDF**. It does not target the entire document or app root for fullscreen. If unsupported or denied, it switches the persistently mounted `pdf-stage` dialog to the top layer with `showModal`. This escapes ancestor pane transforms and overflow and the app's high z-index, and blocks input to external UI. This fallback does not guarantee hiding the browser address bar.

Entering and exiting fullscreen does not recreate the viewer DOM or PDF worker. Existing page position correction and drafts are preserved. It handles the exit button, Esc, and native fullscreenchange, keeps Tab focus inside the PDF, and returns focus to the entry button on exit. On unmount, it cleans up fullscreen, modal state, and event listeners owned by this viewer. The large-download confirmation dialog is portaled to the PDF root outside the floating bar so it is not clipped by blur/transform or displayed outside fullscreen.

Verification in `server/pdf-viewer-ui.test.ts` includes native fullscreen, blocked app UI hit-testing, Esc, preservation of the same worker and draft, fallback after mobile API rejection, focus, the exit button, and reopening. API references are [MDN Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) and [modal top layer](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal).

## Color Inversion

The `pdf.invertColors` toggle in the floating toolbar is viewer-local state and defaults to off. It communicates its active state through `aria-pressed` and is available in read-only mode. CSS `filter: invert(1)` is applied to `.pdf-inverted .pdf-page` to invert the white paper, PDF content, text selection, completed ink, and current stroke together after compositing. Tool UI and color swatches retain their original colors. Per-page filters preserve virtualization and Canvas pixel budgets without triggering PDF reparsing or Canvas rerendering. PDF bytes, ink colors, and saved drafts do not change, and the state persists through fullscreen, zoom, scrolling, and saving while the viewer remains mounted.

## Ink Annotations and Saving

Input uses Pointer Events, pointer capture, and coalesced events. During movement, only the current-stroke Canvas updates per frame, without updating React state. Coordinates are stored in PDF coordinates using `PageViewport.convertToPdfPoint`, and completed strokes are simplified with a tolerance of 0.25 screen pixels. The pen draws rounded vector lines, the highlighter draws transparent yellow lines, and the eraser deletes newly drawn strokes as whole strokes. Single-point input and pointer cancellation are also preserved.

PDF saving is explicit. PDF-LIB runs in a separate worker to add `/Ink`, `/InkList`, color, width, opacity, vector `/AP` appearance streams, and print flags. Original pages are not converted to images. Original text, page sizes, rotation, and annotations from other tools are preserved. Saving the PDF and downloading a copy use the same serialization path. Saving to the original file does not create a Git commit.

- The original-file save API accepts `PUT`, `Content-Type: application/pdf`, `If-Match: <HEAD 버전>`, and a binary body. It checks existing authentication and guest file permissions before and after upload. External paths are restricted to manager/owner, and `archives` in the resolved path is read-only. Symbolic links pointing outside the project or to blocked directories are rejected.
- The maximum upload size is **100MiB**. Reading is not subject to this upload limit. Annotated large documents can be downloaded as copies if browser memory permits.
- The version consists of device/inode/size/mtimeNs/ctimeNs. Range requests are pinned to the same version to prevent mixing chunks from before and after a change. Saving without a version returns 428; a change conflict returns 409.
- Writes are serialized per resolved path. Data is written to a temporary file in the same folder, permission bits are preserved, and fsync is performed; the version is then rechecked before replacement by rename. Failed temporary files are removed. This is not a distributed transaction that also locks the extremely short race window in which another OS process can write between the final check and rename.
- During saving, viewers of the same document in the same window share an edit lock. On success, they reopen the new original and remove saved strokes from the draft. On failure, the draft is retained. Documents whose original bytes have already been obtained can download an annotated copy even after a conflict. If the original changes while some Ranges remain unreceived, the entire old original cannot be recovered.

## Drafts and Lifetime

`mew:pdf-draft:<계정>:<PDF URL>` contains only the version and vector strokes. The PDF content is not copied to localStorage. Drafts are separated by project URL and account, and split views in the same window share an in-memory draft. Writes are batched for 250ms after stroke completion, flushed on unmount and pagehide, and a beforeunload warning is provided when unsaved ink exists. Undo retains the most recent 50 operations.

Drafts are important data under the [browser storage contract](browser-storage.md) and are excluded from cache cleanup. Storage blocking and quota errors appear on screen. If a recovered draft's version differs from the current original, it is neither applied nor deleted automatically; an explicit discard-draft button is provided. Drafts permitted by storage survive refreshes and tab reopening. Real-time ink merging across separate browser windows is not supported.

## Supported Features

- Page navigation, fit to width, 25–400% zoom, text selection and copying, pen color and width, highlighter, erasing new ink, undo/redo, saving to the original file, and downloading a copy.
- Saved annotations are displayed as part of the original PDF and cannot be edited again with this viewer's eraser or undo. Other PDF tools can handle them as standard annotations.
- Password entry and reading are supported for password-protected PDFs, but resaving ink annotations in encrypted, digitally signed, or certified PDFs is not supported. This is not a tool for preserving digital signatures and adding incremental signatures.
- Full-document search, OCR, a table of contents panel, link/form interactions, and real-time collaborative ink annotations are not provided.

## Verification

- `src/utils/pdf-geometry.test.ts`: page position lookup across 10,000 pages, mixed sizes, pixel/per-side budgets, and stroke simplification.
- `src/utils/pdf-annotations.test.ts`: standard annotations, appearance streams, point input, rejection of invalid coordinates, and preservation of the original, existing annotations, rotation, and CropBox.
- `server/pdf.test.ts`: version conditions, Range, concurrent writes, atomic replacement, permission modes, and preservation of the original on error.
- `server/pdf-access.test.ts`: guest viewing/editing through the actual API, external file roles, archives, path traversal, and symbolic links.
- `server/pdf-assets.test.ts`: output of the worker, CJK resources, fonts, decoders, and licenses matching the installed version.
- `server/pdf-viewer-ui.test.ts`: checks opening a 500-page document, navigating to page 250, virtualization, text layers, ink, undo/redo, draft recovery after tab reopening/refresh, PDF saving, copy download after conflicts, mobile/dark/light UI, and read-only behavior in actual Chromium with production CSP. APIs and files are isolated fixtures. Measured times depend on fixtures and host load and do not guarantee performance for actual scanned documents or mobile devices.

Actual iOS/Android pen devices and the full range of large scans, CJK fonts, and complex vector documents require separate device validation. Do not build or restart running servers during development.

API references: [PDF.js display API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [PDF.js Canvas examples](https://mozilla.github.io/pdf.js/examples/), [PDF-LIB save API](https://pdf-lib.js.org/docs/api/classes/pdfdocument).
