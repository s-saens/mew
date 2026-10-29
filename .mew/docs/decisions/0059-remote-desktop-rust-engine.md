---
title: "Consolidate remote desktop video processing and transmission on a Rust thread"
description: "Decision to move compressed-frame IPC, JS RTP generation, and timers to a dedicated Rust thread while reusing the existing GPU C ABI. Retains Node authentication, negotiation, input, and existing transport policies, and records installation tools, dependency source preservation, synthetic verification, and the scope unverified on real hardware."
created: 2026-10-24
updated: 2026-10-24
---

## Status

Accepted. This is a decision based on code and isolated synthetic verification, not a decision confirming production application or a performance advantage on actual GPUs.

## Background

Existing capture and hardware encoding already run in C++/Objective-C and on the GPU, but compressed output was passed from a JS worker to Node, and RTP generation and pacing were handled by the JS event loop. Retain the overlapping processing of two frames from [ADR 0024](0024-remote-desktop-fhd-pipeline.md) while reducing dependence on the JS event loop for frame delivery and scheduling. Do not assume that changing the language to Rust alone also speeds up the GPU, network, or decoding.

## Decision

A dedicated Rust cdylib thread in the same process as the Node host owns GPU ABI calls, compressed output, Annex-B inspection, RTP generation, pacing, and direct WebRTC transmission. Do not pass uncompressed pixels, compressed frames, or RTP packets to JS. Retain the existing GPU surfaces, hardware encoders, and OS ABI.

Node owns authentication, sessions, SDP negotiation, STUN retries, NAT preparation, congestion policies, and input permission checks. Do not move all input handling to Rust; continue querying the Windows cursor in a separate JS worker. Retain the maximum of two frames, original deadlines, IDR recovery, and RTT adaptation policies, and enforce generation changes and independent lease checks in Rust as well.

Rust is the default, and `MEW_DESKTOP_ENGINE=legacy` can explicitly select the existing path. Do not fall back automatically on failure. This decision replaces the JS frame IPC, ACK, and pacing locations in the default path of ADR 0024 without changing quality or frame lifetime policies. The [Rust engine](../development/remote-desktop-rust.md) and [common transport](../development/remote-desktop.md) own the current detailed contract.

## Rationale and Impact

Confirmed FHD video reception using a synthetic GPU ABI on Linux, actual libdatachannel, and Chromium, with video continuing even when Node was paused for 400ms. Checked reconnection after stopping and independent termination when the lease was not renewed. Rust RTP, queue, and acknowledgment unit tests and Clippy also passed. Performance and execution on actual GPUs, Windows/MSVC, Mac, and external networks remain unverified, and no latency improvement factor is claimed from the language change alone.

The installation environment additionally requires Rust, CMake, libclang, C++, and Perl, increasing initial compilation time. Preserve the source and licenses of locked dependencies and the limited Windows build-path adjustments in the installation folder. Distinguish the versions and notices of the existing npm transport library from those of libraries statically linked by Rust. Verify the video boundary first while avoiding the cost of fully rewriting OS capture, and measure actual display latency later using the same screen, quality, and network.
