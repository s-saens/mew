---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: All Mew browser functionality uses server Chromium and DOM relay. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0127 — All Mew browser functionality uses server Chromium and DOM relay"
created: 2026-09-09
updated: 2026-09-11
---

- Date: 2026-09-09
- Status: Adopted
- Follow-up decision: [0150](0150-mew-account-feature-and-file-permissions.md) — replace fixed role gates with per-account feature permissions
- Subsequent decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Run only Codex in a separate restricted context
- Subsequent decision: [0129](0129-mew-browser-native-launch-cdp.md) — Launch Chromium with a regular profile and connect via CDP
- Partially supersedes: [0126](0126-mew-codex-auth-dom-remoting-pilot.md) — Expand the scope from Codex only to the general Browser panel
- Partially supersedes: [0109](0109-mew-agent-authentication-and-loopback-browser.md) — The general Browser panel's restriction to loopback targets and prohibition on retrying with a remote browser
- Partially supersedes: [0108](0108-mew-server-fetch-device-render-browser-proxy.md) — The general Browser panel's server-fetch, device-execution approach. Do not reintroduce a general-purpose HTML rewriting proxy.
- Decision makers: Song Sanghoon (explicitly directed that all browser functionality use the server browser as its execution actor), Codex (implementation)

## Background

The user's request is for the full Mew built-in browser feature, rather than a Codex login fix. The browser
must actually run on the server, but transmitting screen pixels or video is
prohibited. Site scripts, networking, cookies, and tab relationships must reside in server Chromium, while Mew connects DOM display and user input.

## Decision

- Both the general Browser panel and the standalone `/browser` screen use the server DOM browser. They open public HTTP(S) sites, server loopback addresses, and private networks accessible from the server.
- Keep the roles limited to manager and owner. This provides the same network access scope as the server shell. Separate the execution contexts of page code and the Mew origin.
- Regular tabs share a dedicated Chromium profile per Mew account. Chromium manages cookies, localStorage, IndexedDB, and similar data, and the profile remains in the Mew data folder. Do not use existing personal Chrome profiles.
- Address entry, history, reload, stop, and tab close operate on the actual server page. Keep site-opened popups as actual Pages in the same profile and display them as Mew tabs.
- Transmit DOM changes incrementally and run the original JavaScript only on the server. For each tab and subframe, determine input targets using server node IDs and navigation generations.
- Connect confirmation and input dialogs, device file uploads, and server downloads through the Mew UI. Bind files to the relevant account and actual file chooser or download, and do not accept arbitrary server paths.
- WebSockets and service workers operate in the general server browser. Codex-specific authentication jobs retain the existing disposable, host-restricted context.
- Close the profile once all tabs are cleaned up. Keep disconnected regular tabs during a grace period, and reconnect to the same server tab when the browser window is reopened. Do not leave unused server browsers running indefinitely.
- Maintain the existing `/<port>` and Android loopback compatibility proxies separately. Do not fall back to these paths from the general Browser panel.

## Support boundaries

The fact that websites run on the server differs from claiming that every web surface is reproduced identically. Full
reproduction is not guaranteed for surfaces not represented by the DOM, such as Canvas/WebGL, DRM, OS device authentication, and cameras. Unsupported
surfaces are neither hidden nor automatically replaced with screen capture. Tests verify ordinary site flows, forms, tabs, frames, and actual server state.

References: [Chromium persistent profiles](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [browser Frame](https://playwright.dev/docs/api/class-frame).

The current functionality has been replaced with a standalone login video screen and localhost app access under [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md). This document is preserved as the rationale for the previous decision.
