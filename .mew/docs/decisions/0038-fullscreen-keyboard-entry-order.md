---
title: "0038 — Preparing the keyboard policy before entering fullscreen"
description: "In response to reports of a black band depending on the order of fullscreen and keyboard transitions in Android Brave direct access, prepare the overlay policy immediately before the request and define retention while pending and restoration on failure. The horizontal band recurred in user testing on a physical device, so further investigation uses screen diagnostics."
created: 2026-10-22
updated: 2026-10-22
---

# 0038 — Preparing the keyboard policy before entering fullscreen

Status: Approved

## Background

A user reported that opening the keyboard in fullscreen during direct access produces a black horizontal band that disappears when the keyboard closes. It does not occur in the normal view, and entering fullscreen with the keyboard open prevents it from occurring when the keyboard is opened again later. The existing implementation changed the keyboard overlay policy in the frame after `fullscreenchange`.

The [Chromium Android implementation](https://github.com/chromium/chromium/blob/main/chrome/android/java/src/org/chromium/chrome/browser/fullscreen/FullscreenHtmlApiHandlerBase.java) changes native layout flags in a separate step during fullscreen entry and documents how this process relates to layout and screen updates when the keyboard appears. The user's results support the hypothesis of an initialization issue dependent on transition order, but do not establish the exact native cause or a causal relationship with app policy changes.

## Decision

- The top-level touch page prepares the keyboard overlay policy through the shared `requestFullscreenWithKeyboard` immediately before requesting native fullscreen. Make the request within the same user gesture, without a separate `await` or frame wait.
- While the request is pending, the viewport observer also retains the prepared policy. Protect overlapping requests until the last request finishes, and restore the original policy if fullscreen entry fails.
- Route entry through the header, keyboard shortcuts, Mewpet guidance, remote desktop, and PDF through shared handling. Retain each screen's fullscreen target, options, and error handling, and the PDF modal fallback behavior.
- Retain native requests in iframes, mouse environments, and environments without API support. Follow [0034](0034-mewlink-keyboard-host.md) for the Mewlink top-level policy and geometry forwarding, and [0011](0011-fullscreen-keyboard-geometry.md) for keyboard geometry calculation and restoration on release.

## Impact and validation scope

In user testing on a physical device on 2026-10-22, the same horizontal band recurred even after this adjustment. The ordering adjustment in this decision has not been verified to resolve the black band; instead of further speculative adjustments, collect physical-device data through [Mobile screen diagnostics](../development/viewport-diagnostics.md).

Apply this adjustment by updating the local app for direct access; no central Mewlink deployment is required. The agent does not build or restart the server.

Regression checks cover the order of policy setting and native requests, retention while pending and restoration on failure, entry with the keyboard open and reopening it, and existing screen boundaries. Automated checks did not reproduce the OS keyboard's black band, so physical-device verification on the affected Brave device remains pending. Keep the detailed check scope in the [Shared UI contract](../development/ui-contracts.md#mobile-editor-and-keyboard).
