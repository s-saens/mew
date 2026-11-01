---
title: "Host-injected Hotview drawing and document-scoped image insertion"
description: "Accepts a host-injected drawing popup for Hotview /paint and /그림, with mapped insertion positions and document uploads independent of agent history permissions. Extends the existing SVG drawing engine with transparent export, freehand paths, and optional object snapping without a new object type or format version."
created: "2026-11-02"
updated: "2026-11-02"
---

# Host-injected Hotview drawing and document-scoped image insertion

Status: Accepted. Extends [ADR 0008](0008-agent-vector-drawing.md); the existing agent SVG-history workflow remains in place.

## Context

The drawing board was available only from agent input. Hotview needs the same tools through `/paint` and `/그림`, including for users without agent permission. The reusable editor package must retain its host API boundary, and asynchronous image creation must not insert into a different document or follow a moved caret.

## Decision

- Add an optional host-rendered drawing popup callback to `@mew/editor`. The editor owns slash commands, transaction-mapped insertion positions, image upload, and session invalidation; `EditorPane` lazy-loads the existing app drawing component.
- Add a document context to the drawing board. It converts its SVG to a transparent PNG locally and calls the document's existing upload API. It does not list or save agent SVG history. Keep agent drawing APIs and permissions unchanged.
- Keep freehand strokes as existing path objects, with bounded sampling and cubic controls. Extend version 1 grid metadata with optional object-snap and tolerance settings, preserving legacy defaults and history restoration.
- Display the theme through a transparent canvas and omit the export background. Initialize the stroke color from the theme when the board opens and store explicit object colors; saved images do not depend on theme CSS.

## Alternatives and rationale

Importing app drawing code into the package would reverse the existing dependency boundary. Requiring agent history APIs would deny drawing to otherwise authorized document editors. Relaxing those APIs would broaden access beyond this task. Storing an editable drawing block in Markdown would introduce a new serialization and collaboration contract. The host callback and existing image upload format provide the requested insertion without those changes.

## Consequences

Document drawings become ordinary images and cannot reopen their original editable source from the document. Agent drawings retain SVG history. Hosts that do not inject the renderer and read-only documents do not expose drawing commands. Late uploads can leave an unused attachment, but cannot modify a different document. Freehand has no pressure-sensitive width. Geometry caches rely on immutable point arrays; changing path nodes must replace the array.

Current behavior belongs to the [Hotview](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#drawing-insertion), [drawing board](../features/terminals-agents-automation/agent-drawing-editor.md), and [package](../development/packages.md) contracts. [Local verification](../work/hotview-drawing-tools.md) records checks and limitations.
