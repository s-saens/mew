---
title: "Workspace page pinch suppression and editor font zoom"
description: "Records the 2026-11-02 implementation of native page-pinch suppression and local font zoom for code, text, Markdown Plain, and Hotview; documents local verification separately from physical-device behavior and runtime application."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and resulting behavior

Keep native two-finger touch gestures from scaling the surrounding Mew workspace while retaining editor-local text enlargement. The viewport keeps its existing safe-area and keyboard settings and adds `maximum-scale=1`. Document touch and gesture handlers cancel native multi-touch defaults without stopping event propagation. One-finger scrolling and selection, Ctrl/Cmd+wheel, and browser keyboard zoom retain their input paths.

CodeMirror now accepts the existing 8–40px font zoom for Markdown Plain as well as code and text. Hotview provides local 8–40px document-font pinch zoom with proportional line height and its existing 11px gutter numbers. Zoom changes display state without editing Markdown, changing undo history, or triggering autosave; read-only bodies support the same reading gesture. Separately embedded documents retain their own touch handling.

Current requirements belong to [workspace touch zoom](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md#touch-zoom), [code/text touch zoom](../features/document-code-media-editing/code-text-editing-and-document-search.md#touch-zoom), and [Markdown touch zoom](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#touch-zoom). [ADR 0112](../decisions/0112-workspace-touch-zoom.md) records the shared policy and accessibility trade-off.

## Local verification

- `node --test server/code-pinch-zoom-ui.test.ts server/workspace-pinch-zoom-ui.test.ts server/markdown-pinch-zoom-ui.test.ts server/editor-view-switch-ui.test.ts server/editor-keyboard-ui.test.ts`: all five browser tests passed. The pinch fixtures use the production viewport settings and document touch policy. Trusted Chromium touch events verify page scale, editor enlargement, and one-finger scrolling; synthetic events cover Safari gesture cancellation and cleanup. Editor checks also cover focused reading anchors, source and selection preservation, undo, size limits, read-only views, and view switching.
- `npm run build`: passed, including TypeScript checks. Vite reported large output chunks.
- `npm run lint`: exited successfully with warnings. No unrelated lint cleanup is included.
- `npm run check:docs`: metadata and local-link checks passed.
- Scoped `git diff --check`: passed.
- The Impeccable detector returned a warning for the unchanged blockquote border in `packages/editor/src/editor/editor.css`. Its HTML stylesheet resolution could not find the root-relative font stylesheet at the filesystem root, so those color and variable checks were incomplete. The existing blockquote style and asset URL were preserved.

## Application boundary

No deployment, launcher execution, or server lifecycle operation is part of this task. Physical-device Safari and Android touch handling, including OS accessibility interaction, remains unverified. Synthetic event checks cannot prove native page-scale suppression on a physical device.
