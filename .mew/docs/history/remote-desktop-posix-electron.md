---
title: "Previous Mac/Linux Electron remote desktop"
created: 2026-10-01
updated: 2026-10-01
description: "Preserves the Electron screen capture and OS-specific input, permission, installation, and verification contracts from before the Mac/Linux native transition. This is not the current canonical source for POSIX hosts."
---

These are contracts and verification records from before ADR 0188. The current canonical source is the [native POSIX contract](../development/remote-desktop-posix.md).

## OS adapters

| Host | Capture/execution | Input |
| --- | --- | --- |
| macOS 13+, x64/arm64 | ScreenCaptureKit on a logged-in Mac + Screen Recording permission; Chromium on initial failure | CoreGraphics and Accessibility permission. Preserves modifier flags and middle-button dragging |
| Linux X11, x64/arm64 | Electron using the same DISPLAY/Xauthority | libX11 and libXtst/XTest. Converts accumulated wheel input to notches |
| Linux Wayland, x64/arm64 | Chromium/PipeWire screen sharing approval | Separate input approval through the D-Bus RemoteDesktop portal. No XWayland injection fallback |
| Windows/WSL | Persistent Node + D3D11/Media Foundation hardware H.264, WSL interop | Windows SendInput and actual pixel cursor position. Does not use the Linux screen |

