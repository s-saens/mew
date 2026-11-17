---
title: "Browser connection and media isolation"
description: "Records viewer STUN candidate gathering and video extension isolation, local checks, and remaining remote connection and latency limits."
created: "2026-11-17"
updated: "2026-11-17"
---

## Purpose and result

Improve direct Browser connection candidates for viewers behind NAT and hide the display from ordinary page-wide video extension scans. The [Browser contract](../development/browser-desktop.md) defines viewer ICE, media, permissions, and limitations.

## Verification

- `node --test server/rtc-config-viewer.test.ts src/utils/browser-desktop-peer.test.ts server/browser-desktop-panel.test.ts src/components/browser-desktop-panel.browser.test.ts src/components/login-desktop-viewer.browser.test.ts`: seven tests passed, including real local Chrome video, input, reconnect, and media scan isolation.
- `npm run lint` passed with warnings. `npm run check:docs` validated 854 descriptions and reported 39 existing missing or invalid links.
- `npm run build` passed, including TypeScript; Vite reported large-chunk warnings.

## Remaining limits

The reported desktop network and actual extension have not been reproduced. TURN is not available, so some networks still cannot connect. Local isolated measurement found 22 decoded frames per second and 124 ms from click to changed video pixel in one sample; it does not establish remote latency or an improvement. Capture, encoding, transport, and decoding were not separately measured. No server lifecycle operation or deployment was performed.
