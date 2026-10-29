---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Remote desktop uses an OS helper process and WebRTC. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0136 — Remote desktop uses an OS helper process and WebRTC"
created: 2026-09-12
updated: 2026-09-16
---

- Date: 2026-09-12
- Status: Adopted
- Follow-up decision: [0154](0154-mew-desktop-touchpad-motion.md) — changes mobile control input from velocity to touchpad movement deltas
- Follow-up decision: [0148](0148-mew-macos-local-cursor.md) — macOS ScreenCaptureKit capture and automatic preparation of the custom native module
- Follow-up decision: [0145](0145-mew-desktop-mouse-controls.md) — mouse-shaped layout, cursor-only joystick, and immediate left/right dragging
- Follow-up decision: [0144](0144-mew-desktop-local-cursor.md) — Windows DXGI capture and cursor separation; retain existing OS permissions, input, and lifetimes
- Follow-up decision: [0139](0139-mew-desktop-server-transport.md) — relay VP8 video and input over an authenticated Mew WebSocket when a direct connection fails; retain OS, permission, and input lifetimes
- Follow-up decision: [0137](0137-mew-windows-desktop-pipe-bridge.md) — connect Windows Electron parent communication through Node stdio and an authenticated local named pipe; retain contracts for other OSes and WebRTC
- Decision makers: User (requested full-screen remote desktop, OS-specific screens, ultra-low latency, and mobile joysticks), Codex (implementation design)

## Decision

- Remote desktop is a full-screen overlay outside the task panel. It is separate from the internal DOM browser, and ADR 0127's prohibition on streaming video from the internal browser remains in effect.
- Mac and Linux use a separate Electron helper process running in the corresponding logged-in desktop; WSL uses one running on Windows. Do not treat the WSLg screen as the Windows desktop. Run the helper process only while the remote desktop connection is active.
- Use Electron/Chromium OS screen capture and the WebRTC encoder. Transmit the screen over DTLS/SRTP with inter-frame compression and congestion control. Use a direct connection by default and operator-specified STUN/TURN when the network requires it. Do not assume an HTTPS tunnel alone provides a WebRTC path. Do not implement JPEG polling or a video WebSocket fallback.
- Use separate DataChannels for input. Recover lost movement using cumulative coordinates on a channel without retransmission, and send button, key, and release events over an ordered channel. Process button transitions together with a movement snapshot. Release held inputs on interruption, backgrounding, disconnection, or input idle timeout. Handle zoom, view panning, and control positions locally on the device.
- Separate input adapters into macOS CoreGraphics, Windows SendInput, and Linux X11 XTest or the Wayland RemoteDesktop portal. Do not bypass OS screen-sharing or accessibility consent. Do not claim support for controlling pre-login screens, the Windows UAC secure desktop, or OS lock screens.
- Mew permits connections with manager/owner cookie authentication and an exact Origin match. Because the actual OS desktop is not a per-account virtual screen, allow only one control connection across the entire server. Recheck permissions during the connection, and terminate the helper process and P2P connection if signaling or the parent process disconnects.
- The helper process and Mew communicate through parent-owned stdin/stdout. Do not create a separate public control port or command execution API. Accept OS executable paths and ICE settings only from server configuration. Do not write screen content, keystrokes, signaling, or TURN passwords to disk or logs.
- Mobile controls provide five small joysticks for left click, wheel, right click, view panning, and zoom, followed by a repositioning handle, all in one row. A short tap clicks, immediate movement moves or scrolls, and movement after a long press drags with a button held. Normal wheel operation and zoom use only the vertical axis. Separate the small visual radius from the high speed gain.

Implementation, installation, and verification boundaries are documented in [Remote desktop](../../development/remote-desktop.md).

## Rationale

Share Chromium's already validated capture, codecs, and congestion control, limiting platform differences to execution, input, and permissions. Link the modal lifecycle to the native process lifecycle so control is not left active. Direct video transmission and local view manipulation reduce app server load, unnecessary re-encoding, and round-trip latency.

Official contracts: [Electron screen capture](https://www.electronjs.org/docs/latest/api/desktop-capturer), [Windows SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput), [Wayland RemoteDesktop portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html).
