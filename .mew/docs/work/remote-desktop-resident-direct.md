---
title: "Resident GPU remote desktop direct connection implementation and verification"
created: 2026-10-01
updated: 2026-10-01
description: "Records the implementation and local first-screen measurements for Windows/WSL resident GPU H.264 direct connections, subsequent virtual display integration, and conditions for user application, external network, signing, and headless verification."
상위파일: "_work.md"
---

# Implementation and application checks

[Current architecture](../development/remote-desktop.md) · [ADR 0185](../history/decisions/0185-mew-desktop-resident-direct-host.md)

The Windows/WSL implementation is complete and awaits user application and actual measurements on external networks. Removing Electron on Mac/Linux is outside the scope of this implementation. No production servers or installations were changed, and no commits were made.

**Follow-up implementation:** Added an in-house UMDF virtual display source and WGC capture according to [ADR 0187](../history/decisions/0187-mew-independent-virtual-display.md). Official signing, installation, and headless real-device verification remain. The verification scope and measurements for the new capture path follow the [Virtual display contract](../development/remote-desktop-virtual-display.md). The DXGI and timing measurements from the initial implementation below are preserved as results from that time.

## Verified behavior

- Compiled the Windows C++ GPU DLL in a temporary folder using MSVC and the Windows SDK. Processed the actual logged-in desktop with D3D11 and Media Foundation hardware H.264, and decoded and displayed it in Chrome `<video>`. No screen files, clipboard changes, or keystrokes were generated. The final checks used a viewer fixed to prevent cursor feedback from feeding back as idle input.
- In repeated local real-device tests with the host prewarmed, the first session displayed in about 383–761ms, and subsequent sessions in the same process in about 111–179ms. Follow-up verification including display list requerying and a fixed UDP port also passed. The sample size is small, and these are open-to-first-display times on the test page, excluding initial host startup and installation time.
- The resident host creates and releases capture and encoder resources for each session. It retains only devices while idle, and the worker's capture polling stops. Actual idle power in W was not measured. A 6-second sample of a separately prewarmed host showed cumulative CPU time of 0.046875 seconds (about 0.78% of one core), a working set of 82.52MiB, and dedicated GPU memory of 11MiB. This is a short initial sample and must not be used as a guarantee of long-term steady-state behavior or additional power consumption.
- Requests 1ms timer resolution only during active connections and releases it on returning to idle. A short average check of a Windows 4ms timer showed about 15.28ms by default → about 4.40ms when requested. The frame clock and MFT credit were also fixed, and forced refresh of a static screen with the hardware encoder produced 240 H.264 keyframes over 4.003 seconds with monotonically increasing timestamps. Do not treat this test as browser 60fps performance for an actual moving screen.
- Automated checks cover prewarming without capture, process reuse after shutdown confirmation, isolation of stale session IDs/kill requests, waiting for the lease when shutdown confirmation fails, and retries after startup failure. The server rejects relay, relay-input, and frame-ack. Real-device Windows pipe checks also verified login sessions, input/output, and parent termination handling for a child whose JS had stalled.

Of 106 related automated checks, confirmed 103 passed and 3 OS real-device opt-in checks were skipped. The Windows pipe and GPU opt-in checks were separately run on actual devices, passing 9 checks combined with the default checks in the same file. In the final fixed-UDP-port real-device test, the first session took 536ms and the next session took 130ms. TypeScript, lint, and documentation link/placement/MOC/ADR checks passed. UI checks included maintaining a connection without additional video payload during a 16-second pause in synthetic direct video, then resuming the screen and input.

## Checks before and after application

The user builds and applies the app and prepares the companion app. Windows requires C++ Build Tools, the Windows SDK, and hardware H.264 support. Follow the [Installation guide](../../../docs/guides/remote-desktop.md) and [Dependency and distribution requirements](../development/remote-desktop-distribution.md).

For internet and mobile phone environments, separately measure direct ICE connection success rates, initial screen p50/p95, input-to-actual-screen-change latency, sustained 60fps load, and recovery under loss and congestion. The direct path from WSL Linux Chromium to the Windows host failed in the current test environment, while Windows Chrome to the Windows host succeeded. These are local test results with public STUN disabled, and the cause is not definitively attributed to the firewall, NAT, or mDNS. Do not record networks unreachable without TURN as automatically resolved.

H.264 transmission uses bounded worker IPC, NACK, decode feedback, and simple bitrate control. libwebrtc GCC, hardware-specific pacing, adaptive resolution, and resumption while retaining the WebRTC session in the same browser are follow-up optimizations. Do not treat these additional features as implemented.
