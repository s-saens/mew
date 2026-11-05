---
title: "Native Chrome video and localhost app tabs"
description: "Records the replacement of default DOM replay with headed Chrome on a private X11 display and H.264/WebRTC, alongside localhost apps in new authenticated proxy tabs. Separates isolated native-video/input verification and measurements from pending server application and physical-device/network acceptance."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

The user requested responsive remote browsing after testing an experimental screenshot relay: localhost apps should open in new tabs at `{mew-address}/{port}`, while the Browser panel should show real Chrome on a virtual graphical display with remote-desktop-style video.

Localhost link capture now calls the existing direct/Mewlink proxy URL builder and opens a new tab synchronously with `noopener,noreferrer`. Paths, queries, and fragments survive; app processes are not started or stopped. The existing authenticated sandbox and port restrictions remain. Browser dock defaults to native Chrome at `about:blank`; the explicit localhost menu still opens the port picker. The [port-preview contract](../development/port-preview.md) owns these routing and proxy details.

The default panel now uses the [native browser desktop](../development/browser-desktop.md). It reuses the existing private Xvfb and XTest lifecycle from the login screen, with a separate persistent account profile and ordinary headed Chrome's native toolbar and tabs. FFmpeg encodes low-delay CPU H.264, and the existing native desktop RTP/WebRTC transport carries video and input. It does not use screenshot polling, rrweb, Playwright, or CDP for the host Browser. Playwright Chromium remains the UI automation runtime. The login screen retains its registered provider URLs, separate profile, existing JPEG protocol, and shorter lifetime.

The implementation adds bounded Annex B parsing, capture backpressure, negotiated dimensions/FPS, decoder feedback, real IDR recovery, reliable/unreliable input channels, Origin/account/feature enforcement (both desktop and localhost-app capabilities for native Chrome), reconnect grace, and owned-process cleanup. [ADR 0146](../decisions/0146-native-browser-video-and-local-app-tabs.md) records the policy change; [the prior DOM contract](../history/dom-browser-purpose-routing.md) is preserved as history.

## Verification

The native integration uses only test-owned HTTP fixtures, Xvfb displays, profiles, Chrome processes, FFmpeg encoders, and WebRTC peers. It does not operate a real CAPTCHA or provider login. ICE servers and automatic NAT are disabled in the isolated fixture; production reads the existing desktop ICE/NAT configuration.

Checks cover the following:

- Protocol size/type bounds, target restrictions including exact `about:blank`, ownership, missing/foreign Origin rejection, permissions, and live revocation.
- Actual headed Chrome → X11 → FFmpeg H.264 → native WebRTC → browser video decoding, with no binary image frames on signaling.
- Native pointer input and Korean clipboard paste, resize without losing the document, reconnect retaining the same Chrome/page, and explicit closure retaining cookies while cleaning up all four child processes and temporary Xauthority state.
- H.264 access-unit fragmentation, parser memory ceilings, negotiated RTP, channel input, and resize without a new offer.
- Existing native login behavior, profile separation, native toolbar retention, expiry, and process cleanup.
- Real rendered UI fixtures for first-video-frame input gating, coordinates, keyboard and mobile gestures, held-input release, manual reconnect, disposal, and absence of DOM/image replay.
- Desktop/mobile App routing to proxy tabs, path/query/fragment preservation, no viewing-device localhost requests, and revoked permission handling.

The final isolated same-host native integration sample decoded 29 frames over 1.007 seconds and observed 143 ms from native input to changed pixels in the decoded video. These values describe that software-encoding test run only. The configured 60 FPS is a requested ceiling, not a measured guarantee; the sample does not establish phone, Tailscale, LTE/5G, internet, GPU, or gaming-concurrency performance.

Follow-up regressions cover revoked OPEN-viewer cleanup without recursion, replacement during the first SDP negotiation, immediate close/reopen waiting for profile release, and Android-style keys without a hardware code. Localhost-only grants remain unable to launch the native Chrome view. Scheduled and queued keyframe recovery cannot restore an old viewport during resize. Reliable input congestion disconnects instead of dropping a key release.

A real reconnect test exposed a timing-sensitive media-channel/WebSocket close race. Node Inspector breakpoints inspected session identity, Chrome PID, requested URL, and navigation call stacks; the retained process did not navigate on the passing run. The failing order allowed the old channel to report a fatal transport error before its WebSocket detached. Transport failure now closes only that viewer into the existing grace period, while explicit close, runtime failure, and authorization loss keep their cleanup behavior. A deterministic regression checks input release, retained session, and grace expiry. The production-panel integration also checks healthy reconnect and native input after resizing to a 390-pixel viewer, retaining the same document.

Final checks:

- The combined native browser, video transport, lifecycle, production panel, existing login, remote allowlist, and local-link/App routing suite passed **44/44 tests**, with no skips.
- `npm run build` passed TypeScript project checks and the production Vite build. The existing large-chunk warning remains.
- Scoped Oxlint passed with no errors. Existing App warnings and two state-effect warnings in the new panel remain.
- `npm run check:docs` passed description metadata but reported **42 existing unrelated link errors**, including references to removed MOC/decision entrypoints. Changed-document links were checked separately.

No production Mew server, launcher, display service, or deployment was started, stopped, or restarted for this task. Test-owned processes and debugger connections were cleaned up.

## Application boundary and remaining limits

The implementation and isolated checks do not reload a running Mew server. Applying the host changes requires the user's normal restart procedure. Mewlink also needs the updated shared signaling allowlist in its central build; host and central application are separate operations. The browser comparison lab remains a separate experiment and is not the new production Browser.

Linux/WSL ordinary Chrome, Xvfb, Python/X11/XTest, FFmpeg `x11grab`/`libx264`, and the native `node-datachannel` dependency remain prerequisites. Browser executable readiness alone does not establish the media environment. macOS/native Windows implementation and actual GPU encoding were not verified. Physical mobile IME/gestures, external-network ICE/NAT, provider login, and CAPTCHA acceptance remain user/environment checks. HTTPS-only local service compatibility still follows the existing HTTP proxy contract.
