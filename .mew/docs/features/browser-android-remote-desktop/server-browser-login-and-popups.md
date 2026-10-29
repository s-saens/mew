---
id: "mew-remote-browser"
parent: "mew-remote"
title: "Virtual login display and localhost app access"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
files: ["server/login-desktop.ts", "server/port-preview.ts", "server/port-preview-location.ts", "src/components/LoginDesktopViewer.tsx", "src/components/PortPreviewPage.tsx"]
commits: []
description: "Defines requirements, support scope, and acceptance criteria for independent login video and input sessions and authenticated development app access through /port-number. Includes forwarding inline and multiline modules in direct previews, virtual paths for standard SPAs, remote initialization failures, DNS readiness, and production verification boundaries."
상위파일: "_browser-android-remote-desktop.md"
---

## Requirements

During login, other users must not steal focus from the host's games or work. OAuth runs in regular Chrome on an independent virtual display sized to the panel, with its video and input connected to the panel. Closing it cleans up the virtual session while preserving completed official CLI authentication.

Open development apps through `/포트번호` appended to the domain, Tailscale, or Mewlink access address. After verifying Mew login and per-account permissions, run the host's corresponding localhost app on the connecting device. General internal browser menus, panels, address bars, shortcuts, and DOM relaying are not provided.

## Detailed contracts

- [Usage and prerequisites](../../../../docs/guides/browser.md)
- [Virtual login display](../../development/login-desktop.md): Linux/WSL, regular Chrome, account profiles, video, input, and process lifetime
- [localhost app preview](../../development/port-preview.md): HTTP and WS/P2P forwarding, login and port permissions, execution origin, and central configuration
- [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md)

## Acceptance criteria and verification boundaries

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
