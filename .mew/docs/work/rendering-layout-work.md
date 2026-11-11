---
title: "Reducing repeated layout work in bubbles and scrollbars"
description: "Records the 2026-11-07 Mewpet bubble measurement and scrollbar batching changes, deterministic regression evidence, successful build/lint, pre-existing verification failures, and unverified client performance."
created: "2026-11-07"
updated: "2026-11-07"
---

## Purpose and changes

A user reported slow menus, scrolling, and typing in desktop Chrome after intermittent Mewlink connection delays. No performance trace from the affected PC was available. This work reduces two independently identifiable sources of layout work; it does not establish the cause of that report or fix Mewlink connection establishment.

- [Mewpet bubbles](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#detailed-behavior) skip geometry reads while the anchor transform, bubble/content dimensions, and viewport remain stable. Resize observers and viewport/scroll listeners invalidate cached placement. Dimension styles are written only when changed; cleanup removes observers and listeners.
- [Scrollbar highlights](../development/ui-foundations.md#shared-scrollbars) measure all pending scrolling regions before writing styles and skip unchanged highlight values.

## Verification

- `node --test src/utils/scrollbar-gradient.test.ts server/rendering-work-ui.test.ts`: 2 passed. Covers read/write ordering, duplicate scroll positions, idle placement, anchor movement, content growth, and viewport clamping.
- Rebuilding the rendering fixture with the HEAD version of the bubble hook made the new idle-read assertion fail: 12 anchor geometry reads in 200 ms. The changed hook measured zero in the same test window. This is a deterministic work-count comparison, not a user-PC timing benchmark.
- `server/mewcat-assistant-ui.test.ts` and `server/scrollbar-touch-ui.test.ts`: passed.
- `server/mewcat-fullscreen-guide-ui.test.ts`: failed its existing floor-position assertion, including a separate fixture run using the HEAD bubble hook. This failure predates the bubble change within the current checkout; other pending work was preserved.
- `npm run build`: passed after correcting DOM type usage in the new server-side UI test. Vite reported bundle-size warnings.
- `npm run lint`: passed with repository warnings. Focused oxlint on the four implementation/test files also passed.
- `npm run check:docs`: descriptions passed; link validation failed on 37 missing targets outside the changed documents, including existing MOC and decisions entrypoint references.

## Limits and application

The affected Chrome instance, hardware acceleration, long conversation rendering, and frame times remain unmeasured. These changes reduce repeat work, but no claim is made that they resolve the reported lag. The build refreshed this checkout's `dist/`; no deployment, launcher, or server lifecycle operation was performed. Applying this code on a different Windows host remains the user's responsibility.
