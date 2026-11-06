---
title: "Reduce remote desktop queueing and select high-refresh virtual modes"
description: "Adopts negotiated zero playout-delay hints, bounded delta-frame bursts, Windows Rust callback input, WGC/MFT wakeups and direct texture conversion, and protocol-v2 virtual modes. Partially supersedes ADR 0059 input placement and extends ADR 0024 without claiming measured hardware latency gains."
created: "2026-11-04"
updated: "2026-11-04"
---

## Status

Accepted for implementation. Local regression checks and Windows GPU compilation are separate from driver compilation, signing, installation, and physical-device acceptance. The [work record](../work/remote-desktop-latency-and-virtual-modes.md) owns verification evidence.

## Context

[ADR 0059](0059-remote-desktop-rust-engine.md) moved video transmission off the Node event loop but kept input there. Input therefore still passed through the 4 ms event poll. The Windows GPU poll returned immediately after an encoded output and copied each WGC surface into another RGB texture. The in-house virtual driver exposed only 1080p at 60 Hz even when a viewer requested more. Existing settings and negotiation already support up to 4K and 240 FPS, subject to codec and device limits.

## Decision

The default Rust path offers a playout-delay RTP extension and sends min/max zero only when the answer accepts a compatible extension. Permit complete, bounded ordinary delta frames to borrow pacing credit; repay their wire cost before another burst. Retain ordinary pacing for IDRs, large frames, and congestion. Keep reference order, two compressed-frame capacity, expiry, IDR recovery, and quality adaptation.

On Windows, validate input snapshots and inject through a native adapter directly in the RTC callback. Keep generation and lease checks, full key/button state, loss recovery, rate limits, lock checks, synchronous revocation, and independent timeout releases. Node continues authentication, negotiation, clipboard operations, and congestion policy. POSIX and explicit legacy input keep their current receiver. This partially supersedes ADR 0059's decision to keep all input checks in Node.

Signal a session-owned wait event from WGC frame arrivals, asynchronous MFT events, and released encoder surfaces. Use a bounded native wait so control, pacing, and authorization deadlines remain responsive. Consume at most one access unit per ABI read while also replenishing encoder input. Convert directly from a retained WGC texture; wait for its GPU read fence before returning it to the frame pool. Late callbacks retain session state rather than an Engine pointer.

Expose twelve virtual display modes: 1080p, 1440p, and 2160p at 60, 120, 144, and 240 Hz. Protocol v2 carries requested bounds and FPS. Choose an advertised mode, apply exact timings only to Mew's extended output, and preserve existing display paths and positions. Reject cloned sources and failed exact activation. Keep device-file ownership, ACLs, leases, and cleanup. A 720p stream scales the minimum 1080p desktop; 165 FPS uses the 144 Hz display mode. This does not add arbitrary aspect ratios or automatic window movement.

## Alternatives and rationale

Increasing the pacer's permanent rate or removing all bounds would allow repeated bursts and buffer growth. Borrowing a finite amount and retaining congestion suppression shortens suitable frame sends while preserving a sustained rate limit. The receiver's zero-delay hint remains best effort.

Sharing UMDF swapchain handles directly with the encoder would introduce cross-process surface ownership, access control, synchronization, and GPU identity requirements. Retain WGC until actual `captureUs` measurements justify that complexity. Likewise, retain browser video reception until interval jitter-buffer measurements justify a WebCodecs receiver. A native viewer remains deferred.

The current MFT path already requests low latency, CBR, no B-frames, and a small VBV where supported. NVIDIA's [NVENC guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/nvenc-video-encoder-api-prog-guide/index.html) exposes vendor-specific low/ultra-low-latency tuning, lookahead, and intra refresh. These require a separate encoder backend and capability checks; they are not generic MFT options. Defer that backend until `encodeUs` measurements show remaining encoder queueing. Intra refresh would also need to preserve the existing IDR-based reference recovery contract.

## Consequences

Windows input policy now exists in Rust as well as the legacy JavaScript implementation. Keep the wire format and key map shared, and regression-test ordering, releases, identity, and injection failure. The helper manifest must include the new native headers and Rust modules.

Updating the capture helper does not install a driver. Protocol v1 drivers must be replaced with a newly built, signed v2 package by the user. Higher refresh rates increase GPU and network demands; advertised modes and successful compilation do not prove actual high-refresh capture. Follow the [current architecture](../development/remote-desktop.md), [Rust contract](../development/remote-desktop-rust.md), and [virtual display contract](../development/remote-desktop-virtual-display.md).
