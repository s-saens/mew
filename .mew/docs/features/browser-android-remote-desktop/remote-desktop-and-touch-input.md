---
id: "mew-remote-desktop"
parent: "mew-remote"
title: "Remote desktop and touch input"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-24"
status_hash: "278f4dc5c3b21929284aadc8ff47af89a35f48d29be6a318f5b80773c2f10e81"
files: ["src/components/remote-desktop.tsx", "src/components/desktop-screen-keyboard.tsx", "src/utils/desktop-screen-keyboard.ts", "src/utils/desktop-input.ts", "src/utils/desktop-video.ts", "server/remote-desktop.ts", "server/remote-desktop-host.ts", "native/remote-desktop/main.mjs", "native/remote-desktop/native-host.mjs", "native/remote-desktop/rust-direct.mjs", "native/remote-desktop/rust/src/engine.rs", "native/remote-desktop/video-settings.mjs", "native/remote-desktop/video-pacer.mjs", "native/remote-desktop/gpu-windows.cpp", "native/remote-desktop/virtual-display-driver.cpp", "server/desktop-resident-host.ts", "mew"]
commits: []
description: "Contract for the server desktop's Rust video engine, host preparation, video settings, direct WebRTC video/input, full and gaming keyboards, and touch input. Includes overlapping encoding and transmission at native FHD size, RTT relearning and quality recovery, verification of Windows encoder settings, stage-by-stage diagnostics, and OS and real-device limitations."
상위파일:
  - "MOC.md"
  - "_browser-android-remote-desktop.md"
---

## Requirements

- Remotely view and control the desktop used by the server.

### Scope

- Preinstall OS-specific helper app components through `./mew setup`. On Mac, open the required permission settings on the server Mac and confirm user approval.
- Run `./mew desktop-setup` in the Mew terminal to repeat preparation alone without building or restarting.
- OS login, libraries, and user approval are required.
- On macOS 13 or later (Apple Silicon/Intel) and Linux x64/arm64 X11 and Wayland desktops, the built-in helper app also provides connections, input, and connection notifications.

