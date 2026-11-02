---
title: "Readable Hotview clipboard text"
description: "Accepts readable plain text alongside existing rich HTML for Hotview copy and cut, with source copying retained in Plain and explicit table exports unchanged. Records model-based serialization, fallback ownership, alternatives, and compatibility limits."
created: "2026-11-02"
updated: "2026-11-02"
---

## Status

Accepted. The current behavior is owned by the [Markdown feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#copying-and-cutting); implementation boundaries follow the [editor package contract](../development/packages.md).

## Context

Hotview rendered a formatted document but copied Markdown into `text/plain`. Destinations that preferred plain text received heading markers, emphasis delimiters, link syntax, and other source formatting. The same mismatch affected context-menu copy and cut.

## Decision

Serialize Hotview's selected ProseMirror model into readable plain text while preserving the existing rich HTML and ProseMirror slice metadata. Use one view-level serializer for native and context-menu operations. Disable the client's Markdown copy fallback, retaining Markdown input parsing and file serialization. Plain mode remains the route for copying source; explicit table exports retain their formats.

## Alternatives and rationale

- Keeping Markdown as the default retains source fidelity but does not address pasting into ordinary applications.
- Adding a second copy action leaves the everyday keyboard shortcut unchanged and adds a choice for a behavior already distinguishable by Hotview versus Plain.
- Stripping syntax with regular expressions can damage literal punctuation and code. Reading rendered DOM can include controls or omit virtualized content. The document model provides the selected content independently of display state.

## Consequences

Plain-text destinations lose rich styling by design, but retain readable structure. Rich-text destinations and internal paste continue using HTML where supported. Browser clipboard capabilities and destination applications determine which representation is accepted. Copying does not alter saved Markdown, permissions, or the existing requirement that cut deletes only after clipboard success.
