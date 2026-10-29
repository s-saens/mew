---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate the remote cursor from screen updates. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0144 — Separate the remote cursor from screen updates"
created: 2026-09-15
updated: 2026-09-15
---

- Date: 2026-09-15
- Status: Adopted
- Subsequent decision: [0148](0148-mew-macos-local-cursor.md) — macOS ScreenCaptureKit, local cursor, and omission of idle video
- Subsequent decision: [0146](0146-mew-desktop-cursor-capture-fallback.md) — GDI fallback path that separates the cursor when Windows DXGI initialization fails
- Decision makers: User (approved design and implementation of the latency and bandwidth research proposal), Codex (design)
- Partially supersedes: [0136](0136-mew-native-remote-desktop-webrtc.md) — Separate Windows capture from Electron/Chromium into a parent-owned DXGI worker; retain permission, login session, and input release boundaries
- Partially supersedes: [0139](0139-mew-desktop-server-transport.md) — Add idle state and liveness checks for static video and change ACK-based adaptation; retain VP8, direct-first transport, server fallback, and no external services

## Decision

Handle cursor coordinates and shape separately from screen video. The DXGI worker in the Windows/WSL login helper provides screen images without a composited cursor and separate cursor information. Perform capture/CPU readback on a different thread from input injection. Process only one renderer-requested task at a time, and pass raw frames only within the helper process. WebRTC and VP8 server transport use the same generated track. Zero-copy and hardware VP8 encoding are not guaranteed.

Environments where native capture cannot be prepared fall back to the existing Chromium video cursor. If capture permissions or the desktop change during a session, report the failure and terminate. Enable the local cursor only on paths confirmed to capture without a cursor. Other OSes retain existing capture; do not assume support for the cursor option without verification.

The local cursor does not wait for video ACKs. Coalesce ordinary movement, retain a high frequency for dragging and wheel input, and deliver button/key transitions and the final movement as reliable snapshots. For clicks, wheel input, and releases, finalize the event coordinates first. Retain the existing seq/epoch, cumulative counters, single-controller ownership, and release watchdog. Correct positions together with the applied input order so stale host positions do not roll back local input.

When DXGI reports no screen changes, skip raw screen copies and feeding new video. Check liveness responses from the capture worker and renderer even while the screen is static. The receiver distinguishes an explicit idle state whose last frame has been ACKed from interrupted video. Handle resume and decoder recovery requests with the latest screen and a key frame. ACK congestion control distinguishes the path's baseline transit time from additional latency, while retaining limits on in-flight frames and bytes.

## Rationale and scope

Chromium's current capture composites the cursor, and the runtime checked does not expose a cursor constraint. DXGI distinguishes screen updates from pointer updates. Use the existing Koffi to call Windows system APIs without adding dependencies on codec executables, external services, or compilation tools. Do not record input or capture data.

References: [DXGI Desktop Duplication](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api), [frame update information](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/ns-dxgi1_2-dxgi_outdupl_frame_info). Implementation plans and verification status belong in the [work
document](../../work/remote-desktop-latency.md), and background belongs in the [research](../../research/remote-desktop-latency.md).
