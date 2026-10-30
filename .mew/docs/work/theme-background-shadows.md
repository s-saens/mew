---
title: "Theme background colors for UI outline shadows"
description: "Records the replacement of fixed black tab-chevron, loading-logo, and Mewpet notification outline shadows with theme background colors, regression verification, and the scope not applied to production."
created: "2026-10-30"
updated: "2026-10-30"
---

Tab chevrons, full-entry/project-loading logos, and Mewpet notification bubbles now use the selected theme's base background color for their outline shadows. This removes the fixed black tint from light and colored themes. Existing opacity, offsets, blur radii, masks, and animation remain unchanged. Gradient themes use their base background color. The [shared UI contract](../development/ui-contracts.md#shared-loading-indicators) and [panel layout contract](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md) own current behavior.

Verification:

- The new `server/theme-shadows-ui.test.ts` failed against the original CSS because tab shadows remained black instead of matching the palette background.
- `node --test server/theme-shadows-ui.test.ts server/tab-scroll-arrows-ui.test.ts packages/ui/src/loading-indicator.browser.test.ts`: 5 tests passed. Isolated Chromium checked both arrows, the logo wrapper, and notification shadows at 1100px and 390px across all seven presets and two custom solid/gradient palettes, including immediate switching, layer opacity, and unchanged shadow geometry. Existing tab scrolling, focus, selection, loading animations, reduced motion, and forced-color checks passed.
- Desktop Midnight and mobile Rose fixture screenshots were inspected.
- `npx tsc -b` and `npx oxlint server/theme-shadows-ui.test.ts` passed.
- `npm run check:docs` passed with 559 descriptions, no metadata errors, and no local-link errors. `git diff --check` passed.

The app was not built or deployed, and the running server was not changed. The user applies the changes through their normal build and update process.
