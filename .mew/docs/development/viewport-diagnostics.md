---
title: "Mobile Viewport Diagnostics"
description: "Defines the optional viewport-debug URL option for investigating fullscreen and OS keyboard horizontal bands on physical devices using direct access, local diagnostic copying and file saving, collected and excluded data, and validation limitations."
created: 2026-10-22
updated: 2026-10-22
---

# Mobile Viewport Diagnostics

The horizontal band in Android Brave recurred even after correcting the fullscreen/keyboard transition sequence. The cause remains undetermined. These diagnostics collect data to compare the band's coordinates in photos with actual DOM and keyboard boundaries, without changing screen layout or keyboard policy.

## Usage

After applying this change to the local app, open the direct-access address with `?viewport-debug=1` appended. If it already has a query string, append `&viewport-debug=1`. Without the option, the diagnostic module and button are not installed. Forwarding the option from the outer Mewlink address to the inner app is not supported.

While the issue is reproduced, press the **Copy Viewport Diagnostics** icon at the upper right. The default pointerdown behavior is prevented to avoid moving input focus, and measurements are read before the clipboard request. If copying is blocked, the same data is downloaded as `mew-viewport-diagnostics.json`. Send the copied JSON or file to the person responsible for diagnostics. There is no automatic server transmission or storage recording.

## Collection scope

| Item | Scope |
| --- | --- |
| Environment | Browser User-Agent, screen size and orientation, DPR, safe area |
| Viewport | Layout and visual viewports, fullscreen status, measured root bounds, app height CSS variable |
| Keyboard | API availability, overlay policy, boundingRect |
| Events | The most recent 80 resize, visual scroll, focus, fullscreen, keyboard geometry, and root size changes since startup |
| DOM | Tags, measured bounds, background colors, and layout styles of the root, workspace, input field, and hit targets measured at three horizontal positions on the screen |
| Sampling | Spacing of at least 4px depending on screen height, up to 240 vertical rows and 3 elements per point |

Conversations, documents, input values, selected text, URLs, DOM IDs, classes, file paths, and arbitrary HTML attribute values are not collected. Background images and filters are recorded only as present or absent, rather than by their original values. Element numbers in the report are temporary identifiers used only within the data.

DOM hit tests and computed styles do not measure actual on-screen pixel colors. They provide evidence for comparing DOM elements and backgrounds with the photo at the band location; the results alone do not establish a browser or OS compositing issue. If a fullscreen child element is in the top layer or the user has zoomed or panned, also compare the reported scale and offsets.

## Implementation and verification

`src/main.tsx` checks the URL options and lazy-loads `src/utils/viewport-diagnostics.ts`. On shutdown or HMR replacement, it cleans up events, ResizeObserver, language subscriptions, buttons, and status timers. Diagnostic DOM measurements and event history are kept only in memory.

`server/viewport-diagnostics-ui.test.ts` checks focus retention on 390px touch and 1100px screens, the read-only keyboard policy, sample matching of DOM band coordinates, exclusion of sensitive test strings, event limits, file saving when clipboard access is blocked, and stopping observation. These tests neither reproduce nor resolve the Android OS black band.
