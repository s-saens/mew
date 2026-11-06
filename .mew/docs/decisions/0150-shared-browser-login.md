---
title: "0150 — One native browser for login and ordinary browsing"
description: "Unifies login and the internal Browser on BrowserDesktopPanel, the same Chrome H.264/WebRTC runtime, one browser-only account profile, and the configurable nativeBrowser permission. Supersedes the separate JPEG login design and desktop-plus-preview grant while retaining workflow authority and localhost proxy isolation."
created: "2026-11-06"
updated: "2026-11-06"
status: accepted
---

## Context

[ADR 0023](0023-login-desktop-and-port-preview.md) isolated login input through a private X server. Its implementation used a separate JPEG WebSocket viewer and login profile. [ADR 0146](0146-native-browser-video-and-local-app-tabs.md) added Chrome H.264/WebRTC to the Browser but retained that older login path and required both desktop and localhost-app permissions for the general view.

The user requires login and ordinary browsing to use exactly the same component, a browser-only cookie/profile namespace, and one permission configurable in account settings. Keeping two video paths leaves login with different performance, input, and lifecycle behavior. The existing `portPreview` grant should continue to authorize only local app access.

## Decision

Use `BrowserDesktopPanel` for both entry points. `LoginDesktopViewer` is only an embedded wrapper; it owns no decoder, capture, media transport, or input implementation. Both connect to `/api/browser-desktop/ws` and the same `BrowserDesktopSession`, backed by a neutral `NativeBrowserSession` for private Xvfb, Chrome, and XTest lifecycle. Remove the JPEG parser, image ACK loop, dedicated login renderer, and old login WebSocket route.

Use the same `browser-desktop:<account>` profile key for login and general browsing. Cookies and settings persist in that Mew browser-only account profile, separate from other accounts and personal host Chrome. Retain one Chrome runtime and active viewer per account, the common eight-hour ceiling, and 60-second reconnect grace. Do not merge or delete the retired login-only profile automatically.

Add the independent **Browser** (`nativeBrowser`) capability to Account Management. Owner and manager default to allowed; other signed-in accounts require a grant. Both login and ordinary browsing require this feature. Neither `desktop`, `portPreview`, nor an agent/Git job grant implies it. Legacy `browser` overrides continue to migrate only to `portPreview`, preventing old local-app grants from silently gaining host Chrome access. Account guidance identifies browser access as operating with the server OS user's rights.

Keep agent/Git workflow permissions for their own operations, and additionally check browser permission before opening Chrome. A general registered-provider login request needs only browser permission. Shared MCP checks browser access only when OAuth actually needs a browser, preserving stdio and already-authenticated probes. Permission denial remains an explicit failure and does not wait for an unavailable browser callback. Authenticated owners can clean up their pending jobs after browser permission is revoked.

Login jobs own opaque account/URL bindings, not a second browser process. A binding selects its initial URL in the common browser; reconnecting it preserves the page. A normal dock open at `about:blank` reattaches to an existing window. Job completion closes a runtime only while that job still owns the active viewer; a subsequent general viewer or different job remains active. Programmatic navigation uses ordinary Chrome's profile-scoped SingleInstance IPC to open a native tab in the existing process, avoiding address-bar focus, clipboard, and keyboard races.

## Alternatives and consequences

Retaining JPEG only for login violates the common component requirement. Sharing just visual styling leaves separate transport, cookie, and reconnect behavior. Reusing the old localhost or desktop grant conflates independent features and can widen existing local-app access. Merging browser cookies into the old login-only namespace would change the established browser profile and complicate recovery; the current browser namespace remains authoritative.

The browser permission authorizes ordinary Chrome, including local-file and network navigation under the server OS user. A private X display isolates input from the physical desktop; a distinct profile is not an OS sandbox. Local app proxy tabs retain their narrower `portPreview` boundary. The retired DOM compatibility socket also checks browser permission.

Applying server handlers requires the user's normal restart procedure. Mewlink carries both purposes through the existing browser signaling route; direct media retains the same connectivity requirements. Isolated native tests do not establish actual provider login, CAPTCHA, physical-phone input, or external-network performance.

Current contracts: [native Browser](../development/browser-desktop.md), [login jobs](../development/login-desktop.md), [account permissions](../development/access-control.md), and [local app tabs](../development/port-preview.md).
