---
title: "Readable Hotview copy and cut"
description: "Records the 2026-11-02 change from Markdown clipboard text to readable Hotview text alongside rich HTML, regression and build results, and clipboard/device verification limits. Distinguishes local verification from user-owned runtime application."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and result

Hotview copied Markdown syntax into plain-text destinations even when users selected rendered text. It now supplies readable text plus the existing rich HTML through keyboard/native copy, context-menu copy, and cut. Lists retain indentation and checkbox state, tables use tab-separated columns, and code keeps its whitespace. Plain mode remains available for source copying.

The current behavior belongs to the [Markdown feature contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#copying-and-cutting). Implementation ownership follows the [editor package contract](../development/packages.md); rationale is recorded in [ADR 0119](../decisions/0119-readable-hotview-clipboard.md).

## Local verification

- `node --test packages/editor/src/utils/clipboardText.test.ts packages/editor/src/editor/prosemirrorContext.test.ts packages/editor/src/editor/markdownBehavior.test.ts`: 36 tests passed. Coverage includes syntax-free text with literal punctuation, paragraphs and hard breaks, whole/partial and empty code selections, list nesting and checkbox state, table/cell selection, merged-cell grid alignment, media fallbacks, rich HTML paste, unchanged Markdown saves, context-menu rich writes, and cut failure/selection safety. An initial test-fixture TypeScript parameter-property parse error was corrected before successful reruns.
- `server/editor-context-menu-ui.test.ts` passed, including the new native copy-event and context-menu regression at 1280px and 390px in editable and read-only Hotview/Plain, plus the existing selection, focus, permission, cut, and paste checks. `server/editor-code-block-scroll-ui.test.ts` also passed. These UI suites ran in the initial combined invocation with the three unit files above; that invocation exited with the subsequently corrected unit-fixture error. Browser checks used isolated Chromium with routed fixtures and started no server.
- `npm run build`: passed, including TypeScript checks; Vite reported its large-chunk warning.
- `npm run lint`: passed with repository warnings.
- `npm run check:docs`: passed with 644 descriptions and zero link errors. Earlier runs encountered missing links in other pending work; those targets existed by the final successful check.
- `git diff --check`: passed.

## Limits and runtime application

External destination apps and physical mobile clipboard behavior were not tested. Browser capabilities and the destination determine whether HTML or plain text is used. A database atom's backing data is outside the document text model and is not exported as table data by body copy.

The required build updates `dist/`, which a running instance serves. No deployment, launcher, or server lifecycle operation was performed.