`runtime-support.mjs` owns the requirements for running Electron 44.3.0 on Mac/Linux. The macOS 13/Darwin 22 and x64/arm64 requirements are checked before installation, during readiness queries, and during Mac permission setup. Installation is not repeatedly attempted on unsupported operating systems ([Electron 44 support requirements](https://www.electronjs.org/blog/electron-44-0)).

`host-permissions.mjs` allows only media, display-capture, and local network permissions for direct WebRTC, in both permission requests and checks from the fixed local renderer. It denies requests from other WebContents, subframes, or during shutdown, and denies all other permissions. OS Screen Recording and portal approval requirements, Electron sandboxing, contextIsolation, and navigation blocking remain in place. `display-capture` is a permission Chromium checks separately from media ([Electron session API](https://github.com/electron/electron/blob/v44.3.0/docs/api/session.md)).

The Mac connection path checks Accessibility permission without requesting it and directs the user to `desktop-setup` if it is missing. On shutdown, it immediately sends stop to the renderer to close video tracks and WebRTC first, then waits up to 300 ms for a completion response. It waits up to 500 ms for input close and waits for native capture close in parallel, then closes the window, temporary profile, and host. This prevents the Linux path where destroying the window first while capture remained active delayed normal shutdown. The parent's forced termination time limit also remains in place.

Absolute coordinates are not injected because the ScreenCast streams for Wayland capture and the input portal differ. Joystick relative movement, clicking, dragging, and scrolling are used. If the compositor lacks a RemoteDesktop portal, it exits with an error. Without keyboard permission, only the pointer is available. With PipeWire, the OS picker may return a single sharing source.

Wayland Session Closed events, D-Bus errors, and input denials are stored in the adapter's `check()`. The existing 250 ms host watchdog checks this and terminates the session, video, and input without requiring further user input. The bus is cleaned up even if portal Close fails. Permissions are valid only for the lifetime of the approved portal session ([RemoteDesktop portal contract](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html)).

Paste writes only the user-submitted text, up to 4096 characters, to the server clipboard and sends Ctrl+V/Mac Cmd+V. Bidirectional clipboard synchronization, audio, and file transfer are not implemented. Local Esc closes auxiliary windows, fullscreen, and the viewer in that order; use Remote Esc in the tools to send the key remotely.

## macOS capture and installation contract

### Mac terminal permission preparation

Only on macOS, `permissions.mjs` checks that the owner UID of `/dev/console` matches the current non-root UID, then runs `permissions-host.mjs` with the Electron executable from the same installation path used for actual remote connections. It does not run the permission helper on other operating systems. The execution argument is fixed to one of check/accessibility/screen and is not wrapped in a shell. It removes `NODE_OPTIONS` and `ELECTRON_RUN_AS_NODE` and uses a unique temporary profile. It does not modify app binaries, signatures, or the permission database.

The helper checks permissions with `systemPreferences.isTrustedAccessibilityClient` and `getMediaAccessStatus('screen')` and requests only missing permissions using `isTrustedAccessibilityClient(true)` or CoreGraphics `CGRequestScreenCaptureAccess`. It opens the corresponding Privacy settings URL without creating a screen list, capture, input adapter, or renderer. Opening settings does not grant permission; only confirmation of the granted state counts as completion. File installation markers and permission state are kept separate.

It requests each permission only once, Accessibility first and then Screen Recording, and rechecks in a **new Electron process** at 2-second intervals for up to 5 minutes (excluding process execution time). This path accounts for permission caching while the app is running and the OS requirement to quit and reopen ([Electron permission API](https://www.electronjs.org/docs/latest/api/system-preferences)). Status queries have a 10-second limit and requests a 30-second limit, without exceeding the remaining overall budget. OS termination/timeouts after displaying a request are deferred to the next status check and are not recorded as completion. Policy restrictions, query failures, and expiration of the overall wait are errors. Rerunning the same command reads the OS state again.

Ctrl+C and SIGTERM use AbortSignal to cancel the current child process and wait, then exit with 130/143. Temporary profiles are cleaned up after confirming child process termination. The helper also exits on stdin EOF, errors, or its 35-second watchdog. It does not terminate the server or existing remote sessions, or add public ports or background services.

Verification used 12 tests in `server/remote-desktop-permissions.test.ts` covering approval order, existing approvals, denial, restrictions, login mismatch, cancellation, paths/environment, actual child process termination, simulated Electron APIs, and shell flow. No actual Mac was available, so OS permission dialogs, TCC's actual app identification and permission persistence, and actual capture after approval are unverified. On a Mac, separately verify the sequence from unapproved → settings displayed → approval → completion → actual connection, and that requests are skipped on rerun.

### Capture module

Uses the custom `capture-macos.m` module according to [ADR 0148](decisions/0148-mew-macos-local-cursor.md). The ScreenCaptureKit API and module deployment target are macOS 12.3 or later, but the complete helper app currently supports **macOS 13 or later** according to Electron 44 requirements. It adds no separate services, accounts, or public ports.

- During helper preparation, `install-macos.mjs` compiles a dylib for the current Node CPU (Apple Silicon arm64 or Intel x64) using `/usr/bin/xcrun --sdk macosx clang`. Apple Command Line Tools and an SDK containing ScreenCaptureKit are required. After local ad-hoc signing and verification with `codesign`, it atomically replaces the temporary file. Compilation/signing failure is a preparation failure, and `.mew-ready` is not created. Reconnect after installing or updating CLT. The binary is an installation artifact outside the repository; source, headers, and installation scripts are included in `HELPER_FILES`.
- `capture-macos.mjs` calls a small C ABI through the existing Koffi dependency. ScreenCaptureKit asynchronous callbacks are handled on an internal Objective-C queue. Electron main also retains the library so native stop completion arriving after worker termination cannot access unloaded code. Closing during startup also stops the stream after startup completion.
- Matches Electron's `display_id` to `CGDirectDisplayID` and checks CoreGraphics logical bounds. The screen reflects scaling, but the OS conversion stage limits it to even dimensions of at most 1920×1080, 60 Hz, and BGRA. Input and pointer normalization use logical coordinates, so pixel scaling is not applied twice on Retina displays or a second display with a negative origin. Rotated displays also use the aspect ratio of the display bounds.
- `SCStreamConfiguration.showsCursor = NO` and `queueDepth = 3` exclude the cursor from the screen. The native queue retains only the latest unconsumed CVPixelBuffer and releases the previous surface. When the worker requests it, the screen is compared with the previous one accounting for row stride, and the full screen is copied into a V8-owned buffer only when changes exist. Idle responses contain no pixels and use the existing generated track, VP8, and direct WebRTC. GPU→CPU copies remain; zero-copy or hardware VP8 encoding is not guaranteed.
- Reads the global position from `CGEventGetLocation` and reads `CGCursorIsVisible`, then checks the shape and hotspot of `NSCursor.currentSystemCursor` on the AppKit main queue at up to 30 Hz. Images use premultiplied BGRA at logical size, limited to 128×128, and are sent as PNG only when changed. If querying the system shape returns nil on the current OS, the system arrow is used. `currentSystemCursor` and `CGCursorIsVisible` are deprecated public APIs; cursor shape and visibility require hardware verification on current macOS. No private APIs or global hide/show are used.
- Cursor shapes are not consumed before the first screen is obtained. The local cursor is enabled only after an initial frame probe of approximately 3 seconds succeeds. Initial API/permission/display failures fall back to the Chromium video cursor, and help shows the actual mode. During execution, stream termination, blank/suspended/stopped states, or changes in permissions, active user, display bounds, screen dimensions, or rotation cause termination with an error. The activity preventing idle sleep while connected is released on close. Lock screens, manual sleep, and pre-login screens are unsupported.

Sources: [Introduction to ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10156/), [Frame status](https://developer.apple.com/documentation/screencapturekit/scframestatus), [Cursor exclusion](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/showscursor), [System cursor](https://developer.apple.com/documentation/appkit/nscursor/currentsystem).

## Verification

Persistent host tests verify warmup without capture, process reuse after confirmed termination, isolation of responses and kills from old sessions, lease waiting when termination confirmation fails, and retries after startup failure. WebSocket tests verify authentication revocation, exclusive control, and rejection of relay/relay-input/frame-ack. Existing synthetic Chromium tests check direct WebRTC video and mobile input.

Notification checks verify that sending is blocked until the first decode and both input channels are ready, display occurs once per connection, reconnection works, responses after termination are ignored, and OS notification errors are isolated. Synthetic Chromium checks verify the host notification signal over an actual WebRTC reliable channel; the OS popup itself is checked separately on actual hardware.

On 2026-10-01, 54 notification, connection readiness, installation, WebSocket, input, and synthetic Chromium checks and Windows native compilation passed. In an isolated Windows Node process, notification startup and cancellation were repeated 32 times, with no increase in the process handle count. Windows popups on the actual logged-in screen and Mac/Linux OS notification display remain items to verify after the user applies the changes.

On the same day, the Mac/Linux improvements passed 40 OS-specific installation, permission restriction, input, readiness, and notification checks and 2 synthetic Chromium UI checks. Actual Electron, X11 capture/XTest input, and Chromium direct WebRTC checks in a separate Linux process also passed. Verification covered the first video, both input channels, one D-Bus notification request per connection, key/button injection, release after authentication revocation, normal exit code 0, reconnection, normal exit after closing the viewer, and absence of server video relay. Testing used Xvfb and a separate D-Bus notification service, so it did not include physical GPU performance or actual desktop notification popups. Mac ScreenCaptureKit hardware tests were skipped because no execution environment was available; actual Mac TCC/notifications and Wayland compositor approval/revocation verification also remain outstanding.

Linux hardware-path testing is opt-in through `server/remote-desktop-linux.test.ts`. Install dependencies and Electron in a separate helper copy, and prepare Xvfb, xauth, dbus-run-session, libX11, libXtst, and a test Chromium installation. The commands below inject input only into dedicated Xvfb/D-Bus sessions, rather than the actual user desktop. Video is received only in memory, and the production helper and server are not modified.

```bash
env -u WAYLAND_DISPLAY -u ELECTRON_RUN_AS_NODE \
  MEW_DESKTOP_TEST_LINUX_HELPER=/absolute/path/to/isolated-helper \
  MEW_DESKTOP_TEST_LINUX_ISOLATED=1 \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x720x24 -nolisten tcp' \
  node --test server/remote-desktop-linux.test.ts
```

