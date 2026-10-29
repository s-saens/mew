---
title: "Larger vertical scrollbar touch areas"
description: "Records the 2026-10-30 expansion of vertical scrollbar touch length to three times its previous size, preserved appearance and drag behavior, isolated regression checks, and pending application to a running instance."
created: "2026-10-30"
updated: "2026-10-30"
---

Expanded the invisible area above and below vertical scrollbar thumbs to make them easier to grab on touch devices. The [shared scrollbar contract](../development/ui-contracts.md#shared-scrollbars) owns the current behavior.

`src/utils/scrollbar-touch.ts` multiplies the previous vertical touch length by three, capped at the track length. The 24px touch width, native 6px scrollbar appearance, horizontal touch length, initial scroll position, and drag ratio remain unchanged.

## Verification

- Before the implementation change, the added regression assertion failed because a touch 124px from the track's top did not grab the thumb.
- `node --test server/scrollbar-touch-ui.test.ts server/sidebar-touch-ui.test.ts`: 2 passed, none skipped. Isolated Chromium fixtures verified grabbing above and below the thumb at the top, middle, and bottom; no position jump on touch start; the existing drag ratio; track-length clipping for longer thumbs; and unchanged horizontal touch length and vertical touch width. Existing checks also covered content gestures, buttons, mouse input, hidden scrollbars, rotation, RTL, nested regions, cleanup, and FileTree position preservation.
- The scrollbar fixture checked 390px and 1100px viewports in light and dark themes and asserted the existing 6px native scrollbar size and unchanged content width. Reviewed mobile dark and desktop light captures.
- After correcting a Node-only test callback's DOM type reference, `node --test server/scrollbar-touch-ui.test.ts` passed again and `npx tsc -b` passed.
- `npx oxlint src/utils/scrollbar-touch.ts server/scrollbar-touch-ui.test.ts` and `git diff --check` passed.
- `npm run check:docs` passed: 553 descriptions, no metadata or document link errors.

No app build, deployment, server startup, or restart was performed. Applying the change to a running instance and verification on physical touch devices remain pending.
