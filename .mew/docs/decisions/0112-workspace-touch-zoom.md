---
title: "Workspace touch zoom and editor font resizing"
description: "Accepts suppression of native page pinch zoom in the Mew document while retaining editor-local touch font resizing, desktop browser zoom, and separate embedded-document input. Records alternatives and accessibility and device-verification limits."
created: "2026-11-02"
updated: "2026-11-02"
status: "accepted"
---

## Context

The user requested a fixed workspace page scale while retaining two-finger enlargement of editor contents. Code and text already support local font resizing; Markdown Hotview and Plain need the same reading gesture. A viewport scale limit alone does not consistently suppress native touch zoom across browsers.

## Decision

Add `maximum-scale=1` to the existing viewport settings and use `touch-action: pan-x pan-y` on the application document. Install document listeners that cancel the default action for multi-touch starts and moves and native gesture starts and changes. Leave propagation available to local editor handlers and clean up listeners on disposal.

Enable CodeMirror font resizing for Markdown Plain as well as code and text, and provide local font resizing in Hotview. Preserve Ctrl/Cmd+wheel and browser keyboard zoom. The document policy also covers public shares rendered in the same Mew application; separately embedded documents retain their own input policy.

The current contracts are [workspace touch zoom](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md#touch-zoom), [code/text touch zoom](../features/document-code-media-editing/code-text-editing-and-document-search.md#touch-zoom), and [Markdown touch zoom](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#touch-zoom).

## Alternatives and rationale

- A viewport limit alone is simpler but leaves browser-dependent native page pinch behavior.
- Disabling all zoom input would also remove desktop browser zoom and is broader than the requested touch behavior.
- Keeping page pinch everywhere would preserve native whole-page magnification but would resize surrounding controls during document reading.

Canceling only native touch defaults keeps the workspace stable while letting editor handlers resize document text.

## Consequences

Whole-page touch enlargement is intentionally restricted, including controls outside editors. Editor font resizing and desktop browser zoom remain available, but they do not replace whole-page touch magnification for every accessibility need. OS magnification remains outside application control. Actual Safari and Android gesture behavior requires physical-device checks; synthetic event tests do not establish that result.

Implementation evidence and application limits belong to the [work record](../work/editor-touch-zoom.md).
