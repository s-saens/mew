---
title: "0094 — Open the mobile editor keyboard explicitly"
description: "Decision to reserve mobile editor body keyboard activation for the floating button, dismiss it on outside app presses, and separate persistent keyboard policy from native text selection."
created: "2026-10-30"
updated: "2026-10-30"
---

# 0094 — Open the mobile editor keyboard explicitly

Status: Approved

## Background

Mobile editor body taps previously opened the OS keyboard after a short delay intended to distinguish a single editing tap from double-tap selection. Adding a floating keyboard button left two ways to open input. The requested interaction reserves keyboard opening for the button and lets a press outside the OS keyboard dismiss input, including a press within the document body.

## Decision

- For editable mobile Hotview, Plain, and code bodies, apply persistent manual keyboard policy and an input-suppression hint. Native body taps and text-selection gestures do not open input.
- The floating keyboard button alone authorizes body input. Restore the input hint, focus the body synchronously in the user gesture, and use the keyboard API when supported, with native focus as fallback.
- A pointer press elsewhere in the app dismisses the editor's authorized keyboard session, restores suppression before native focus, and retains the underlying control's action. Pressing another pane's keyboard button transfers input to that pane.
- Keep keyboard policy in a dedicated pane hook. The native touch-selection hook owns only selection-menu timing. Restore original attributes and clean up ownership when the editor, permissions, view, mobile layout, or pane lifetime changes.

## Alternatives and rationale

Retaining delayed opening on body taps would conflict with explicit activation. Canceling every body press would prevent cursor placement and native selection. A single pane owner can suppress keyboard activation while preserving those gestures and avoiding competing restoration by the selection-menu hook. The [VirtualKeyboard API specification](https://www.w3.org/TR/virtual-keyboard/) separates manual policy from focus and requires an input mode other than `none` for explicit show and hide requests.

## Consequences

Moving the cursor while typing closes the keyboard and requires pressing the button to resume. Auxiliary editor keys also dismiss it because they are outside the OS keyboard. Hardware typing and desktop focus remain available. Browsers without a keyboard-control API rely on `inputmode` and native focus behavior, so Android and iOS verification remains necessary.

The current implementation and verification contract is [Mobile editor and keyboard](../development/ui-contracts.md#mobile-editor-and-keyboard). This decision replaces the previous single-tap activation behavior described there.
