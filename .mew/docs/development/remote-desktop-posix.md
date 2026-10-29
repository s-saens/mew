---
title: "Mac/Linux Resident Native GPU Host"
created: 2026-10-01
updated: 2026-10-24
description: "Defines Mac/Linux resident Node control, the Rust video thread, the existing hardware H.264 GPU ABI, resolution and high refresh rate negotiation, and direct input. Distinguishes common transport policies and OS-specific permissions, installation, and session lifetimes, as well as Rust synthetic verification and the scope of actual GPU behavior that remains unverified."
상위파일: "MOC.md"
---

[Common transport and input contract](remote-desktop.md) · [ADR 0188](../history/decisions/0188-mew-posix-native-desktop.md)

## Common Architecture

`desktop-resident-host.ts` warms up the prepared dedicated Node host at server startup on all supported operating systems. It shares libdatachannel H.264, direct input channels, authentication leases, and session IDs with `native-host.mjs`, `rust-direct.mjs`, and the [Rust engine](remote-desktop-rust.md). It rejects TURN and WebSocket video relaying. While idle, it retains modules and device objects but stops capture, encoding, frame polling, and input injection. It queries the latest screen on each connection, and starts a new session only after capture termination is confirmed.

In the default path, a dedicated Rust thread in the same process calls the existing GPU ABI and owns everything from compressed output through RTP pacing and WebRTC transmission. It retains the native queue that drops stale frames at the raw surface stage and the limit of two compressed frames. It does not read the next output while transmitting an IDR. Neither uncompressed pixels nor compressed frames are passed through JS IPC, and hardware failure does not trigger fallback to a software encoder. The existing worker/ACK path selected with `MEW_DESKTOP_ENGINE=legacy` remains available for comparison and recovery.

## Video Path

