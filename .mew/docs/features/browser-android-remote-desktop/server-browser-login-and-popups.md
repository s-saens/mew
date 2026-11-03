---
id: "mew-remote-browser"
parent: "mew-remote"
title: "Virtual login display and DOM browser"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-03"
files: ["server/dom-browser.ts", "server/dom-browser-ports.ts", "server/dom-browser-port-titles.ts", "server/dom-browser-port-processes.ts", "src/components/DomBrowserPanel.tsx", "src/components/DomBrowserPorts.tsx", "server/login-desktop.ts", "server/port-preview.ts", "server/port-preview-location.ts", "src/components/LoginDesktopViewer.tsx", "src/components/PortPreviewPage.tsx"]
commits: []
description: "Host DOM browsing for localhost apps and external HTTP(S) sites, listening-port discovery with app/process names and port tags, Mew theme synchronization, replay, and connection failures. Distinguishes login video, direct port previews, DNS readiness, and production verification limits."
상위파일: "_browser-android-remote-desktop.md"
---

## Requirements

During login, other users must not steal focus from the host's games or work. OAuth runs in regular Chrome on an independent virtual display sized to the panel, with its video and input connected to the panel. Closing it cleans up the virtual session while preserving completed official CLI authentication.

Click a localhost link or a command menu port button to open the internal Browser panel. A headless host Chromium runs the app at its native address and relays its DOM to an inert viewer on the connecting device. The address bar, Back, Forward, refresh, input, scrolling, and close operate on that host page. The dock opens the same panel on desktop and mobile. Enter an external HTTP(S) address in the panel to browse a website on the host. Live replay uses the viewer's local timeline, and new documents avoid duplicate full-snapshot rebuilds. **Menu → Localhost browser** opens a host-wide listening-port list with refresh and address entry. Rows show the HTML page title or owning process name followed by a numeric port tag; unavailable names use a localized unnamed label. Allowed ports open the same DOM browser; actual Mew ports are labelled and disabled, and reserved ports remain unavailable. Returning through **Open ports** closes the current ephemeral page context. Existing `/port-number` URLs retain their proxy implementation for compatibility.

## Detailed contracts

- [Usage and prerequisites](../../../../docs/guides/browser.md)
- [Virtual login display](../../development/login-desktop.md): Linux/WSL, regular Chrome, account profiles, video, input, and process lifetime
- [localhost app preview](../../development/port-preview.md): HTTP and WS/P2P forwarding, login and port permissions, execution origin, and central configuration
- [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md) · [Localhost DOM restoration decision](../../decisions/0103-localhost-dom-browser.md) · [External-site and live replay decision](../../decisions/0106-dom-browser-external-sites.md)

## Acceptance criteria and verification boundaries

- Localhost document, agent, and terminal links and command port buttons select the Browser panel without opening an external tab or rerunning commands.
- The hamburger entry always shows the port list on desktop and mobile, even from an existing page. Opening the list launches no host browser; selecting an allowed port opens its app. Mew and reserved ports remain disabled, including manual address and redirect guards. Failed scans support retry without claiming no listeners.
- Pages that support automatic dark/light mode follow Mew on initial open, live theme changes, navigation, and reconnect. Host JavaScript and replayed CSS agree, and theme changes preserve the running app state.
- Names precede numeric port tags and truncate within narrow panels. HTML titles take priority over actual process names; Mew keeps its known name, and missing metadata uses a localized unnamed label without guessing a service from its port. Refresh updates names and ports; blocked ports stay disabled even when their process is identified. Optional title/process lookup failures preserve the port list, authentication, live Mew-port guards, and cancellation without launching Chromium.
- Host scripts update the relayed DOM; viewer scripts from the app remain disabled. Native app URLs and host-side API/HMR avoid proxy rewriting.
- Each viewer has an isolated context; check login, Origin, permissions, local and external HTTP(S) navigation, blocked credentials and Mew ports, and cleanup on close/revocation.
- Host clock skew and timestamp gaps do not delay received snapshots or mutations; document navigation emits one full snapshot, and SPA history still refreshes its generation.
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
