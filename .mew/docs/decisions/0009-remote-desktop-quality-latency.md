---
title: "Transmission Latency Limits for Quality-First Remote Desktop"
description: "Decision replacing quality-first fixed encoder settings and transmission waits of up to 2 seconds with coordinated encoder/transmission control and a 100ms limit for normal frames. Retains transmission limits and fixed receive-buffer compensation; subsequent processing overlap, RTT criteria, and recovery follow subsequent ADR 0024."
created: 2026-10-16
updated: 2026-10-20
---

## Status

Adopted. This is a decision based on code and isolated verification, distinct from actual production application and device performance verification.

Subsequent [ADR 0024](0024-remote-desktop-fhd-pipeline.md) supersedes the remaining serial processing of one frame at a time, repeated RTT-based slowdowns, and slow recovery. The following records the rationale for the 2026-10-16 decision; the current detailed contract follows the development documentation.

## Background

The 2026-10-08 quality-first implementation maintained the encoder bitrate while reducing only pacer throughput and waiting 500–2000ms per frame. Because transmission ACKs blocked processing of the next frame, large frames and long response delays could recur on slow connections.

We also reproduced erroneous continued reductions in speed-first bitrate based solely on fixed receive-buffer residence time. Separately, a small token bucket holding 2ms of budget discarded transmission budget when the send timer ran at 2–4ms intervals, reducing throughput even without congestion. This is a deterministic reproduction of the logic, not a measurement of all causes of latency on actual devices.

## Decision

- Both transmission priorities adjust encoder and pacer bitrates together during congestion.
- Quality-first limits transmission waits for normal frames to 100ms at currently supported FPS settings. Speed-first retains its existing shorter limit. Both modes allow 500ms for recovery IDRs.
- Quality-first prioritizes clarity by allowing a larger increase in receive-buffer delay, but does not promise fixed image quality. Fixed receive-buffer delay and idle samples are distinguished from actual increases in congestion.
- Limit pacing bursts to the transmission cost of at most two packets or 5ms of transmission budget. Absorb short timer delays without allowing unlimited transmission at frame boundaries or after long pauses.

This decision supersedes the previous quality-first fixed encoder settings and long frame waits. IDR recovery after discarding H.264 reference frames, direct WebRTC, permissions, input, and session lifecycles follow the existing contracts.

## Rationale and Impact

Fixed image quality and low latency cannot both be guaranteed regardless of available bandwidth. Instead of continuing to send stale screen content, preserve the resolution and requested quality mode while allowing compression and actual FPS to vary. Do not add a feature that dynamically changes encoder FPS to guarantee per-frame image quality.

Reduce incorrect slowdowns and waits in the current H.264 transmission path before introducing general-purpose recompression or new video codecs. HEVC, AV1, encoding/transmission overlap, and full congestion control require separate verification. The internal frame transmission limit is not an upper bound on total input-to-display latency; actual performance on GPUs and external networks, and performance relative to StarDesk, must be measured separately.

Current values, behavior, and verification scope follow the [Development Contract](../development/remote-desktop.md#transport-and-latency); user-selectable priorities follow the [Usage Guide](../../../docs/guides/remote-desktop.md#display-and-settings).
