---
title: "Remote desktop input and feedback timing"
description: "Accepts transition-only input barriers, immediate leading motion, bounded decode-recovery retries, and a stable Rust RTCP media clock. Records compatibility, receiver interval diagnostics, and measurement gates for larger pipeline changes."
created: "2026-11-08"
updated: "2026-11-08"
---

## Status

Accepted. Extends the latency controls in [ADR 0024](0024-remote-desktop-fhd-pipeline.md) and the Rust transport in [ADR 0059](0059-remote-desktop-rust-engine.md). Current behavior belongs to the [architecture contract](../development/remote-desktop.md); actual checks belong to the [follow-up work record](../work/remote-desktop-input-feedback-latency.md).

## Context

The input sender waited for rAF before sending otherwise eligible motion. Every reliable snapshot also advanced the ordering epoch, so a delayed unchanged heartbeat could hold newer wheel or pointer input behind reliable retransmission. Both native receivers already use seq to reject old snapshots and epoch to protect key/button transitions.

Decode feedback could request another large recovery IDR every 200 ms. The Rust sender also based RTCP report time on the last transmitted packet, allowing packet pacing to distort the relationship between media time and wall time. Network RTT alone exposes none of these waits.

## Decision

Send eligible leading motion directly from its input event, retaining the shared FPS deadline and rAF coalescing. Advance input epoch only for actual key-set or button-state changes. Unchanged heartbeats and reliable motion recovery still advance seq and renew the receiver lease. Preserve key-array order when ownership changes without changing the held set. The v1 wire format and receiver checks remain compatible.

Preserve prompt recovery for a received but undecoded frame, then limit accepted stats-driven retries to one per second. Allow startup time for the initial IDR, retain unresolved stalls across idle feedback, and clear recovery state when decoding progresses. Suppressed legacy requests consume no retry interval. PLI/FIR remains independent.

Anchor the default Rust sender's RTCP media clock once at GPU output, before pacing. Use Windows encoder age to relate the read time to the media timestamp; retain a fixed first-read offset on POSIX without that metadata. Advance report time independently of packet sends and recovery, following [RFC 3550 section 6.4.1](https://www.rfc-editor.org/rfc/rfc3550#section-6.4.1). Legacy reporting remains delegated to libdatachannel.

Expose interval receive-buffer and decode times beside existing stats. Omit unavailable or idle measurements. These are separate stages, not a total input-to-display measurement.

## Alternatives and rationale

Increasing input send frequency would add traffic without removing the heartbeat dependency. Removing all epoch checks would permit motion to overtake a click or modifier transition. Retaining the transition barrier while excluding unchanged snapshots removes the avoidable dependency.

Dropping old encoded deltas after a slow IDR could break H.264 references and cause repeated recovery. A safe capture/encoder drain design needs explicit reference recovery and measurements before implementation. WebCodecs, direct virtual-swapchain capture, and a different encoder backend likewise require evidence identifying the dominant stage.

## Consequences

Regression coverage must retain key/button ordering, cumulative wheel recovery, held-key ownership, and heartbeat release behavior. Sender reports must remain independent of pacing across idle periods, drops, and timestamp wrap. A sustained decode stall retries less often, trading additional retry time for fewer large recovery frames.

Hardware latency, browser presentation time, and network congestion still require controlled measurements. Native changes need an updated helper; local tests and the application build do not install or activate it.
