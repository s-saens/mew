---
title: "Agent error dialog layering"
description: "Records the November 9 agent error dialog portal and focus fixes, desktop and mobile regression checks, existing image-viewer fixture failure, and runtime application boundary."
created: "2026-11-09"
updated: "2026-11-09"
---

An attachment error dialog rendered within an agent panel could appear behind Dock. The dialog now uses the shared modal portal, and is mounted only while its agent tab, Dock body, and project view are visible. The current [overlay contract](../development/ui-overlays.md#shared-layer-order) describes ordering, dismissal, and focus behavior. The HTTP text-copy fallback places its temporary input inside the active dialog and restores focus afterward.

Local verification:

- `node --test server/agent-error-dialog-ui.test.ts packages/ui/src/copyText.test.ts`: 7 tests passed. The browser regression exercised desktop and mobile widths, Dock hit testing, delayed errors in hidden views, returning to a view, nested Escape and Back handling, outside dismissal, and both clipboard paths. The previous dialog implementation failed the Dock hit test at both widths.
- `npm run build` and `npm run lint -- --quiet`: passed. An initial build found a TypeScript error in the new test; the corrected test passed the subsequent build.
- `node --test server/agent-error-dialog-ui.test.ts server/overlay-layers-ui.test.ts`: the new test passed, but the existing image-viewer Dock hit test failed. Its fixture omits styles moved into an independently modified, uncommitted shared image viewer. Temporary fixture copies passed with the current viewer's styles included and with the HEAD viewer. The original test and the independent viewer changes were left intact.
- `npm run check:docs`: descriptions passed, but 37 existing missing-target links failed the repository link check, including the already deleted decisions README and missing MOC paths.

The build updated local `dist/` assets, but no server lifecycle operation or deployment was performed. Verification used isolated browser fixtures; the reported running workspace was not retested after applying the change.
