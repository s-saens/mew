---
title: "Separate the Virtual Login Desktop from localhost App Access"
description: "Decision to remove the internal DOM browser, provide OAuth through video and input on an independent Linux virtual desktop, and provide development apps through authenticated localhost HTTP and WebSocket previews. Distinguishes execution origins and deployment conditions for direct addresses and Mewlink."
created: "2026-10-20"
updated: "2026-10-20"
---

## Status

Adopted. To apply this to production, the user must apply both the local changes and the Mewlink central changes.

## Background

Page reconstruction and input relaying in the internal DOM browser introduced many compatibility variables for OAuth and web apps. When another user uses the browser while someone is gaming on the host, they must not share focus, cursor, or keyboard. Viewing a development frontend should not require launching a browser on the host either.

## Decision

Remove the general internal browser panel, address bar, standalone `/browser` screen, and DOM recording and replay paths. For login, use a dedicated X server per account, window management and XTest input, regular Chrome, and video streaming. Do not inject a DOM recorder into pages or connect CDP. The virtual desktop separates input from the physical desktop while retaining dedicated per-account profiles.

Open development apps through `/<port>` or `mew.run/<user>/<device>/<port>`. After checking login and `portPreview` permissions on the host, forward only the corresponding loopback HTTP port. The app's JavaScript runs on the connecting device. Direct access uses an authenticated HTTP and WebSocket-compatible proxy; Mewlink uses a port-scoped P2P bridge.

Do not use paths as security boundaries. Run proxy documents for direct access in an opaque sandbox, and run Mewlink previews on a separate preview origin for each session. Do not give apps Mew sessions or full API transport permissions. Revalidate HTTP and open sockets on logout or permission revocation.

## Rationale and Impact

Simply adding a virtual monitor to the same login desktop does not isolate input. An independent X server on Linux/WSL can own both virtual input and the display. Existing WebRTC transport can be reused, but the user flow does not mandate a specific transport technology.

This decision supersedes the current feature scope of the previous [DOM Browser](../history/decisions/0127-mew-browser-server-dom-runtime.md), [Internal OAuth](../history/decisions/0128-mew-browser-oauth-uses-internal-browser.md), and [Direct Execution and CDP](../history/decisions/0129-mew-browser-native-launch-cdp.md) decisions. Historical successful login records are preserved as evidence from those experiments. The DAP debugger, external analysis file import, and Android environment checks remain unchanged.

The virtual login desktop currently supports Linux/WSL hosts. Native sessions providing the same input isolation on Windows and macOS are not yet implemented. Actual Google and Antigravity authentication, performance while gaming concurrently, and external network access are verified in the user's environment separately from isolated automated checks.

The current implementation contract follows [Virtual Login Desktop](../development/login-desktop.md) and [localhost App Preview](../development/port-preview.md); operating instructions follow [Usage](../../../docs/guides/browser.md).
