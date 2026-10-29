---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew Canvas PDF and standard ink annotations. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0147 — mew Canvas PDF and standard ink annotations"
created: 2026-09-15
updated: 2026-09-15
---

- Date: 2026-09-15
- Status: Adopted
- Decision makers: Codex + user requests for a PDF viewer, optimization, and saving handwriting within PDFs

## Background

The embedded PDF iframe conflicts with production's `frame-ancestors 'none'` and behaves differently across devices. The app must control memory use for large documents and handwriting input.

## Options

1. Embedded viewer iframe — Browser-dependent; cannot control handwriting storage.
2. Full-featured PDF UI — Requires separate UI and state layers.
3. Installed PDF.js display API and a custom Canvas UI — Reuse the parser and directly control page lifecycles, input, and saving.

## Decision

- Parse in a PDF.js worker and display only needed pages in Canvas and text layers. Apply per-page pixel budgets, render cancellation, and resource release. Lazy-load the viewer and PDF saving code.
- Pen input consists of vector strokes in document coordinates. Draw them on a separate Canvas without rerendering the PDF.
- Use PDF-LIB in a separate worker to save directly into the PDF as standard `/Ink` annotations and appearance streams. Preserve the original body content and annotations from other tools. Do not write a new PDF parser.
- Saving to the original is explicit and follows existing file access permissions and archives immutability. Use version conditions and temporary file replacement to prevent damage to the original from failures during saving or concurrent saves. On conflict, retain the handwriting and offer a copy for download.
- Serve runtime resources from the same origin. Do not relax the frame-blocking policy for PDFs.

## Rationale

This retains a mature PDF decoder while allowing control over display, memory, and handwriting latency for large documents. Standard vector annotations are visible and printable in other PDF tools without a separate sidecar. Keep detailed implementation and verification scope in the [development contract](../../development/pdf-viewer.md).
