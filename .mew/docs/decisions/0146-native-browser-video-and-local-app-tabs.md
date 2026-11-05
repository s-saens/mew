---
title: "0146 — Native Chrome video and separate localhost app tabs"
description: "Chooses headed Chrome on a private Linux/WSL display with low-delay H.264 WebRTC for the Browser panel, and separate authenticated /port tabs for localhost apps. Partially supersedes ADR 0137's interactive DOM-browser purpose split while preserving Playwright automation and the independent login display."
created: "2026-11-05"
updated: "2026-11-05"
status: accepted
---

## Context

[ADR 0137](0137-browser-purpose-routing.md) selected ordinary Chrome for external DOM pages and Playwright Chromium for loopback DOM pages. Both interactive routes reconstructed documents through rrweb. This retained limitations around nested frames, canvas, native browser controls, and arbitrary external sites. The separate six-engine browser experiment used repeated screenshots; its capture and full-frame transmission overhead made that viewer unsuitable as the basis for a responsive production browser.

The user requests two paths: localhost apps should open a separate tab through `{mew-address}/{port}`, and the internal Browser should show an actual Chrome window on a virtual display using remote-desktop-style video and input.

## Decision

Use the existing authenticated direct/Mewlink port preview for localhost app links and command-port actions. Open a new tab with the app path, query, and fragment preserved. Retain the preview proxy's port restrictions, authentication, sandboxing or separate-origin isolation, and existing compatibility limits. App execution takes place on the viewing device through that proxy.

Replace the active interactive DOM Browser panel with ordinary headed Google Chrome on a private Xvfb display. Retain Chrome's native toolbar and controls and begin at exactly `about:blank`. Capture only that virtual display, encode with FFmpeg CPU `libx264` baseline at a requested maximum of 60 FPS, and reuse the native remote-desktop H.264 WebRTC transport and input channels. Parse complete access units, apply bounded frame queues and backpressure, and restart the encoder for a real recovery IDR. Let the viewer's H.264 answer bound the actual panel dimensions and FPS.

Require both `portPreview` and the existing OS-level `desktop` capability for native Chrome, because its real address bar can open local files. Localhost app tabs continue to require only `portPreview`. Retain account ownership, Origin checks, revocation, and owned-process cleanup. Use one active viewer per account, an eight-hour session ceiling, a 60-second disconnect grace, and a persistent Chrome profile namespace separate from the existing login display. Use the existing desktop ICE and automatic NAT configuration; do not add a TURN relay or a WebCodecs requirement.

This decision partially supersedes ADR 0137 **only for interactive Browser UI routing and transport**. It removes interactive URL-based Chrome/Chromium switching and DOM replay from the active panel. The existing login display remains independent, and Playwright automation keeps managed Chromium and its current executable selection. Existing DOM-browser code and legacy proxy contracts need not be deleted to make the new panel authoritative.

## Alternatives and rationale

| Alternative | Reason for the choice |
| --- | --- |
| Continue DOM replay for external sites | Reconstruction cannot preserve every nested frame, canvas, native dialog, or browser control. Native pixels preserve the actual Chrome surface. |
| Repeated PNG/JPEG screenshots | Complete still-image captures add polling, encoding, and network overhead. Encoded video shares inter-frame information and uses the viewer's native media decoder. |
| Put localhost apps inside the native Chrome video panel | A direct app tab preserves normal client-side rendering and interaction without adding remote capture and input latency. |
| Use WebCodecs with a custom transport | It adds a decoder/transport path and secure-context dependency; native WebRTC already provides H.264 negotiation, feedback, RTP pacing, and data channels. |
| Share the login display's profile and lifetime | Login jobs and general browsing have different state and lifetime needs. A separate namespace preserves their existing boundary. |

## Consequences

Interactive browsing now depends on Linux/WSL X11 and media prerequisites in addition to ordinary Chrome. CPU encoding consumes host resources, and negotiation may reduce resolution or frame rate. Reusing the desktop transport avoids a separate media stack but retains its direct-connectivity and UDP requirements. A 60 FPS request is a ceiling, not a latency or throughput guarantee.

The Mew navigation guard rejects Mew-submitted targets on Mew ports. It does not firewall the ordinary Chrome window: a permitted user can navigate through native Chrome controls. The additional desktop permission therefore matches host-side browser access instead of widening a localhost-only grant. Local app tabs continue to use the proxy's narrower port capability and origin boundaries.

Host server changes require a user-owned restart, and remote use requires the central Mewlink signaling allowlist update. Builds and isolated tests do not apply those operational changes or establish physical-phone, external-network, CAPTCHA, or provider-login acceptance.

The current implementation contract is [Native Chrome browser desktop](../development/browser-desktop.md). Existing owners remain [port preview](../development/port-preview.md), [login desktop](../development/login-desktop.md), [browser dependencies](../development/browser-dependencies.md), and [UI automation](../development/browser-testing.md).
