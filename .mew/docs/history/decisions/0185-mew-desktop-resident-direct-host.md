---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: transition remote desktop to a resident native host and direct transport. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0185 — Transition remote desktop to a resident native host and direct transport"
created: 2026-10-01
updated: 2026-10-01
---

- Date: 2026-10-01
- Status: Adopted
- Partially supersedes: [0138](0138-mew-desktop-automatic-preparation.md) — The lifecycle that launches Electron for every Windows/WSL connection
- Partially supersedes: [0139](0139-mew-desktop-server-transport.md) — Server video relay, fixed VP8, and empty default ICE configuration
- Decision makers: user (requested an architecture change preserving the web interface and security, direct connections without relay, and a resident host implementation), Codex (implementation design)

**Subsequent decision:** [0187](0187-mew-independent-virtual-display.md) adds an in-house Windows virtual display and a one-time administrator installation boundary. The standard-user host, direct connections, and suspended capture while idle are preserved.

**Subsequent decision:** [0189](0189-mew-desktop-external-direct-connectivity.md) adds Windows UDP allowance under OS approval, temporary NAT mappings for active connections, and STUN retries. Direct connections without relay are preserved.

## Background

- Subsequent decision: [0188](0188-mew-posix-native-desktop.md) — Transition Mac/Linux to a resident native H.264 path as well; preserve direct transport, approval, and leases.

The current startup path and constraints are documented in the [first-frame study](../../research/remote-desktop-startup.md). The user wants direct connections without a separate relay server and minimal idle CPU/GPU activity independent of PC sleep. Verify screen display speed and actual input readiness separately.

## Decision

- Send video and input over an encrypted direct WebRTC path between the browser and the logged-in desktop. The Mew server owns authentication, authorization, signaling, exclusive control, and leases. Do not use TURN or WebSocket relays for video or input. Public STUN is used only to discover external addresses and can be disabled with an explicitly empty configuration. Some NATs and firewalls require reachable IPv6 or UDP port mapping.
- The initial implementation targets Windows/WSL. Node handles control, lifecycle, and the existing input protocol, while native WebRTC transport from node-datachannel/libdatachannel and an in-house Windows D3D11/Media Foundation module handle the video path. Do not pass through Electron's raw pixel→IPC→canvas track path. Connect a small native transport module to OS hardware encoders instead of bundling all of libwebrtc.
- Prepare the host in advance and reuse it within the Mew server's lifetime. Preserve Windows login session and SID validation. While idle, retain only reusable resources such as GPU devices, and disable capture, encoding, input, and sleep prevention. Do not require a separate persistent service that starts at login or administrator privileges.
- Isolate delayed signals and input with a new session ID for each connection. Do not grant control to another session before confirming termination is complete. Permission revocation, loss of the parent connection, lease expiration, and OS lock terminate capture and input. Server shutdown also terminates the resident host.
- Prefer hardware H.264 for Windows video. Overlap the first frame with connection negotiation and limit queues for unencoded frames and compressed output. Do not claim that retaining GPU resources guarantees zero-copy or low power consumption; verify on actual hardware.
- Retain the existing Mac/Linux capture and input adapters in the first phase, but use only direct transport. Removing Electron on these OSes is a separate implementation phase and must not be recorded as complete.
- Perform installation and updates when the user applies the changes. Development agents perform validation only in temporary paths without modifying running servers or installed copies. The [distribution document](../../development/remote-desktop-distribution.md) owns licensing, exact dependencies, and compilation requirements.

## Rationale

Remove process and renderer startup and raw frame copying from the connection path, and use the OS hardware video path. [libdatachannel](https://github.com/paullouisageneau/libdatachannel) provides WebRTC media and DataChannel transport between native apps and browsers. [STUN](https://www.rfc-editor.org/rfc/rfc8489.html) discovers NAT addresses rather than relaying traffic. Separating the lifetimes of authorized active sessions and idle resources preserves screen and input boundaries regardless of whether the host remains resident.
