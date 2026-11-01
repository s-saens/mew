---
title: "Hotview drawing insertion, freehand pen, transparency, and snapping"
description: "Records the 2026-11-02 integration of the drawing board into Hotview, transparent image export, freehand input, configurable object snapping, and cached path bounds. Separates isolated browser and geometry verification from physical-device behavior and user-owned runtime application."
created: "2026-11-02"
updated: "2026-11-02"
---

# Hotview drawing insertion, freehand pen, transparency, and snapping

## Purpose and behavior

Make the existing drawing board available from editable project Markdown through `/paint` and `/그림`. Document saves use the existing image upload contract and a transaction-mapped insertion position. The board remains available after an upload failure, and changes to document identity or editability invalidate late results. Document context does not access agent history. Agent entry points retain their SVG-history workflow.

The board now displays the theme through a transparent canvas and exports transparent SVGs and PNGs. The freehand pen (`B`) supports continuous mouse, touch, and stylus strokes, a configurable width, dots, and one undo entry per stroke. The existing control-point pen remains on `P`. The magnet button opens independent grid and object-snap controls, spacing, and screen-pixel tolerance. Object alignment displays guides, and Alt bypasses snapping.

Current contracts: [drawing board](../features/terminals-agents-automation/agent-drawing-editor.md), [Hotview insertion](../features/document-code-media-editing/markdown-hotview-source-and-properties.md#drawing-insertion), [packages](../development/packages.md), and [ADR 0115](../decisions/0115-hotview-drawing.md).

## Local performance evidence

A Node.js synthetic fixture created 1,000 paths of 100 points each, with cubic controls. After three warm-up traversals, 30 repeated `selectionBounds` calls averaged 27.13ms before the change and 0.256ms after it on this host. This measures geometry calculation rather than whole-editor or physical-device latency. The cache reuses path extrema across translations, with new point arrays, rotation, dimensions, and closure invalidating cached values. Movement bounds and sorted snap targets are also prepared once per gesture; pointer previews remain frame-batched.

## Verification

- Drawing model, freehand, snapping, font, save API, shared translations, existing agent UI, and Hotview insertion regressions passed together: 49 tests, none skipped. Both new Hotview browser test files were then checked together: 2 passed, including the real `EditorPane` host, lazy drawing component, PNG upload, Markdown autosave, and focus restoration. Across these runs, 50 distinct relevant tests passed.
- Isolated Chromium drawing-tool checks passed at 1100, 390, and 320px, including touch strokes, dots, width, undo/cancel, the existing Bézier pen, transparent canvas, exported PNG alpha, hidden-grid snapping, grid spacing, object tolerance, guides, and Alt bypass. Document-context drawing made no agent history requests. Existing agent drawing UI checks passed at 1100 and 390px.
- `npm run build` and `npx tsc -b` passed. The build retained the existing large-chunk warning. Repository lint and lint of changed source/test files passed with existing React warnings. The Impeccable detector reported no findings for changed UI targets, and `git diff --check` passed.
- `npm run check:docs` passed: 637 descriptions, no metadata or local-link errors.
- `src/ui-localization.test.ts` passed its Markdown/time localization test but failed its repository-wide raw-Korean scan on existing literals in API helpers, debugger helpers, and other unchanged calls. The affected drawing icon labels now use explicit translation calls; no new unsupported literal was introduced. This failure remains outside this task.

## Remaining limits

No deployment, launcher, or server lifecycle command was run. Browser checks use isolated mocked APIs, not a physical phone or stylus. Pressure-sensitive stroke width and reopening an inserted PNG as its original editable drawing are outside the implemented scope. Late invalidated uploads may leave unused attachments. Long-document UI latency beyond the synthetic geometry fixture has not been measured.
