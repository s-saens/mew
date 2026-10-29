---
title: "0034 — Forwarding keyboard geometry from the Mewlink top-level page"
description: "A decision to move the VirtualKeyboard overlay setting, which is ignored in nested iframes, to the Mewlink top-level page and forward geometry through the existing connection port. Retains direct-access handling and leaves physical-device validation of Brave's black band as a separate task."
created: 2026-10-21
updated: 2026-10-21
---

# 0034 — Forwarding keyboard geometry from the Mewlink top-level page

Status: Approved

## Background

[0011](0011-fullscreen-keyboard-geometry.md) set the VirtualKeyboard overlay policy in the app. However, the Mewlink app runs in a nested iframe beneath the central connection screen and internal launcher. Chromium's getter returns false in child frames and its setter ignores the setting, so the same handling as direct access does not apply.

## Decision

- The Mewlink top-level connection page sets the keyboard policy based on touch input and fullscreen conditions, and restores the previous value when observation stops. Child frames do not set the native policy.
- Forward keyboard geometry, reference viewport dimensions, and overlay state through the existing connection MessagePort. Do not add a separate global message reception path. The internal launcher also forwards the latest geometry to new app ports.
- The app validates the forwarded values and adjusts coordinates by the CSS width ratio for use by the shared keyboard observer. Calculate the bottom boundary relative to the top-level page to avoid applying it twice alongside internal frame resizing.
- Retain viewport observation for direct access and environments without API support. Do not forcibly exit fullscreen or move focus.

## Rationale and Impact

The [W3C VirtualKeyboard specification](https://www.w3.org/TR/virtual-keyboard/) restricts setting the overlay policy to top-level pages in secure contexts. The [Chromium implementation](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/virtualkeyboard/virtual_keyboard.cc) enforces this restriction as well.

Keep shared calculations, the app receiver, and regression checks in the public repository, and keep the connection parent, internal launcher, and connection integration checks in `mewlink/`, excluded from Git under the existing policy. Applying this requires both updating the local app and redeploying the central frontend; the agent does not build, deploy, or restart. Record specific checks and the unverified scope of the black band in Android Brave direct access in the [Shared UI contract](../development/ui-contracts.md#mobile-editor-and-keyboard).
