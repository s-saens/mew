---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Connect Windows remote desktop parent communication through Node and a named pipe. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0137 — Connect Windows remote desktop parent communication through Node and a named pipe"
created: 2026-09-14
updated: 2026-09-14
---

- Date: 2026-09-14
- Status: Adopted
- Follow-up decision: [0138](0138-mew-desktop-automatic-preparation.md) — automatic preparation, Windows InteractiveToken execution, and bootstrap token delivery restricted by SID; retain the existing authentication pipe and lease
- Decision makers: User (requested a fix for connection failures after restart), Codex (compatibility fix)
- Partially supersedes: [0136](0136-mew-native-remote-desktop-webrtc.md) — changes only the direct stdin/stdout segment between Windows Electron and its parent

## Decision

Reproduced an issue in an actual installation where the anonymous stdin pipe immediately reaches EOF in Windows Electron. Spawning Electron again from Windows Node causes the same issue. WSL Mew → Windows Node retains parent-owned stdio, while Windows Node → Electron connects through a local named pipe with a random name and authentication token generated for each launch. Do not open a TCP port.

Pass the token only through the child environment and verify it in the first message. Limit input size and time before authentication, and allow only one authenticated child. Link termination of parent stdio, the named pipe, and the child so no capture/input lease remains active. Retain the existing heartbeat and Electron's own expiration mechanism. Do not write signaling, authentication tokens, screen content, or keystrokes to disk or logs.

Retain 0136 for direct stdio on Mac/Linux, user authentication, Origin, exclusive control, WebRTC video/DataChannel input, and Windows screen sharing from WSL. Detailed contracts are documented in [Current implementation and verification](../../development/remote-desktop.md).

## Rationale

Follow the [Electron Windows stdio limitations](https://github.com/electron/electron/issues/4552) and [Node named pipe IPC](https://nodejs.org/api/net.html#ipc-support). Do not rely on console behavior in GUI processes or add an external network listener.
