---
title: "Remote desktop display, settings, hotkey, and connection startup improvements"
created: 2026-09-19
updated: "2026-10-02"
description: "Records improvements to remote desktop fullscreen, rotation, settings, sensitivity, hotkeys, and connection startup, along with the implementation scope, verification, and remaining real-device conditions for cursor acceleration and panel rotation."
상위파일: "_work.md"
---

[Features](../features/browser-android-remote-desktop/remote-desktop-and-touch-input.md) · [Usage](../../../docs/guides/remote-desktop.md) · [Development contract](../development/remote-desktop.md)

## Goals and implementation order

1. Add fullscreen, 90-degree rotation, and settings entry points at the top while preserving the existing dedicated remote desktop screen and input release contract.
2. Increase the default mouse cursor sensitivity to 3 times its previous value, with adjustment and saving from 0.5–6 times in settings. Preserve direct-click coordinates and wheel, pan, and zoom gains.
3. Place a vertical hotkey bar on the left, with the same handle movement, keyboard movement, screen boundary constraints, and reset capabilities as the mouse.
4. Apply shared geometry functions so that video, the local cursor, direct clicks, and joystick movement use the same coordinate system after rotation.
5. Reduce synchronous diagnostics and duplicate path discovery during connection startup, and quickly switch from a direct path with no first video frame to server transport.
6. Run Chromium integration verification with a synthetic screen, input/coordinate/server unit tests, type checks, lint, and documentation checks. The user applies the changes to the actual server.

## Scope of changes

- Preserve the existing palette, mouse appearance, and separate fullscreen portal. Settings owns sensitivity, display selection, Ctrl/Cmd, position reset, and reconnection. Hotkeys provide remote Esc/Tab/Enter/Backspace/Copy/Paste/Undo/Switch Apps.
- Sensitivity is saved only in browser localStorage. Rotation, zoom, hotkey modifiers, and control positions are state in the current viewer. The remote monitor's OS rotation settings are not changed.
- WSL firewall diagnostics run asynchronously after the helper starts. Executable path discovery used by readiness checks and spawn is coalesced for 30 seconds, while readiness, installed version, and permissions continue to be checked. The two path conversions run in parallel.
- Preserve the preference for direct connections and server fallback using the same capture. Reduce the wait for confirmation of the first decoded frame after the offer from 4 seconds to 1.2 seconds. A direct path that takes longer to establish may switch to server transport, and actual performance varies by path.
- Do not add external services, resident capture, automatic startup at login, or new public ports. These are UI, gain, and startup latency improvements within the scope of existing ADRs 0139/0144/0154 and do not supersede existing decisions.

## Verification and remaining real-device checks

- Passed 4 Chromium integration scenarios (direct, server, simulated native stream server, and simulated native stream direct). They use actual WebRTC and VP8 encoders/decoders, with a synthetic canvas as the screen.
- Verified 3×/1× sensitivity, click positions and movement directions after rotation, entering/exiting fullscreen, hotkey ordering and key release, hotkey handle movement, Escape handling with settings taking priority, repeated back navigation, click coordinates after resolution changes on the same video track, landscape screen boundaries at 320px wide and 390px high, the installation popup, reconnection, and background termination.
- In the two synthetic scenarios with the direct path blocked, the time from offer to server transport request was about 1.20 seconds. This interval was reduced by about 2.8 seconds compared with the previous fixed wait of 4 seconds; it is not a measurement of total click-to-first-screen time or real-world networks.
- Passed 58 non-UI remote desktop tests covering coordinate conversion, input, readiness, permissions/leases, path caching, firewall diagnostics, and more; 3 actual OS opt-in tests were not run. Type checks and lint passed, with existing lint warnings outside the scope of the changes remaining.
- Visual verification covered mobile, desktop, and settings screens using the existing tokens. Fixed a defect where the global max-width applied directly to video constrained the rotated size, and reverified 4 scenarios.
- Actual Windows/Mac cold starts, actual external mobile networks, iOS Safari fullscreen, and OS-specific key combinations require separate real-device checks. Initial installation, permission approval, and login helper cold starts remain, and immediate connections equivalent to other remote apps are not guaranteed.
- Workspace documentation boundary and link checks and the diff whitespace check passed. Production server builds, restarts, and deployment were not performed.


## Follow-up improvement — speed-proportional cursor acceleration

As requested by the user, cursor movement increases proportionally with faster swipes, even over the same distance. This applies only to cursor movement and dragging with the three buttons, and preserves the ADR 0154 contract that no movement occurs while stationary. [Input and permissions](../development/remote-desktop.md#input-and-permissions) is the canonical source for reference speed, caps, timestamps, and sensitivity integration.

Verified the 10× difference between 100px/50ms and 100px/500ms, equal distances with samples split into 1/10/100 parts, slow direction reversal, stopping, new strokes, identical/backward timestamps, and cancellation. Passed 24 input and coordinate unit tests and 4 Chromium direct/server/simulated native scenarios. In the browser, verified 200px/2000px movement at 1× sensitivity within the existing per-packet safety cap for remote relative movement, and also verified 1×/3× sensitivity at the reference speed. Type checks, lint for changed files, and documentation checks passed. Builds and restarts were not performed.

## Follow-up improvement — full panel rotation

The rotation button rotates the entire panel, including the mouse, hotkeys, toolbar, settings, and dock, as well as the video. [Viewer settings and coordinates](../development/remote-desktop.md#viewer-settings-and-coordinates) is the canonical source for layout and input coordinates and menu placement.

In two Chromium scenarios using synthetic WebRTC video, direct and native-direct, verified control boundaries in all four orientations, handle movement, selection in the rotated settings menu, and existing rotated clicks, joystick directions, fullscreen, and reconnection. Passed 31 tests including input and coordinate unit checks. Actual Windows and mobile device checks are separate, and production builds and restarts were not performed.
