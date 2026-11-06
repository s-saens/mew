---
title: "Reduce remote desktop latency and improve virtual display modes"
description: "Tracks completed phase-1/2 source implementation for remote
  desktop transport, Windows native input and capture, and virtual display
  modes; retains real-device latency, signed-driver, and conditional
  receiver/swapchain acceptance gates."
done: "false"
tags:
  - 최적화
startDate: "2026-11-07"
date: "2026-11-07"
---

## Purpose and scope

Reduce input-to-display latency and allow high-refresh virtual desktops independently of a physical monitor's refresh rate or power state. Phase-1/2 code is implemented; acceptance remains open for driver build/install and comparable real-device measurements. See the [work record](../docs/work/remote-desktop-latency-and-virtual-modes.md) for actual checks and limits.

Current contracts: [feature behavior](../docs/features/browser-android-remote-desktop/remote-desktop-and-touch-input.md), [architecture](../docs/development/remote-desktop.md), [Rust engine](../docs/development/remote-desktop-rust.md), [virtual display](../docs/development/remote-desktop-virtual-display.md). The original [StarDesk comparison](../docs/research/remote-desktop-stardesk-gap.md) remains research, not current performance evidence. [ADR 0130](../docs/decisions/0130-remote-desktop-latency-and-virtual-modes.md) records this implementation's choices.

## Candidate assessment and priority

| Candidate | Initial bottleneck and expected benefit | Scope and decision |
| --- | --- | --- |
| Remove accumulated frame/input waits | WGC already had two capture buffers and at most three encoder inputs, but receiver smoothing, small-frame pacing, Node's 4 ms input event poll, fixed capture polling, early return after output, and an extra RGB texture copy added opportunities for delay. The original 15–50 ms reduction estimate remains unmeasured. | Phase 1, highest priority. Implement within the existing browser/direct-WebRTC path. |
| Match virtual resolution and refresh to the requested mode | The in-house UMDF/IddCx driver initially advertised only 1920×1080 at 60 Hz. Higher stream FPS alone could not raise its composition rate. | Phase 2, core change. Expose twelve modes and select from negotiated bounds/FPS. Higher modes require more GPU/network capacity and a rebuilt, signed driver. |
| Share virtual swapchain surfaces directly with the encoder | The driver releases swapchain surfaces and the user-session host recaptures with WGC `CreateForMonitor`. Sharing might remove that extra capture stage. | Conditional phase 3. Measure `captureUs` after phases 1/2 before accepting cross-process handles, security, GPU LUID, synchronization, and lifetime complexity. |
| Add a native receiver | A dedicated app could control decoding/display timing more closely than browser video, with platform-specific development and installation costs. | Deferred. First measure receiver buffering after the playout-delay hint; consider WebCodecs before a native app. |

## Phase 1: transport, input, and capture

- [x] Negotiate `http://www.webrtc.org/experiments/rtp-hdrext/playout-delay` and add min/max-zero RTP headers only for an accepted one-byte mapping. Preserve the 1,192-byte packet limit and ordinary-header fallback. This is a best-effort receiver hint.
- [x] Allow suitable ordinary delta frames to send immediately within a bounded wire-byte allowance, charging token debt. Keep IDR, large-frame, congestion, reference-order, and expiry controls.
- [x] Route Windows input snapshots from Rust RTC callbacks directly to the native input adapter. Keep session/negotiation identity, generation and authorization lease, locked-desktop rejection, ordering, rate limits, and key/button releases. Node retains clipboard operations; POSIX and legacy input retain their existing path.
- [x] Continue new encoder input in the same GPU poll that returns an encoded output. Retain surplus output credits, remove the intermediate RGB copy, retain WGC surfaces until GPU read completion, and wake Rust from WGC/MFT events with bounded control waits.
- [x] Review vendor low-latency options. Keep the existing MFT low-latency/CBR/no-B-frame/VBV requests; defer a separate NVENC backend until encoder timing demonstrates a remaining queue. See ADR 0130 for alternatives and rationale.

## Phase 2: virtual resolution and high refresh

- [x] Advertise 1920×1080, 2560×1440, and 3840×2160 at 60, 120, 144, and 240 Hz.
- [x] Pass negotiated dimensions/FPS through protocol v2 acquisition and exact Windows activation. Select the largest fitting advertised resolution and highest advertised refresh not exceeding requested FPS, with minimum 1080p/60 Hz. Preserve physical display paths, positions, lease ownership, and actual desktop input bounds.
- [ ] Rebuild the changed driver using WDK/IddCx, sign and install its v2 package, then validate real output size/refresh and monitor-off operation. The user performs signing and installation.

## Phase 3: measurement-gated alternatives

- [ ] Measure `captureUs`; design safe driver-swapchain sharing only if WGC remains a significant bottleneck.
- [ ] Measure interval `jitterBufferDelay / jitterBufferEmittedCount`; evaluate WebCodecs (`VideoDecoder` with `optimizeForLatency: true` and a desynchronized canvas) before a native receiver only if browser video buffering remains a bottleneck.

## Acceptance and verification

- [ ] Compare before/after capture age, encoding, packet-send wait, interval jitter-buffer residence, and input-to-display response on the same hardware, browser, quality, and network. No actual latency gain is claimed yet.
- [ ] Verify `gpu:99` at 120/144 Hz and changed resolution through actual capture FPS and decoded output dimensions. Advertised 240 Hz does not establish browser/GPU support for a 240 FPS stream.
- [x] Add regression coverage for authorization/revocation, lost/reordered input and releases, virtual lease ownership/expiry, mode selection, physical-display preservation, and scaled input coordinates. Local results and optional checks are recorded in the work record.
- [x] Update owning contracts, decision records, and implementation records in the same task.
- [x] Complete final required build, lint/type, and documentation checks and record exact outcomes in the work record.

No server execution/restart, launcher execution, deployment, driver installation, or signing is authorized for the agent. Local compilation and fixtures do not apply these changes to the running native helper.
