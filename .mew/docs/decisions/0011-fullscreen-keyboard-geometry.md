---
title: "0011 — Accounting for Explicit Keyboard Geometry in Mobile Fullscreen"
description: "Decision to address the inability to detect OS keyboard occlusion from viewport and root dimensions alone in Chromium fullscreen using a VirtualKeyboard overlay policy and geometrychange, and to define initial desktop-site zoom-out, touch input detection, restoration to normal display, legacy coordinates, unsupported environments, and verification scope. Subsequent decision 0034 clarifies who configures nested Mewlink iframes, and 0038 supplements policy preparation before entry."
created: 2026-10-16
updated: 2026-10-22
---

# 0011 — Accounting for Explicit Keyboard Geometry in Mobile Fullscreen

Status: Approved

For Mewlink's nested iframes, [0034 — Forwarding Keyboard Geometry from the Top-Level Page](0034-mewlink-keyboard-host.md) supplements policy ownership and geometry forwarding. Existing direct-access handling and legacy coordinate compensation remain in place.

[0038 — Preparing Keyboard Policy Before Entering Fullscreen](0038-fullscreen-keyboard-entry-order.md) supplements policy preparation before the top-level page enters fullscreen, retention while entry is in progress, and restoration on failure.

## Background

Opening the keyboard in mobile fullscreen obscures the bottom of the agent input and send button. The problem persisted on the user's physical device even after the root's actual bottom edge was added to height calculations. Previous regression checks covered only conditions that reduced the root through CSS, so they did not verify cases where the keyboard overlays the screen outside the DOM.

The [Chromium implementation](https://github.com/chromium/chromium/blob/main/content/browser/web_contents/web_contents_impl.cc) does not resize content for the keyboard in fullscreen. Therefore, viewport settings and the minimum of DOM dimensions alone are insufficient to handle occlusion.

## Decision

- In fullscreen environments with a width below 768px or a coarse primary pointer, enable `overlaysContent` if the VirtualKeyboard API is supported, and obtain keyboard geometry through `geometrychange` and `boundingRect`. Restore the previous policy when switching to normal view or an environment not targeted for touch-keyboard handling, or when stopping observation.
- Evaluate the wide CSS layout of desktop-site mode independently from touch-keyboard handling. Normalize screen height using the width ratio between the visual viewport and the layout, and do not multiply the CSS height by the initial zoom-out scale again. Use the same height correction for the workspace and keyboard detection.
- Add keyboard geometry bounds to the existing viewport and root bounds for the workspace and agent input. Dock hiding, editor height and cursor handling, fixed modifier keys, and Mewpet also account for explicit keyboard geometry.
- Calculate the occlusion boundary of a bottom-docked keyboard by subtracting keyboard height from the full layout height. Do not rely on top, because older Android Chromium reports the root's visible origin instead of the keyboard's top. Do not estimate device-specific keyboard heights or margins using constants.
- Retain existing viewport observation in browsers and secure contexts where the API is unavailable. Do not forcibly exit fullscreen or move input focus.

## Rationale and Impact

The [official Chrome API guide](https://developer.chrome.com/docs/web-platform/virtual-keyboard) provides a method for explicitly enabling the overlay policy and then observing keyboard geometry. Retain `interactive-widget=resizes-content` in normal view. Legacy coordinate compensation addresses the older root-origin handling in [Chromium's geometry calculation](https://github.com/chromium/chromium/blob/main/chrome/android/java/src/org/chromium/chrome/browser/compositor/CompositorViewHolder.java).

Keep the shared implementation and test scope in the [Shared UI Contract](../development/ui-contracts.md#mobile-editor-and-keyboard). Isolated Chromium tests inject simulated keyboard geometry into the agent and editor in actual fullscreen; they do not reproduce the OS keyboard in Android Brave on a physical device. The same symptoms in environments without API support and application results in each physical-device browser require separate verification.
