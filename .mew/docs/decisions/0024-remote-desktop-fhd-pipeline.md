---
title: "Overlapped Remote Desktop Processing and Quality Recovery While Preserving Original FHD Dimensions"
description: "Replaces waiting for high-quality FHD transmission to complete with overlapping encoding and transmission for up to two frames, and adopts relearning during RTT increases, time-based recovery, Windows setting application checks, and per-stage diagnostics. Distinguishes the scope of replacing existing single-frame serial processing, synthetic verification, and unverified physical hardware behavior. Subsequent decision 0059 moves video processing to Rust while retaining frame limits and quality policies."
created: 2026-10-20
updated: 2026-10-24
---

## Status

Adopted. This decision covers code and isolated verification; it does not confirm production application, actual GPU behavior, or superiority over StarDesk.

Subsequent [ADR 0059](0059-remote-desktop-rust-engine.md) replaces JS worker handoff, ACKs, and pacing in the default path with a Rust queue and direct transmission on the same thread. This decision's frame lifetime, reference recovery, and quality adaptation policies remain unchanged.

## Background

The primary criterion was the condition that preserving original FHD dimensions produces slower responses than reduced-quality modes. The [investigation](../research/remote-desktop-stardesk-gap.md) identified a design that stops subsequent encoder processing until the transmission completion ACK, repeated slowdowns based on the session-wide minimum RTT and slow quality recovery, and ignored Windows setting return values.

[ADR 0009](0009-remote-desktop-quality-latency.md) reduced long transmission waits caused by prioritizing quality, misjudgments from a fixed receive buffer, and small pacing budgets, but left these structures in place. Lowering resolution or merely raising the bitrate ceiling is unlikely to resolve lost processing overlap and incorrect slowdowns.

## Decision

- Retain FHD resolution and requested quality. Overlap encoder processing and transmission without changing the contents or sizes of compressed access units.
- Limit frames handed off by the worker to one transmitting and one waiting, and control production using completion ACKs matching each frame's ID, session, and negotiation. Wait before producing the next frame while transmitting an IDR. Retain the initial GPU surface, reference lifetime, permission, and lease contracts.
- Include IPC and waiting time from initial production in the time limit for waiting frames as well. If references break, clear waiting frames too and recover with an IDR. Do not reorder references for new frames or create an unlimited queue.
- Distinguish the first slowdown caused by an RTT baseline increase from subsequent increases in the peak value, and relearn the baseline during normal progress with no other evidence of congestion. Retain slowdowns for loss, buffer growth, and internal backlog. Limit recovery in proportion to elapsed time and the requested ceiling.
- Propagate failures of required initial Windows CBR and bitrate settings and dynamic bitrate changes to higher layers. Do not treat read-only `S_FALSE` as success; diagnose whether optional properties are unsupported or applied, along with readable values where available. Raise the Windows ABI to 5 to accommodate extended metadata.
- Separate Windows cursor queries from video backpressure. Provide per-stage durations and send/receive aggregates through an optional diagnostic callback, and do not log screen or input contents or original timestamps.

This decision replaces the single-frame serial processing, repeated RTT slowdowns, and slow recovery remaining after ADR 0009. Retain normal/IDR transmission limits, finite bursts, direct WebRTC, authentication, and OS permissions. The [Current Transport Contract](../development/remote-desktop.md#transport-and-latency) owns detailed values and diagnostic fields.

## Rationale and Impact

Verify primarily against FHD 60 FPS and high-quality 12 Mbps. With a fake clock, 25 KB compressed frames, and a 8 ms synthetic encoder, throughput over the same 2 seconds is serial 105→overlapped 117 frames, with 0 frame drops in all cases. In a 4-second case with RTT 10→40 ms and continued normal reception, it recovers to the requested 12 Mbps instead of the previous collapse to 350 kbps. After repeated congestion, recovery to 12 Mbps with normal feedback at 200 ms intervals takes 55.6→8.2 seconds. This compares control logic and scheduling; it does not measure actual FHD video quality, displayed FPS, or input-to-display latency.

Maximum handoff memory increases from one compressed frame to two. Retaining the original deadline and reference recovery limits the risk of stale frames introduced by separating production and transmission. Exposing setting failures may cause encoders whose failures were previously silently ignored to terminate with initialization or change errors. Do not claim that unsupported optional properties were applied.

RTT relearning is a congestion control heuristic. It requires verification against actual bufferbloat and network variation and must not be regarded as an implementation of TWCC/GCC packet-arrival-based estimation. HEVC, AV1, 4:4:4, supplemental fine text detail, dynamic FPS, and expanded virtual display modes are outside this decision's implementation scope. Measure this path in an actual FHD environment first, then decide on further changes.

Verify the code, JavaScript regressions, isolated type checks, and Windows C++ syntax. Verify actual GPU capture, acceptance of encoder settings, external networks, StarDesk comparisons, and production deployment separately. The user performs the app build, server restart, and actual rollout of the companion app.
