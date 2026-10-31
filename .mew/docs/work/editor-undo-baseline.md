---
title: "Protect loaded contents from Undo"
description: "Records the 2026-10-31 reproduction and fix for Undo erasing seeded Plain/code contents, standalone refreshes entering history, and mobile CodeMirror Redo invoking Undo. Distinguishes local regression verification from recovery of the reported file and runtime application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

The collaborative Plain/code editor seeded its loaded body with the default Yjs transaction origin, which its UndoManager tracked. An initial Undo could remove the entire body. A distinct, untracked seed origin now preserves the loaded baseline and keeps the first local edit separate. Standalone Hotview and CodeMirror also exclude external content replacements from history, preventing Undo from restoring stale content after a refresh.

The mobile CodeMirror Redo button synthesized a lowercase `z` with Shift and no character key code. The key dispatcher could match Undo first; the collaborative undo command consumes even an empty stack. Matching physical shifted character casing and key codes directs the button to Redo.

The current contract is [Autosave and undo](../features/document-code-media-editing/autosave-and-undo.md).

## Local verification

The new isolated Chromium regression failed before the fixes: collaborative Plain became empty on the first Undo, and standalone Plain and Hotview restored stale buffers after an external refresh. The regression also exposed the mobile collaborative Redo failure after protecting the seed.

- All six scenarios in `server/editor-undo-baseline-ui.test.ts` pass: collaborative and standalone Hotview, Markdown Plain, and code. They cover initial and repeated Undo, local Undo/Redo through mobile buttons, and standalone external refreshes.
- `server/editor-view-switch-ui.test.ts` and `server/mobile-panel-swipe-ui.test.ts` pass, preserving view switching, mobile gestures, and existing auxiliary-key behavior.
- `server/code-pinch-zoom-ui.test.ts` fails its gesture-midpoint assertion both with this change and with a temporary copy of the committed `CodePane.tsx`. Both runs report the same anchor position and displacement. This pre-existing failure remains outside the Undo fix; the temporary baseline fixture and source copy were removed.
- `npm run build` passes, including TypeScript. The initial build identified a missing output-chunk type assertion in the new test; that assertion was added before the successful build. Vite reports existing large-chunk warnings.
- Scoped oxlint passes without errors, retaining existing React hook/ref warnings. Documentation metadata and local-link checks and scoped `git diff --check` pass.

## Recovery and application boundary

The reported file has not been identified, so no file recovery is claimed. Existing unrelated edits, renamed task documents, and deletions are preserved. Tests use isolated browser fixtures and do not establish the cause of the user's specific incident. No deployment, launcher execution, or server lifecycle operation is performed. The required app build updates served UI assets without restarting the server.
