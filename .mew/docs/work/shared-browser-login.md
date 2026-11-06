---
title: "Shared browser for login and ordinary browsing"
description: "Records the removal of the separate JPEG login viewer, the common browser component and account profile, the configurable Browser permission, native navigation regression checks, and the boundary between local verification and server application."
created: "2026-11-06"
updated: "2026-11-06"
---

## Purpose and behavior

Login previously used a separate JPEG viewer despite the internal Browser using Chrome H.264/WebRTC. Both now render through `BrowserDesktopPanel` and the same account's `BrowserDesktopSession`. The login wrapper supplies only its job stream and readiness callbacks. The old image decoder, frame acknowledgements, and JPEG WebSocket attachment are removed.

Login and ordinary browsing share one persistent browser-only account profile. They use one active viewer and Chrome process, with job bindings selecting login URLs rather than creating separate runtimes. Completion of an old login job cannot close a later general viewer or different login job. The retired login-only profile is preserved without merging cookies. The [browser contract](../development/browser-desktop.md) and [login contract](../development/login-desktop.md) own current behavior.

Account Management now exposes an independent **Browser** (`nativeBrowser`) permission for both entry points. It does not require or imply remote desktop or localhost app permission. Existing agent and Git workflow checks remain; browser opening adds the same Browser check. Shared MCP checks it only when OAuth actually needs Chrome. [ADR 0150](../decisions/0150-shared-browser-login.md) records the architecture and migration; the [account contract](../development/access-control.md) owns defaults and revocation.

## Verification

Native tests use isolated HTTP fixtures, profiles, Xvfb displays, ordinary Chrome, FFmpeg, and WebRTC peers. They check decoded H.264 rather than signaling-only success, native input and resize, one process/profile across login and general viewing, persistent cookies after explicit reopening, login URL ownership, and stale-job cleanup. Permission regressions cover standalone grants, unrelated grants, live revocation, HTTP workflow entry, the retired DOM compatibility socket, and shared MCP denial without waiting for an unavailable callback. Rendered UI tests check the shared component, readiness, reconnect, disposal, and localhost tabs.

Concurrent native tests exposed an address-bar navigation race: injected input could reach Chrome before its address field was ready, losing part of the URL. Node Inspector and a test-owned native screenshot distinguished correct server URL selection from incorrect native input. Programmatic navigation now uses Chrome's profile-scoped SingleInstance IPC to open a native tab in the existing process, with serialized requests and viewer ownership checks. Regression URLs include mixed case, encoded Unicode, punctuation, and active Caps Lock. Temporary debugging instrumentation and connections were removed.

Final checks:

- The relevant browser, login, native runtime/video, workflow permissions, shared MCP, remote allowlist, and rendered UI suite passed **95/95**, with no skips, using `node --test --test-concurrency=4` across 24 files. The production-panel test also passed independently.
- `npm run build` passed TypeScript checks and the production Vite build. The existing large-chunk warning remains.
- Scoped Oxlint reported no errors. Existing App/AgentPanel/i18n warnings and two panel state-effect warnings remain.
- `npm run check:docs` passed description metadata but reported **39 unrelated existing link errors**. Changed-document links were checked separately with zero errors.

An unrestricted parallel run passed the login/profile IPC regression but timed out once while reconnecting the production panel. Bounded concurrency and an independent panel rerun passed; the unrestricted-load timeout's cause was not established. A separate synthetic native peer fixture had reentrant signaling and premature candidate delivery; its test now queues signaling and fences teardown like the asynchronous production signaling path. No production video-transport change was made for that fixture failure.

## Application and limits

No production server, launcher, or display service was operated. Applying the server changes requires the user's normal restart procedure; a successful UI build does not reload server handlers. Native Linux/WSL dependencies and direct WebRTC connectivity remain required.

These local checks do not establish real Google/provider authentication, CAPTCHA acceptance, physical-phone input, Tailscale/internet latency, or sustained frame rate. Browser profile separation is not an OS sandbox: Browser permission authorizes ordinary Chrome under the server OS user's file and network rights.
