---
title: "Editor auxiliary key bar polish"
description: "Records the 2026-10-30 initial auxiliary-key polish and subsequent replacement of the editor bar surface with rounded translucent floating keys and a rightmost inverted-T arrow cluster. Covers the 2026-10-31 immediate arrow contact, hold repetition, and drag-direction follow-up, terminal compatibility, local regression checks, and pending application to the running instance."
created: "2026-10-30"
updated: "2026-10-31"
---

The current contract is [Mobile auxiliary key bar](../development/ui-contracts.md#mobile-auxiliary-key-bar). The initial polish below was followed by the floating editor controls described in the next section.

## Initial polish

Improved the mobile editor's small, inconsistent auxiliary keys while preserving their order, keyboard commands, selection, and viewport positioning.

The initial `MobileKeyBar` polish shared 32px-high buttons, 14px decorative SVG icons, modifier colors, pressed feedback, and inset focus outlines across text and editing keys. The default editor labels were 11px. At 360px and below, 10px labels, reduced outer padding, inset key borders, and removal of gaps and dividers kept all 13 editing keys visible at 320px. Terminal stretch keys retained equal allocation and 10px labels. A themed top border replaced the previous shadow. The follow-up below replaces this editor surface and arrow placement while preserving terminal layout.

The bar owns an upward-facing shared tooltip layer instead of relying on native titles or a consumer wrapper. Plain's separate search tooltip layer excludes the bar, preventing duplicate tooltips. Mouse-down prevention continues to preserve editor focus and selection.

Local verification:

- `node --test server/mobile-key-bar-ui.test.ts` passed in isolated Chromium with light and dark themes at 320px, 390px, and 767px. It checks button dimensions, visibility of all editing actions, modifier toggles, callbacks, selection retention after taps, keyboard activation and focus, translated labels, tooltip placement and dismissal, optional-action removal, and terminal flow/stretch keys. The initial implementation failed the 32px target-size assertion before the style change. Captures confirmed both themes, active modifiers, and narrow and wide mobile layouts.
- `node --test server/editor-keyboard-ui.test.ts server/mobile-panel-swipe-ui.test.ts server/mobile-keyboard-ui.test.ts` passed all three tests. These cover actual Hotview/Plain viewport and status-bar boundaries, dock/keyboard transitions, key dispatch, selection, and swipe navigation. An initial integration run was blocked by a missing icon export in a separate keyboard-button change; that change was corrected separately before the successful rerun.
- `npx tsc -b` passed. Targeted `npx oxlint` completed without errors; existing `CodePane` ref and hook warnings remain outside this change.
- The Impeccable detector reported no findings. `git diff --check` passed for the task's tracked files.
- `npm run check:docs` passed with 573 descriptions, no metadata errors, and no local-link errors.

Tests use in-memory bundles and request interception without an app server. No build, deployment, launcher, or server restart was performed. Application to the running instance and physical-device keyboard checks remain with the user.

## Floating editor controls

At the user's request later on 2026-10-30, removed the fixed editor bar's visible container, top border, and dividers. Each key now has its own rounded translucent themed surface, blur, and soft shadow. Ordinary actions remain in one bottom-aligned row, and the arrow cluster moves to the far right with Up above Left/Down/Right. All 13 Hotview actions remain visible at 320px. Terminal in-flow keys keep their original single-row order and equal stretch widths.

Kept the existing geometry wrapper and keyboard/Dock inset handling so the editor reserves the full two-row arrow height. The viewport regression initially failed its old hard-coded restored-height threshold; it now compares with the actual initial editor height and still checks cursor, document, and status-bar boundaries. No editor viewport behavior was changed.

Local verification for the follow-up:

- `node --test server/mobile-key-bar-ui.test.ts` passed in isolated Chromium for both themes at 320px, 360px, 390px, and 767px. It verifies the transparent wrapper, individual rounded translucent surfaces, arrow coordinates, nonoverlapping touch targets, action callbacks, modifier feedback, preserved selection and focus, translated tooltips, optional actions, and terminal flow/stretch compatibility. Captures confirmed both themes and the keyboard-reduced Hotview and Plain layouts.
- `server/editor-keyboard-ui.test.ts`, `server/mobile-panel-swipe-ui.test.ts`, and `server/terminal-keybar-ui.test.ts` passed. The viewport check was rerun successfully after replacing its old height threshold. These checks cover cursor and status-bar boundaries, height restoration, Dock/keyboard spacing, swipe navigation and key dispatch, and terminal draft/focus retention.
- `node --test server/mobile-editor-keyboard-ui.test.ts server/mobile-editor-keyboard-policy-ui.test.ts server/mobile-keyboard-ui.test.ts` passed all three tests, including explicit keyboard activation, suppression and dismissal, pane isolation, cleanup, and Dock restoration.
- `npx tsc -b`, targeted `npx oxlint`, the Impeccable detector, and scoped `git diff --check` passed. `npm run check:docs` passed with 580 descriptions and no metadata or local-link errors.

All checks were isolated from the running instance. No app build, deployment, launcher, server startup, or restart was performed. Runtime application and physical-device keyboard verification remain with the user.

## Immediate arrow contact, hold, and drag

On 2026-10-31, changed shared arrow buttons to move on primary pointer contact, repeat after 350ms and every 60ms while held, and immediately change direction when a held pointer enters a different arrow. The same behavior applies to fixed editor keys and terminal flow keys. Empty space pauses repetition; entering an arrow with an already pressed pointer also works. Coordinate hit testing supports touch implicit capture.

The arrow interaction preserves text selection and editor focus. It consumes pointer-generated release clicks, preserves keyboard and assistive activation, and clears repetition on release, cancellation, capture loss, multiple pointers, blur, visibility change, placement change, or unmount. Arrow gestures cannot switch tabs, and swipes entering an arrow cancel tab navigation. Existing ordinary-key swipes remain available. The current contract is [Mobile auxiliary key bar](../development/ui-contracts.md#mobile-auxiliary-key-bar).

Local verification:

- `node --test server/mobile-arrow-keys-ui.test.ts` passed the fixed and flow subtests using a controlled browser clock, mouse input, and real CDP touch input. Coverage includes initial contact, repeat delay and cadence, drag direction changes, gap/reentry, entry after pressing elsewhere, release/cancel, duplicate-click prevention, secondary-button exclusion, focus and selection, keyboard and assistive clicks, tab-swipe exclusion, and blur/visibility/unmount cleanup.
- `node --test server/mobile-key-bar-ui.test.ts server/mobile-panel-swipe-ui.test.ts server/terminal-keybar-ui.test.ts` passed all three existing compatibility regressions.
- `npx tsc -b`, scoped oxlint, `npm run check:docs`, and `git diff --check` passed without errors.

Checks use isolated browser fixtures. No app build, deployment, launcher, or running-server operation was performed. User application and physical-device verification remain pending.
