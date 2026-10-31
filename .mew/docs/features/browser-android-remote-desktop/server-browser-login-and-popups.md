---
id: "mew-remote-browser"
parent: "mew-remote"
title: "Virtual login display and localhost app access"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-31"
files: ["server/dom-browser.ts", "src/components/DomBrowserPanel.tsx", "server/login-desktop.ts", "server/port-preview.ts", "server/port-preview-location.ts", "src/components/LoginDesktopViewer.tsx", "src/components/PortPreviewPage.tsx"]
commits: []
description: "Defines the restored localhost DOM browser, link and command-port entry, isolated host execution and replay, alongside independent login video and retained /port-number previews. Includes forwarding inline and multiline modules in direct previews, virtual paths for standard SPAs, remote initialization failures, DNS readiness, and production verification boundaries."
상위파일: "_browser-android-remote-desktop.md"
---

## Requirements

During login, other users must not steal focus from the host's games or work. OAuth runs in regular Chrome on an independent virtual display sized to the panel, with its video and input connected to the panel. Closing it cleans up the virtual session while preserving completed official CLI authentication.

Click a localhost link or a command menu port button to open the internal Browser panel. A headless host Chromium runs the app at its native address and relays its DOM to an inert viewer on the connecting device. The address bar, Back, Forward, refresh, input, scrolling, and close operate on that host page. The dock opens the same panel on desktop and mobile. Existing `/port-number` URLs retain their proxy implementation for compatibility.

## Detailed contracts

- [Usage and prerequisites](../../../../docs/guides/browser.md)
- [Virtual login display](../../development/login-desktop.md): Linux/WSL, regular Chrome, account profiles, video, input, and process lifetime
- [localhost app preview](../../development/port-preview.md): HTTP and WS/P2P forwarding, login and port permissions, execution origin, and central configuration
- [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md) · [Localhost DOM restoration decision](../../decisions/0103-localhost-dom-browser.md)

## Acceptance criteria and verification boundaries

- Localhost document, agent, and terminal links and command port buttons select the Browser panel without opening an external tab or rerunning commands.
- Host scripts update the relayed DOM; viewer scripts from the app remain disabled. Native app URLs and host-side API/HMR avoid proxy rewriting.
- Each viewer has an isolated context; check login, Origin, permissions, loopback navigation, blocked Mew ports, and cleanup on close/revocation.
- Browser docking, responsive layout, mobile foreground selection, address input, manual reconnection, and repeated entry requests follow the shared workspace controls.

- Login video, clicks, keys, paste, and popups operate on the same dedicated X server.
- Clean up keys, buttons, and owned child processes on close, reconnect, cancellation during startup, and permission revocation.
- Unauthenticated access to `/3333` returns to the original app after authentication, and guests, other accounts, other ports, and Mew's own port cannot bypass restrictions.
- Forward frontend root assets, API requests, POST requests, and WebSocket/HMR without giving the app Mew cookies or full API permissions.
- Direct previews forward Vite inline initialization, multiline imports, and dynamic imports with fixed strings within the same port, preserving comments, strings, and JSON data.
- Standard SPAs in direct previews read the initial root and subpaths without a separate basename and preserve history, hash, Back, Forward, and refresh behavior. Local variables, constructor calls, DOM identity, and per-port isolation are also preserved.
- Remote previews wait for Service Worker initialization to complete. On a failure notification or the 15-second timeout, they display an error and clean up issued sessions, requests, and sockets. Actual wildcard DNS and HTTPS readiness and syntax transformation compatibility limits follow the [preview contract](../../development/port-preview.md).
- Distinguish isolated automated checks from verification of actual OAuth, concurrent gaming, production domains, Tailscale, and Mewlink over external networks. The user applies changes to production.

2026-10-27: 13 related checks passed, covering Vite-style modules and HTTP/WS through a direct HTTPS tunnel, remote initialization failures, permissions, and resource cleanup. `ENOTFOUND` was confirmed for public preview DNS, but no DNS changes, central deployment, or host application were performed. Reproduction steps and limitations are recorded in the [work record](../../work/command-port-previews.md#2026-10-27--port-connection-failure-reproduction-and-fix).

2026-10-28: Improved standard SPA path handling in direct previews. Along's login and sign-up screens were checked through an isolated proxy targeting the running app; application to production Mew and login submission were not verified. See the [decision](../../decisions/0083-direct-preview-spa-routing.md) and [work record](../../work/command-port-previews.md#2026-10-28--fix-spa-initial-paths-in-direct-previews).
