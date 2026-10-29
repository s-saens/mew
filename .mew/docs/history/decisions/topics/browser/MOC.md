---
title: "Mew ADR — Server Browser, Android, and Remote Desktop"
created: 2026-09-11
updated: 2026-09-23
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0188 — Resident native H.264 host for Mac/Linux](../../0188-mew-posix-native-desktop.md)

- [0187 — In-house Windows virtual display and headless GPU capture](../../0187-mew-independent-virtual-display.md)

- [0185 — Resident native remote host and direct connection](../../0185-mew-desktop-resident-direct-host.md)

- [0169 — Velocity joysticks for wheel, panning, and zooming](../../0169-mew-desktop-view-velocity-controls.md)

- [0163 — Dedicated virtual display for the Linux server browser](../../0163-mew-browser-virtual-display.md)

- [0154 — Remote controls based on touchpad movement deltas](../../0154-mew-desktop-touchpad-motion.md)
- [0148 — macOS ScreenCaptureKit and local cursor](../../0148-mew-macos-local-cursor.md)
- [0146 — Windows separate cursor capture fallback](../../0146-mew-desktop-cursor-capture-fallback.md)
- [0145 — Mouse-shaped joystick and immediate dragging](../../0145-mew-desktop-mouse-controls.md)
- [0144 — Separate remote cursor and screen updates](../../0144-mew-desktop-local-cursor.md)
- [0139 — Remote desktop server transport without external services](../../0139-mew-desktop-server-transport.md)
- [0138 — Automatic remote desktop preparation and execution in the Windows login session](../../0138-mew-desktop-automatic-preparation.md)
- [0137 — Windows remote desktop named pipe bridge](../../0137-mew-windows-desktop-pipe-bridge.md)
- [0136 — OS-specific remote desktops and WebRTC](../../0136-mew-native-remote-desktop-webrtc.md)
- [0129 — Launch a regular browser directly and connect via CDP](../../0129-mew-browser-native-launch-cdp.md)
- [0128 — Integrate all browser-based OAuth into the internal browser](../../0128-mew-browser-oauth-uses-internal-browser.md)
- [0127 — Server Chromium and DOM relay for the entire browser](../../0127-mew-browser-server-dom-runtime.md) — DOM execution and profile boundaries; OAuth and launch connections are in 0128 and 0129
- [0126 — Codex login DOM relay pilot](../../0126-mew-codex-auth-dom-remoting-pilot.md) — Limited validation helper and experimental limitations; general OAuth is in 0128
- [0067 — Android guided commands use user-operated one-shot tmux](../../0067-mew-android-guided-tmux-actions.md)
- [0058 — The Android window is an optional gateway](../../0058-mew-android-panel-optional-gateway.md) — External emulator and gateway; user-guided commands are in 0067
- [0057 — Loopback browser restricted to manager and owner](../../0057-mew-localhost-browser-panel.md) — /<port> and Android compatibility proxy; general Browser is in 0127

- [0189 — External remote desktop direct connection preparation and temporary NAT lifetime](../../0189-mew-desktop-external-direct-connectivity.md)
