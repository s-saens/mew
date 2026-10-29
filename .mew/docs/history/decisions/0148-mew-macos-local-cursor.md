---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate the macOS screen and cursor with ScreenCaptureKit. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0148 — Separate the macOS screen and cursor with ScreenCaptureKit"
created: 2026-09-15
updated: 2026-09-15
---

- Status: Adopted
- Decision makers: User (requested implementation of Mac optimizations without external services), Codex (design)
- Partially supersedes: The scope in [0144](0144-mew-desktop-local-cursor.md) that retains existing capture on Mac
- Partially supersedes: The macOS Chromium capture choice in [0136](0136-mew-native-remote-desktop-webrtc.md)

## Decision

**Subsequent decision:** [0188](0188-mew-posix-native-desktop.md) switches Mac from Electron, CPU pixels, and canvas transport to native VideoToolbox H.264 and an app with its own permissions. It initially uses the video cursor and preserves the existing separate-cursor implementation as historical rationale.

On macOS 12.3 or later, capture the entire monitor using ScreenCaptureKit's `showsCursor = NO`. Call the custom Objective-C module's C ABI from the existing Koffi worker. Handle ScreenCaptureKit asynchronous callbacks only within native code; do not pass them to JavaScript callbacks. During installation, compile and sign a dylib for the current CPU using Apple Command Line Tools. Include the source and build scripts in the helper fingerprint, and do not commit binaries to the repository.

Keep only the latest frame converted by the OS at up to 1080p and 60Hz. Skip copying, encoding, and video transmission for unchanged screens. Share the existing generated track, WebRTC, VP8 server transport, ACK adaptation, and idle liveness checks. Do not add separate service, account, or codec dependencies.

Read the system cursor's shape, hotspot, and position separately and send them through the existing local cursor protocol. Read AppKit cursor images on the main queue and copy the screen in the worker. Distinguish Retina video pixels from logical coordinates used for CoreGraphics input. The public `currentSystemCursor` and `CGCursorIsVisible` used for shape queries are deprecated APIs; separately verify their actual behavior on the latest OS. If the shape query returns nil, use the system arrow. Do not use private WindowServer APIs or globally hide the cursor.

Enable the local cursor only after confirming the first cursor-free frame. If initial native capture fails, fall back to the existing Chromium video cursor and show the actual mode in the help. If permissions, the login session, or the display configuration change during operation, or capture stops, release input and terminate so the user can reconnect. Do not support the lock screen or pre-login screen. Do not record installation failures as successes.

## Rationale and verification

[Apple ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10156/), [showsCursor](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/showscursor), [System cursor](https://developer.apple.com/documentation/appkit/nscursor/currentsystem), [Cursor visibility](https://developer.apple.com/documentation/coregraphics/cgcursorisvisible()).

Record implementation and support conditions in the [development contract](../../development/remote-desktop.md), and test results and areas not checked on actual hardware in the [work document](../../work/remote-desktop-latency.md).
