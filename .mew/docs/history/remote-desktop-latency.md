---
title: "Remote desktop cursor and latency improvement implementation"
created: 2026-09-15
updated: 2026-10-01
description: "Records implementation, measurements, and the macOS extension of earlier remote desktop improvements to local cursors, native capture, and idle video. Distinguishes these from the current contract after the transition to resident GPU direct connections."
상위파일: "MOC.md"
---

[ADR 0144](decisions/0144-mew-desktop-local-cursor.md) · [ADR 0146](decisions/0146-mew-desktop-cursor-capture-fallback.md) · [Research](../research/remote-desktop-latency.md)

2026-10-01 follow-up: the following are records of the previous implementation and measurements. [ADR 0185](decisions/0185-mew-desktop-resident-direct-host.md) and [Resident direct connection implementation](../work/remote-desktop-resident-direct.md) supersede Windows/WSL capture, host lifetime, and all video transport. The retained scope of cursor and touch input follows the current [development contract](../development/remote-desktop.md).

## Architecture

Windows DXGI worker → raw BGRA screen with one request/one response → generated video track in the sandbox renderer → existing WebRTC or WebCodecs VP8 server transport. Pointer changes are passed to the viewer as separately validated metadata. The worker runs on a separate thread and does not block input injection. If Windows DXGI initialization fails, the GDI worker provides separate cursor and screen copying as a fallback. macOS passes the latest cursor-free screen from its own ScreenCaptureKit module through the same worker protocol. Native initialization failures on each OS and Linux use the existing Chromium capture, and local cursors are not enabled on this path.

The viewer caches the host cursor image and hotspot, displaying a native CSS cursor for the mouse and a local position layer for the joystick. Movement/hover and video update cycles are separate, while down/up/wheel include the current coordinates. Idle video liveness checks and queue limits are both maintained.

## Stages

- [x] Review current capture and protocol behavior; write ADR
- [x] Implement Windows DXGI worker, raw frame lifetime, pointer conversion, and capability checks
- [x] Connect renderer-generated tracks, capture fallback, and idle/resume handling
- [x] Validate cursor metadata, forward it through the server, display it in the viewer, and correct its position
- [x] Input coalescing, final movement recovery, and down/up/wheel coordinates
- [x] Server ACK adaptation, idle video liveness checks, and recovery
- [x] Unit tests, actual Chromium checks, and Windows fallback testing on actual hardware
- [x] Update current contracts, usage, and deployment documentation; run type, lint, and documentation checks
- [x] Verify Windows native activation and actual cursor image display; supplement DXGI errors or missing initial frames with an actual GDI path
- [x] Recalculate cursor position when initial video dimensions are determined late; show the applied status in help

## Verification results and remaining conditions

| Scope | Result |
| --- | --- |
| Protocol, input, server, and installation regressions | 41 regression tests passed, including Mac extensions; 1 Mac hardware test conditionally skipped |
| Actual Chromium | 4 scenarios passed: direct, server, simulated native via server, and simulated native direct→server |
| Idle video | During a 16-second pause in synthetic capture, additional video totaled 0 frames/0 bytes; verified connection retention, keyframe recovery during the pause, and resumed updates |
| Installed Windows runtime + temporary helper | Chromium fallback video reception, connection retention, and parent process exit checks passed |
| Windows native cursor | Received cursor metadata during normal initialization and verified actual pixels in the transparent PNG and DOM display. Actual GDI + local cursor checks passed under both forced conditions: DXGI error and missing initial frame |
| Static checks | `npx tsc -b` and lint passed (10 existing warnings); documentation allowlist and workspace link checks passed |

When the initial DXGI frame is missing, the empty duplication is recreated once, with each attempt waiting approximately 1 second. If it fails again or an API/format error occurs, auxiliary GDI capture maintains cursor separation. If neither native path is ready, the connection uses Chromium and help displays the video cursor mode. This does not claim to resolve every driver/display state affecting DXGI itself. GDI screen reading and comparison costs and some GPU/protected content limitations remain.

Hardware testing was expanded from checking only the feature activation signal to receiving the actual cursor shape, decoding the PNG, checking opaque pixels, and displaying the image in the browser. Windows API errors and initial frame timeouts are simulated only in the temporary test helper; the installed copy is not modified.

0 bytes applies only to the video payload. Input heartbeats, status, and cursor metadata remain; actual latency or bandwidth on external mobile networks and any advantage over StarDesk were not measured. The macOS native path uses the same local cursor and idle frame omission, but has not yet been checked on actual hardware. Linux retains the existing video cursor. DXGI involves CPU readback and IPC copies; DXGI rotation and cursors that cannot be separated use the auxiliary GDI path, while displays exceeding the size limits of both paths use Chromium fallback.

## Verification principles

Do not permanently record screens or keystrokes. Check the browser UI with synthetic screens, and use a temporary helper and references to the installed runtime for Windows hardware tests. Do not modify the installed copy or running server. Distinguish actual OS/API verification from synthetic scene performance figures. Do not extend the claims to verified performance on actual external networks, Mac/Linux hardware, or physical mobile devices. The user performs builds and restarts according to the README.

## macOS extension — ADR 0148

- [x] [ADR 0148](decisions/0148-mew-macos-local-cursor.md), ScreenCaptureKit, custom C ABI, and installation plan
- [x] One latest cursor-free screen, duplicate screen omission, separate cursor, Retina/monitor coordinates, and shutdown handling
- [x] Automatic compilation per CPU, local signing, prevention of readiness markers on failure, and missing binary detection
- [x] Compile arm64 and x86_64 Mach-O objects against Apple SDK 15.5 (`-Wall -Wextra -Werror`)
- [x] Mac adapter/installation and existing input/server regressions: 41 passed; 1 Mac hardware test conditionally skipped
- [x] 4 actual Chromium scenarios passed: direct/server/synthetic native/direct→server; additional video during a 16-second pause: 0 frames/0 bytes
- [x] Type, lint (10 existing warnings), documentation allowlist, and workspace link checks passed
- [ ] Verify dylib linking/loading, Screen Recording and Accessibility permissions, system cursor shape and visibility, Retina, mixed scaling, multiple displays, locking, and reconnection on an actual Mac

A hardware test was added to run in a separate temporary helper using `MEW_DESKTOP_TEST_MACOS_CAPTURE=1 node --test server/remote-desktop-macos.test.ts`. It was not run because the current work environment is Linux/WSL. Do not interpret SDK compilation and mock FFI/browser verification as successful Mac hardware testing. The deprecated status of the macOS cursor query APIs and arrow fallback are documented in the [current development contract](../development/remote-desktop.md#macos-capture-and-installation-contract).
