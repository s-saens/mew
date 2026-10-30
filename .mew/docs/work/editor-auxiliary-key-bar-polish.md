---
title: "Editor auxiliary key bar polish"
description: "Records the 2026-10-30 auxiliary-key sizing, icons, modifier feedback, shared tooltips, narrow-screen adaptation, isolated regression checks, and pending application to the running instance."
created: "2026-10-30"
updated: "2026-10-30"
---

Improved the mobile editor's small, inconsistent auxiliary keys while preserving their order, keyboard commands, selection, and viewport positioning. The current contract is [Mobile auxiliary key bar](../development/ui-contracts.md#mobile-auxiliary-key-bar).

`MobileKeyBar` now shares 32px-high buttons, 14px decorative SVG icons, modifier colors, pressed feedback, and inset focus outlines across text and editing keys. The default editor labels are 11px. At 360px and below, 10px labels, reduced outer padding, inset key borders, and removal of gaps and dividers keep all 13 editing keys visible at 320px. Terminal stretch keys retain equal allocation and 10px labels. A themed top border replaces the previous shadow.

The bar owns an upward-facing shared tooltip layer instead of relying on native titles or a consumer wrapper. Plain's separate search tooltip layer excludes the bar, preventing duplicate tooltips. Mouse-down prevention continues to preserve editor focus and selection.

Local verification:

- `node --test server/mobile-key-bar-ui.test.ts` passed in isolated Chromium with light and dark themes at 320px, 390px, and 767px. It checks button dimensions, visibility of all editing actions, modifier toggles, callbacks, selection retention after taps, keyboard activation and focus, translated labels, tooltip placement and dismissal, optional-action removal, and terminal flow/stretch keys. The initial implementation failed the 32px target-size assertion before the style change. Captures confirmed both themes, active modifiers, and narrow and wide mobile layouts.
- `node --test server/editor-keyboard-ui.test.ts server/mobile-panel-swipe-ui.test.ts server/mobile-keyboard-ui.test.ts` passed all three tests. These cover actual Hotview/Plain viewport and status-bar boundaries, dock/keyboard transitions, key dispatch, selection, and swipe navigation. An initial integration run was blocked by a missing icon export in a separate keyboard-button change; that change was corrected separately before the successful rerun.
- `npx tsc -b` passed. Targeted `npx oxlint` completed without errors; existing `CodePane` ref and hook warnings remain outside this change.
- The Impeccable detector reported no findings. `git diff --check` passed for the task's tracked files.
- `npm run check:docs` passed with 573 descriptions, no metadata errors, and no local-link errors.

Tests use in-memory bundles and request interception without an app server. No build, deployment, launcher, or server restart was performed. Application to the running instance and physical-device keyboard checks remain with the user.