- Provide component preparation, display selection, direct WebRTC connections, and mouse, keyboard, and mobile joystick input.
- Once video and input are actually ready, display a connection notification once on the PC being accessed remotely.
- Display cumulative network usage for the current session in the top bar containing the fullscreen button.
- In settings, select and save HD, FHD, QHD, or 4K, a target of 30, 60, 120, 144, 165, or 240FPS, and Balanced or High Quality. Changes reconnect to the same shared display. Adjust to a mode accepted by the browser and GPU, and show the actual received resolution, decoded FPS, applied target, RTT, Mbps, and transmission wait.
- Limit the pacing queue and frame lifetime so stale transmission frames do not accumulate indefinitely even in High Quality, and adjust bitrate based on congestion. Key and button transitions do not wait for video FPS, while motion is coalesced up to the applied FPS.
- Overlap transmission with the next encoder operation while preserving native FHD size. Allow at most two compressed frames in total across transmission and waiting, preserving reference order, original transmission limits, and IDR recovery. Relearn normal reception after the RTT baseline rises and recover quality over time. Expose Windows encoder control failures and provide stage-by-stage diagnostics. Details and real-device limitations follow the [FHD transmission contract](../../development/remote-desktop.md#stage-by-stage-diagnostics-and-fhd-verification).
- For both transmission priorities, a fixed receive-buffer delay alone does not continually reduce quality while reception and decoding remain normal. Increased buffer delay, loss, rising RTT, or transmission backlog lowers encoder and transmission bitrates together. Quality priority also limits its own transmission wait for regular frames to 100ms and allows 500ms for keyframes. This is not an upper bound on total input-to-display latency. Criteria and limitations follow the [transmission contract](../../development/remote-desktop.md#transport-and-latency).
- Support fullscreen, 90-degree rotation, cursor acceleration proportional to speed, sensitivity settings (default 3×), and vertical hotkeys movable by a handle. Reduce duplicate discovery, firewall diagnostic waits, and round trips for host startup and display selection during connection startup.

- Continuously adjust wheel scrolling, panning, and zooming at a speed that increases gradually with distance from the center, stopping when returning to the center or releasing touch.
- Display the mouse UI and left floating hotkey bar with translucency.
- When the remote display has focus, prioritize remote input over mew shortcuts and forward Ctrl/Cmd+W, N, Shift+N, T, number keys, and Tab, as well as Esc, F6, and others, to the remote host. Use supported browsers' JavaScript fullscreen keyboard lock without a client helper app, and restore the app's reserved-key lock after remote focus is lost. Complete forwarding of OS-reserved keys, keys unsupported by the browser, or keys absent on the host is not guaranteed.
- Share a bidirectional text clipboard through Ctrl/Cmd+C, X, and V and manual buttons in the input window. Browser permission and a secure context are required; images, files, and continuous change monitoring are not supported.
- Open the on-screen keyboard with the top button; it provides Full Keyboard and Gaming modes. Full Keyboard includes function keys, arrow keys, a numeric keypad, Korean/English and Hanja keys, and lockable modifiers. Gaming defaults to Q/W/E, A/S/D, and F/G/Space, supports holding multiple keys with multitouch, and allows configuring 1–24 keys by changing, adding, deleting, or resetting keys at each position. The Keyboard Only option hides video while maintaining key input and the connection. Closing the keyboard or disabling the option restores the display; disconnection shows connection guidance. Mode, gaming layout, and Keyboard Only settings are saved in browser settings per account and instance.
- Hide the hotkey bar when keyboard input is detected, and hide the virtual mouse controls when a mouse or trackpad is detected. Handle the two input devices independently.

### Boundaries and limitations

- Use one connection for the entire server.
- A logged-in desktop on a supported OS and approval are required. Lock screens, pre-login screens, and UAC screens are not supported.
- Actual performance varies by environment.
- The built-in Windows virtual display requires a separately signed driver installation. Source, builds, and host integration are currently provided; official signing and real-device verification with the monitor powered off remain outstanding.

### Detailed contracts

- [Installation and controls](../../../../docs/guides/remote-desktop.md) · [Transmission, input, and verification scope](../../development/remote-desktop.md)

<!-- mew:implementation:start -->
## Implementation details

- In the default video path, a dedicated Rust thread in the same Node process handles the existing GPU ABI, Annex-B validation, RTP generation, pacing, and direct WebRTC transmission. Compressed frames and RTP packets are not passed to JS. Input, authentication, OS permissions, and congestion control policy remain in Node, while Rust also enforces the two-frame maximum, IDR recovery, and approval expiration. Follow the [Rust engine and verification contract](../../development/remote-desktop-rust.md).

- Remote capture receives both keydown and keyup through a shared highest-priority listener installed during module initialization. App listeners for closing, creating, and selecting by number do not intercept remote input even if mounted first. Add mappings for the numeric keypad, Insert, extended function keys, Korean/English, Hanja, and others, and preserve key repeats as reliable release/press transitions. Clean up pressed keys and lock lifetimes on loss of focus, leaving the window or fullscreen, and disconnection.
- If clipboard sharing through Ctrl/Cmd+V fails, send remote Ctrl/Cmd+V to paste from the existing remote clipboard. Delayed reads check focus and session state, and keys still held are restored after successful sharing. Native paste combinations also restore the key state at that moment so overlapping asynchronous clipboard writes and modifier input do not lose state. Details follow the [keyboard and clipboard contract](../../development/remote-desktop.md#keyboard-lock-and-clipboard).

- Open it from the desktop or mobile hamburger menu according to permissions; do not show it in the Dock.

- Windows capture uses WGC GPU surfaces and hardware H.264. The built-in virtual monitor is maintained only while connected through file-handle ownership and a 10-second lease.
- Prepare input after actual display coordinates are established, and show the connection as complete only when both the first video decode and the input channel are ready.
- Readiness confirmation on the reliable channel displays the **mew remote desktop connected** system notification on the host. It appears once per reconnection, and notification errors do not interrupt video or input.
- The build, signing, and installation contract and verification scope for the built-in driver without StarDesk are recorded in the [virtual display document](../../development/remote-desktop-virtual-display.md).

- `DesktopScreenKeyboard` places the full keyboard below the video and shows gaming keys as a small 3-column pad over the video. Keyboard Only hides the video area, excludes it from focus and accessibility navigation, and expands the keyboard while maintaining video reception and the input session. Key editing uses the shared `SelectField`, and physical key detection does not hide an explicitly opened on-screen keyboard. While the on-screen keyboard is open, hide the existing vertical hotkey bar; after closing, resume its existing detection rules. Manage presses per multitouch pointer and locked full-keyboard modifiers, cleaning them up on cancellation, closing, rotation, mode changes, blur, fullscreen transitions, release signals, and disconnection. Merge physical and on-screen key ownership on the client, then transmit it through the existing reliable input snapshots.
- Shared-display and hotkey modifier selectors use custom dropdowns rendered at the remote display root, preserving the input boundaries for fullscreen and settings.
- The rotation button rotates the video, mouse, hotkeys, toolbar, settings, and task dock together in 90-degree increments. Clicks, joystick input, and handle movement use the same coordinate system in the rotated layout.
- The top close and toolbar row uses the same deep background color, 36px height, and 24px close button as other panels. On narrow screens, the title and tools split into two rows.
- Cumulative usage in the top bar updates the combined received and sent total in B, KB, MB, or GB about every 1 second. It includes video, input, and authentication connection control messages; separate received and sent values are also available. It starts from 0 on reconnection or shared-display changes and persists through rotation and fullscreen transitions. Aggregation scope and statistical limitations follow the [development contract](../../development/remote-desktop.md#viewer-settings-and-coordinates).
- Per-connection increments are also reflected in [cumulative usage in the app header](../appearance-accounts-operations/network-usage.md). The header's detail popup distinguishes all remote sessions and preparation HTTP traffic from other feature traffic and retains totals after remote disconnection.
- Display the screen rotation button as an outline icon combining landscape and portrait screens with a clockwise arrow. Use the same stroke width, color, and size as surrounding controls.

- `./mew setup` invokes the existing OS-specific installers and Mac permission preparation before building the app.
- Installation itself does not start screen capture, input, or resident execution; progress and failures are displayed in the terminal.
- `desktop-setup` performs only the same preparation.
- Permissions already granted are not requested again. Approval waits up to 5 minutes and can be canceled and retried.
- The detailed sequence and verification limitations follow the [automatic preparation contract](../../development/remote-desktop.md#automatic-preparation-and-internal-tmux) and [Mac permission preparation](../../development/remote-desktop.md#mac-terminal-permission-preparation).

- It respects feature permissions and returns to the previous workspace when closed.
- The dock is also shown in the default mobile viewer and hidden only in browser fullscreen (it remains hidden while the keyboard is open).
- Selecting another panel from the dock ends the remote connection and switches to that panel.

- Provide component preparation, display selection, direct WebRTC connections, and mouse, keyboard, and mobile joystick input.
- Support fullscreen, 90-degree rotation, cursor acceleration proportional to speed, sensitivity settings (default 3×), and vertical hotkeys movable by a handle. Reduce duplicate discovery, firewall diagnostic waits, and round trips for host startup and display selection during connection startup.

- The wheel, panning, and zoom controls use continuous joysticks whose speed increases more gradually the farther they are pushed from the center; cursor movement and button dragging retain the existing touchpad behavior.
- The mouse controls, screen adjustment column, and hotkey bar use translucent backgrounds in theme colors.
- The hotkey bar uses a dense layout with small text and spacing, and the up arrow collapses and expands it. It can still be moved using the handle when collapsed.
- The width ratio of the upper mouse controls—left click, wheel, and right click—is 2:1:2, and their height is 2/5 of the total width, making the left-click and right-click areas square. The lower cursor movement area is a square with sides equal to the total width.
- The repositioning handle sits below the panning and zoom container on the right, with the combined height of the container, gap, and handle matching the mouse controls on the left.
- Changes in browser hover and fine pointer availability, along with actual mouse input on the remote screen, hide the virtual mouse. It reappears when pointer availability is lost or the screen is touched without a fine pointer available. Actual key input received by the remote screen hides the hotkey bar, and this state persists across reconnections and rotation. The browser cannot directly detect a keyboard that is merely connected or a keyboard being disconnected.

- Windows/WSL uses resident Node, D3D11 GPU capture, Media Foundation hardware H.264, and native WebRTC. Capture and encoding stop while idle, and devices are reused across connections.
- For direct external connections, it provides STUN negotiation retries, short-lived PCP/NAT-PMP/UPnP mappings for active sockets, and preparation for UAC approval of Windows UDP app rules. Existing blocking policies are preserved. [External connectivity and verification scope](../../development/remote-desktop-connectivity.md).
- Mac/Linux uses the same direct connection, retry, and temporary mapping lifetimes. It queries the IPv4 interface selected by the kernel and distinguishes the service PATH, multiple NICs, and VPN routes. It provides explanations of Mac local network permissions and read-only failure guidance for Mac/Linux firewalls. It retains ownership of the receive-only native input channel until the session ends to prevent the common issue of GC disconnecting the connection.
- It retains input and permission leases, per-connection session IDs, and control handoff only after capture termination is confirmed. TURN and WebSocket video relaying are rejected. The server selects the default screen to skip the browser selection round trip.
- Mac/Linux also uses resident Node, native GPU capture, hardware H.264, and direct WebRTC. Without a GPU, it does not fall back to Electron or CPU encoding. [Installation, GPU, and permission contract](../../development/remote-desktop-posix.md).
- Mac operates with granted Screen Recording and Accessibility permissions, while Wayland ends the connection when portal input permission is revoked, even while idle.
- New Windows hosts require C++ Build Tools, the Windows SDK, and GPU hardware H.264.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-20 FHD pipeline: Checked overlapping encoding and transmission while retaining the same compressed frames; ACKs, reference order, original deadlines, and IDR/termination cleanup for two frames; RTT baseline increases and prevention of repeated slowdowns from small fluctuations; actual congestion slowdowns; and time-based recovery. Windows ABI 5, per-stage metadata, and bitrate failure propagation were verified with FFI test doubles, and C++ was checked for syntax using Visual Studio and the Windows SDK. With fake-clock FHD60, 12Mbps, 25KB AUs, and an 8ms encoder, throughput over 2 seconds increased from 105→117 frames, and recovery to 12Mbps changed from 55.6→8.2 seconds. App and server types were checked in an isolated checkout excluding other concurrent edits. Actual GPU and StarDesk image quality/display latency comparisons and production rollout were not performed. [ADR 0024](../../decisions/0024-remote-desktop-fhd-pipeline.md).

- 2026-10-16 Windows game input: Changed virtual-key transmission with empty scan codes to scan-code-first transmission. FFI test doubles verified press/release for WASD/Q/E/F/G/Space, distinctions for right-side modifiers, numpad Enter, and extended keys, and fallbacks for Pause, IME, and unmappable keys. Passed 15 native, input protocol, and on-screen keyboard checks, plus TypeScript, targeted lint, and documentation checks. Successful actual input in Roblox and rollout to the Windows helper app have not yet been confirmed.

- 2026-10-16 keyboard-only view: Passed 6 unit, isolated UI, and synthetic WebRTC direct/native direct connection checks. Verified hiding the screen for PC/mobile full keyboards and gaming, saving/restoring settings, restoring the screen on close/disconnection, retaining the video stream, and host key input while hidden. Passed TypeScript, targeted lint, documentation description/link, and diff checks. Actual remote device verification, app builds, and server rollout were not performed.

- 2026-10-16: Passed 39 targeted checks for the on-screen keyboard, input, translation dictionaries, Keyboard Lock, and synthetic WebRTC direct/native direct connections. Verified both themes on PC/mobile, multitouch retention/cancellation, simultaneous virtual mouse and game key operation, game key editing and restoration after refresh, and release on rotation, fullscreen, and disconnection. Passed TypeScript, targeted lint, documentation description/link, and diff checks. Broader checks still showed existing missing UI translation literals and an app new-file shortcut expectation mismatch. Actual games, hands-on testing on physical remote OS devices, app builds, and server rollout were not performed.

- 2026-10-16 congestion and quality-first latency fix: Under a fixed 45ms receive buffer, 0 loss, 10ms RTT, and continuous decoding, reproduced the previous controller's slowdown from 6Mbps→350kbps in 2.4 seconds, and confirmed that the fix maintained 6Mbps under the same conditions. Unit tests verified prevention of baseline contamination from fixed latency, missing optional frame statistics, and idle/stalled/loss samples; actual congestion slowdowns; the quality-first 100ms regular-frame limit; IDR recovery; suppression of duplicate IDR requests during transmission; and linked encoder/transmission bitrates. In a fake-clock comparison with a 100KB IDR and 4ms callback intervals, transmission completed in 332→120ms in 6Mbps mode and 168→60ms at 12Mbps. Passed 39 related unit tests, 2 isolated Chromium regression tests, and TypeScript, lint, and documentation checks; existing lint warnings remained. Also checked the new guidance text in PC/mobile settings. Comparisons of image quality, FPS, and input-to-display latency on actual devices and StarDesk, app builds, and server rollout were not performed. [ADR 0009](../../decisions/0009-remote-desktop-quality-latency.md).

- 2026-10-07 video optimization: On an isolated Linux native host, verified direct H.264 video targeting 144FPS, input, permission revocation, reconnection, and fallback negotiation to 165FPS for a 240FPS request. Ran 2 existing PC/mobile regression tests on the actual WebRTC viewer, checked settings changes and saving, and inspected the settings screen. Passed checks for pacing packet reassembly, bounded bursts, frame-boundary budgets, IDR recovery, SPS rejection, congestion response, idle IDR suppression, receive statistics deltas, and receiver capabilities. Passed compilation of Linux production/test modules and syntax checks using the Windows SDK. Testing of high refresh rates, 4K, and high-quality input-to-display latency on physical GPUs, Mac execution, actual behavior of reused Windows surfaces, app builds, and restarts was not performed. Follows the [current transport contract and limitations](../../development/remote-desktop.md#transport-and-latency).

- 2026-10-07 input priority: Mounted the actual app handlers together with remote capture in `desktop-keyboard-ui.test.ts` to verify reserved-key down/up, repeats for keys held before entering the screen, Ctrl+Shift+V retention, clipboard failures and discarding late completions, and restoration on focus, blur, close, and app lock. Mock adapters in `remote-desktop-native.test.ts` checked Windows extended keys, exclusion of unsupported Mac keys, X11 keysyms, and Wayland evdev; `desktop-input.test.ts` checked restoration of the latest modifiers after asynchronous paste. Also passed 2 actual WebRTC viewer scenarios. Keyboard Lock approval was mocked; hands-on testing of actual OS reserved keys and new mappings, builds, and restarts were not performed.

- User verification criteria:
  - Reconnect with FHD/QHD, 144FPS, and high quality in settings, then check the applied targets and actual received resolution/FPS. Requests exceeding the supported ceiling, such as 240FPS, must keep the connection active and lower the applied value. Do not classify low received FPS on a static screen as a failure.
  - Verify that cumulative usage at the top increases with received and sent traffic, remains visible on narrow screens, in fullscreen, and after rotation, and resets on reconnection or shared-screen changes.
  - Verify actual video, input, and reconnection from a phone on an external LTE/5G network. Do not substitute a successful connection on the same PC for external connectivity verification.
  - Verify that the remotely accessed PC shows a connection notification once the initial screen and input are ready, and shows it again on reconnection. Remote connectivity must work even when OS notifications are blocked.
  - Verify Mac approval, actual screen content, Retina coordinates, input, and notifications, and Linux X11/Wayland connection, input, termination, and reconnection. On Wayland, verify relative movement, keyboard approval, and connection termination after permission revocation.
  - In supported environments, verify connection, cancellation, screen selection, touch dragging, click coordinates after rotation, sensitivity, continuous adjustment/return to center/stop on release for speed joysticks, translucent controls, hotkey movement/input, fullscreen, direct connection failure guidance, and relay rejection.
  - Record automated verification and hands-on testing limitations in the [implementation plan](../../work/remote-desktop-controls.md).

- 2026-10-07 cumulative network usage: Verified prevention of double counting, route changes, peer replacement, invalid counters, and unit display in 4 unit tests. In 2 isolated Chromium scenarios, verified increases, receive/send accessible names, the 320px boundary, reset when resuming the viewer, and existing input, rotation, and fullscreen behavior; reviewed PC/mobile captures. Passed type, targeted lint, documentation description, and documentation boundary checks. The full UI Korean literal check failed in existing debugger, task, and other areas outside this work. Builds, server restarts, and actual remote device verification were not performed.
- 2026-10-05: In 2 isolated Chromium scenarios in `remote-desktop-ui.test.ts`, verified the position, width, and 44px touch height of the handle below the screen adjustment container, top/bottom alignment with the mouse controls, and existing rotation, handle movement, and input. Reviewed PC/mobile captures and passed type, targeted lint, design detection, documentation boundary, and link checks. Builds, server restarts, and actual remote device verification were not performed.
- 2026-10-05 input device auto-hide: In 2 scenarios in the same browser tests, verified hiding on mouse availability changes and actual pointer input, restoration on disconnection and touch, pen exclusion, hotkey hiding on actual key input and persistence across reconnection and reset, device independence, and existing input and paste behavior. Also passed type, targeted lint, documentation boundary, and link checks. Design detection flagged one existing hidden cursor image that sets `src` after receipt as a static warning. Hands-on testing of actual keyboard/mouse connection and disconnection, builds, and restarts were not performed.

- In hands-on Windows Chrome testing, verified the first hardware H.264 screen and reconnection within the same process in memory. External NAT, mobile, and click-to-photon require separate measurements. [Implementation and verification record](../../work/remote-desktop-resident-direct.md).
- Tested Linux X11 native capture, direct H.264, XTest input, notification requests, authentication revocation, and resident process reuse using a test-only software encoder in isolated Xvfb. Production hardware encoding performance has not yet been measured. Actual device verification on Mac and Wayland remains outstanding. [Verification scope by OS](../../development/remote-desktop.md#verification).
- Tested Linux native WebRTC, actual OS route lookup, and connection, reconnection, and mapping deletion using only mapped candidates in an isolated NAT. These ran in a Linux process on WSL and are distinct from verification on actual Macs, physical Linux GPUs, and LTE/5G phones. [External direct connection verification](../../development/remote-desktop-connectivity.md#errors-and-verification-scope).

- 2026-10-07 keyboard and clipboard: Passed 41 input, clipboard, native adapter, notification, and isolated Chromium regression tests. Key lock API approval, denial, late approval, and release on focus/termination were mocked; bidirectional text buttons, permission errors, remote Escape, and 320px/PC layouts in the actual WebRTC viewer were verified in an isolated browser. Passed type, lint (existing warnings), description, and documentation placement checks. Actual OS key interception, hands-on Windows/Mac/Linux clipboard testing, builds, and server restarts were not performed.

- 2026-10-08 initial implementation record for transport priority: At the time, quality-first retained the negotiated encoder bitrate and resolution and allowed actual FPS to decrease through bounded waits for frame transmission. This fixed-encoder, long-wait policy was superseded by [ADR 0009](../../decisions/0009-remote-desktop-quality-latency.md) on 2026-10-16. The behavior of restoring quality-first when older saved high-quality settings lack a priority is retained. At the time, 13 video settings, congestion, and RTP unit tests and 29 connection, permission, clipboard, notification, and isolated Chromium regression tests verified frame completion on slow links, bounded waits, encoder bitrate retention/reduction, restoration of older settings, request validation, keyboard/touch selection, and browser storage. Reviewed PC/mobile captures and TypeScript, targeted lint, description, and documentation placement checks. Actual external-network measurements of image quality, FPS, and input latency, app builds, and server rollout are verified separately.

<!-- mew:validation:end -->