Mac passes ScreenCaptureKit NV12 CVPixelBuffers from `gpu-macos.m` directly to VideoToolbox. It requires hardware, real-time, low-latency encoding and does not use B-frames. It warms up the Metal device and does not read raw pixels on the CPU. It retains the latest surface so it can generate a requested keyframe after the WebRTC track opens, even for a static screen. Internal GPU conversions and encoder copies remain, so fully zero-copy operation is not guaranteed. [Apple low-latency encoding](https://developer.apple.com/videos/play/wwdc2021/10158/).

Linux uses the GStreamer pipeline in `gpu-linux.cpp`. It requires VA-API `vah264enc` or NVENC `nvh264enc` and disables B-frames and lookahead. X11's `ximagesrc` still involves CPU reads and GPU uploads. Wayland passes the portal's PipeWire FD to the capture pipeline. The VA path uses GPU upload/conversion, while the NVENC Wayland path uses GL import and CUDA interop. Copies vary with actual compositor/plugin negotiation, so Linux as a whole is not described as zero-copy. [VA encoder](https://gstreamer.freedesktop.org/documentation/va/vah264enc.html) · [NVENC encoder](https://gstreamer.freedesktop.org/documentation/nvcodec/nvh264enc.html).

Requests can specify up to 3840×2160, 240FPS, and 50Mbps; the default is 1080p, 60FPS, Balanced (6Mbps). The actual mode is adjusted to the browser's receive level and hardware initialization results. [Common negotiation and transport control](remote-desktop.md#transport-and-latency) owns High/Baseline selection, the level 5.2 fallback payload, bounded RTP pacing, receiver feedback, and adaptive bitrate. Compressed access units are limited to 4MiB and are not transferred to Node in the default Rust path. The POSIX ABI was raised to 2, and existing installations must be prepared with the new module.

Mac applies the negotiated FPS to the ScreenCaptureKit minimum interval, VideoToolbox ExpectedFrameRate, and frame duration, and selects High or Baseline AutoLevel. The common sender checks the actual SPS. Linux X11 applies the capture caps framerate, while Wayland is limited by the PipeWire frequency supplied by the compositor. Linux fixes the selected profile and level in the output caps and allows VA CABAC/8×8 transform in High. NVENC ultra-low-latency tune and a two-frame VBV are set only when those properties are available. The target GOP interval is 5 seconds, and immediate IDR requests remain enabled. These settings do not change the physical display's refresh rate or the Wayland compositor's source frequency. Only active workers poll, at 1ms for 120FPS or higher and 2ms otherwise; this is not an event-driven wake-up implementation.

Once the first video and the reliable/unreliable input channels are ready, it requests a connection notification once. Mac uses UserNotifications, and Linux uses D-Bus Notifications. OS notification denial or an unavailable service is not treated as a transport failure. POSIX currently includes the actual cursor in the video and does not claim the same latency characteristics as Windows' independent local cursor.

RTT relearning, time-based bitrate recovery, preservation of the original FHD size, and stage-by-stage diagnostics follow the [common contract](remote-desktop.md#stage-by-stage-diagnostics-and-fhd-verification). POSIX also provides worker poll cost, backpressure, and pacer/receiver aggregates, but is not described as providing Windows-specific WGC/MFT timings or configuration bitmasks. This change retains POSIX ABI 2 and includes new JS modules in the helper installation list and content hash. Processing overlap performance on real Mac/Linux GPUs is unverified.

## Installation and Permissions

`install-native-runtime.mjs` atomically copies the currently supported Node to a dedicated path and preserves that version's LICENSE. It only checks binding imports and does not start screen capture, GUI, or input. The helper readiness marker is written only after compilation, ABI checks, and Mac signing by `install-posix-video.mjs` and `install-rust-engine.mjs` all succeed. Installation and application to the production server are performed through user commands.

All operating systems additionally require Rust stable, CMake, libclang, a C++ compiler, and Perl. Sources and notices for locked dependencies are preserved in `rust/vendor/` in the installation folder. Follow the [detailed installation and verification instructions](remote-desktop-rust.md).

| OS | Required preparation |
| --- | --- |
| macOS 13+, arm64/x64 | Apple Command Line Tools, macOS 13 or later SDK, VideoToolbox hardware H.264, logged-in desktop |
| Linux X11, arm64/x64 | C++17 compiler, pkg-config, GStreamer 1.24 or later development libraries (app/video), X11/Xrandr development libraries, XTest runtime, VA or NVENC plugins, graphics driver |
| Linux Wayland, arm64/x64 | Common Linux compilation and GPU preparation, PipeWire source, GL/CUDA or VA conversion plugins, ScreenCast/RemoteDesktop portal, usocket build for dbus-next Unix FD passing (Python/C++ tools) |

Linux runs in the logged-in user's DISPLAY/Xauthority or Wayland/D-Bus environment. It refuses control if neither the `org.freedesktop.ScreenSaver` nor `org.gnome.ScreenSaver` service is available to check screen locking. Compositors without these services require a separate adapter with verified lock safety.

Mac checks Screen Recording and Accessibility permissions using its own `MewDesktop.app`, the fixed identifier `dev.liiiiv.mew.desktop`, and the same executable. `permissions-native.mjs` only calls CoreGraphics and Accessibility APIs and does not start capture or input. It requests only missing permissions once, in the order Accessibility → Screen Recording, then rechecks in a new process. Existing Electron permissions are not assumed to carry over to the new app. Installation uses ad-hoc signing; distribution notarization and formally signed packages are not provided. Actual TCC persistence behavior must be checked on a real Mac.

## External Direct Connections and Network Approval

Mac/Linux also uses the common native STUN retries and temporary PCP/NAT-PMP/UPnP mappings for active ICE UDP ports. Linux uses `iproute2` at a standard absolute path instead of relying on a restricted service PATH, and follows the interface and preferred source selected by the kernel. Mac queries IPv4 routes using the fixed `route` tool. It does not detour through an arbitrary LAN router on VPN, IPv6-only, or gatewayless routes. Missing tools and route lookup failures are also reported as diagnostic states. The [external direct connection contract](remote-desktop-connectivity.md) owns OS-specific lookups, leases, cancellation, and verification.

The Mac app provides `NSLocalNetworkUsageDescription`. On macOS 15 or later, Local Network permission may be required separately from Screen Recording and Accessibility. Follow approval for the responsible app identified by the system; exceptions for Terminal/SSH and similar contexts are not considered permanently inherited by the app. Mac firewall incoming connections and Local Network settings, and Linux active UFW/firewalld UDP policies, are included in failure recovery guidance. Read-only lookups do not block warmup or connections. POSIX policies and global port allowances are not changed automatically, and this does not replace user network approval.

## Safe Lifecycle

Mac checks the logged-in console UID, Screen Recording, Accessibility, session lock, and display state. Linux stops input and capture on lock D-Bus signals and bus errors. Wayland authorizes the ScreenCast source and input within the same RemoteDesktop session. The PipeWire socket FD is received through actual SCM_RIGHTS passing and checked to confirm it is a socket; standard input/output FDs are not owned. Portal closure, cancellation, and D-Bus errors trigger watchdog termination without further input. [Portal contract](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html).

Permission revocation and closure bypass the approval queue to abort immediately and release keys, buttons, and WebRTC. A stop ACK is sent only after native capture stops and encoder cleanup succeeds. It waits for Mac's asynchronous ScreenCaptureKit stop to complete and does not reuse the host if confirmation fails. Portal and FD cleanup also occurs on worker errors. Each native WebRTC attempt owns its receive-only motion/control channel wrappers until the session ends and closes them explicitly. A common issue where JS GC closed channels prematurely and disconnected the connection was fixed. Session IDs prevent notification, input, frame, and clipboard completions from previous sessions from affecting a new session.

On parent termination or SIGTERM, it revokes approval, waits up to 3.5 seconds for native capture and NAT cleanup, and closes the worker, OS adapter, and RTC. Completed race timers are removed. Forced termination by the parent is set to 4 seconds after SIGTERM to prevent the previous 500ms shutdown path from cutting off router cleanup early. A timeout is not treated as successful host reuse.

Paste uses only the submitted text, up to 4096 characters. Mac uses NSPasteboard, and Linux uses fixed xclip/wl-copy executables. Clipboard child processes are cleaned up at session end; after completion, the current session and permissions are rechecked before injecting Ctrl+V/Cmd+V. There is no bidirectional synchronization.

## Verification

2026-10-07 During video configuration, pacing, and capability negotiation verification, the Linux production and test C++ modules were compiled separately without warnings. Isolated Xvfb checks confirmed H.264 video targeting 144FPS, input, permission revocation, and reconnection in the same PID. They also confirmed that a 240FPS request connects with a 165FPS target using current Chromium's level 5.2 fallback payload. This is an integration check of configuration and actual native transport, not a measurement of physical GPU display at 144/165 frames per second or input-to-display latency. Mac SDK and real-machine execution for this change were not performed.

2026-10-01 Passed 51 checks covering installation, simulated Mac permissions, resident lifetimes, OS routes, notifications, and direct transport, plus 2 synthetic browser checks. Also passed 1 isolated Linux X11 integration check and 1 actual Unix FD passing check. TypeScript (app/node), lint, documentation link, and diff checks passed; lint retains 12 existing warnings. Linux production and test-only modules are compiled separately with warnings treated as errors. Mac source syntax is checked for Intel and Apple Silicon using the macOS 13.3 SDK. Actual Mac linking, TCC, and VideoToolbox execution, and physical Linux GPU performance could not be checked in this environment.

`server/remote-desktop-linux.test.ts` uses dedicated Xvfb and D-Bus instances to check actual native X11 capture, the first H.264 WebRTC display, XTest input, notification requests, authentication revocation, termination without input on OS lock, reconnection in the same PID, and graceful shutdown. The software x264 encoder is allowed only in a separate `MEW_GPU_TEST` build. Production builds allow only hardware encoders, and this test does not support claims of measured ultra-low latency.

Request the high refresh rate negotiation check with `MEW_DESKTOP_TEST_VIDEO_FPS=144`. If the browser's negotiation ceiling differs from the request, specify the expected applied value with `MEW_DESKTOP_TEST_VIDEO_EXPECTED_FPS` (a current Chromium FHD 240 request yields 165). This variable is an expected value for the isolated test, not a production setting.

`server/remote-desktop-portal.test.ts` uses an isolated simulated D-Bus portal service and actual usocket SCM_RIGHTS. It checks approval, source dimensions, FD duplication, and release of owned FDs within the same session. This is not equivalent to actual Wayland compositor approval, DMABuf negotiation, or GPU input.

2026-10-02 The external direct connection review passed connection, synthetic input, reconnection, and deletion of both mappings using Linux native libdatachannel, Chromium, actual kernel route lookups, and isolated UDP NAT. The execution environment was a Linux process in WSL; this check did not run a Windows host or actual Linux GPU capture. Simulated checks of Mac/Linux routes, permission descriptions, firewall diagnostics, and shutdown lifetimes also passed. 65 related automated checks passed, while 1 opt-in Windows rule/UAC check was skipped in this run. Windows/Linux native NAT checks also verified delivery of new input after GC during an active connection. The Windows hardware H.264 reconnection regression check also passed (approximately 730ms to first display and 163ms for reconnection in the same process on that PC). These figures are not guarantees of internet latency or input-to-display latency. Verification of actual Mac network permissions, firewall and hardware execution, and LTE/5G phones remains outstanding.

```bash
env -u WAYLAND_DISPLAY -u ELECTRON_RUN_AS_NODE \
  MEW_DESKTOP_TEST_LINUX_HELPER=/absolute/path/to/isolated-helper \
  MEW_DESKTOP_TEST_LINUX_ISOLATED=1 \
  dbus-run-session -- xvfb-run -a -s '-screen 0 1280x720x24 -nolisten tcp' \
  node --test server/remote-desktop-linux.test.ts
```

First display time, reconnection, input-to-display latency, lock/permission revocation, static-screen keyframes, screen rotation/disconnection, and notifications must be checked separately on real Mac/Linux GPUs. Headless virtual displays for Mac/Linux are outside the scope of this change. Previous Electron verification records are preserved in the [historical document](../history/remote-desktop-posix-electron.md).
