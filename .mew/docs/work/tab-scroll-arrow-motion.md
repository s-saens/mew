---
title: "Tab scroll arrow wall-bounce motion"
description: "Records the 2026-10-30 mirrored tab-chevron wall-bounce loops, deterministic browser motion checks, reduced-motion behavior, and local verification without applying changes to the running instance."
created: "2026-10-30"
updated: "2026-10-30"
---

Tab scroll arrows now gently indicate the direction of hidden tabs through a repeating wall-bounce motion. The right icon accelerates toward a right-hand wall, rebounds immediately, and slows as it moves inward. The left icon mirrors that path. Both move four pixels in total over a 1.2-second cycle using CSS transform keyframes with quadratic acceleration and deceleration. Button geometry, tab layout, scrolling speed, focus, and theme shadows retain their existing behavior. Reduced motion leaves icons centered and static; hidden buttons do not animate.

The [shared tab scrolling contract](../development/ui-contracts.md#active-tab-auto-scrolling) owns the current behavior.

Verification:

- Before the CSS change, the new motion assertions failed because neither icon had an animation.
- `node --test server/tab-scroll-arrows-ui.test.ts server/tab-auto-scroll-ui.test.ts server/theme-shadows-ui.test.ts`: 7 tests passed. Isolated Chromium checked desktop dark and mobile light layouts, sampled nine points across each animation cycle, and verified mirrored paths, outward acceleration, immediate rebound, inward deceleration, seamless repetition, limited travel, fixed button geometry, reduced motion, and existing scrolling, focus, selection, and theme shadows.
- Desktop and mobile fixture screenshots were inspected.
- After adding the hidden-arrow assertion, `node --test server/tab-scroll-arrows-ui.test.ts` passed all 3 tests.
- `npx tsc -b` and `npx oxlint server/tab-scroll-arrows-ui.test.ts` passed.
- `npm run check:docs` passed with 561 descriptions, no metadata errors, and no local-link errors. `git diff --check` passed.

The app was not built or deployed, and the running server was not changed. The user must build and apply the change to see it in the running instance. Physical-device animation smoothness remains unverified.
