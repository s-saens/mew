---
title: "Remote desktop input and feedback latency follow-up"
description: "Records the November 8 removal of input scheduling and heartbeat barriers, bounded decode recovery, stable Rust RTCP timing, and visible receiver-stage measurements. Includes local verification, existing documentation-check failures, and prioritized hardware-measurement gates."
created: "2026-11-08"
updated: "2026-11-08"
---

## Purpose and result

Reduce avoidable waits between input and visible desktop feedback. The existing phase-1/2 implementation still needs comparable real-device acceptance; this follow-up changes input scheduling, recovery feedback, and media-clock reporting without claiming a measured hardware improvement.

- Eligible pointer and wheel input sends from the event handler instead of waiting for rAF. Continuous motion retains the shared FPS cap. Idle reliable snapshots do not postpone the next motion deadline.
- Only actual key/button transitions advance the input epoch. A delayed unchanged heartbeat or final-motion recovery no longer blocks a newer cumulative motion snapshot. Real transitions, loss recovery, shared keyboard ownership, and lease renewal retain their checks.
- A completed undecodable frame still requests prompt recovery. Repeated accepted stats-driven IDR requests are limited to one per second, with a startup grace period before the first complete frame. Healthy static screens do not refresh.
- Rust RTCP reports now follow one media clock established before pacing. Windows encoder age compensates the initial anchor. Slow packet transmission, idle periods, and replacement IDRs no longer reset report timing. POSIX retains a fixed initial read offset; legacy reports remain unchanged.
- Viewer statistics and diagnostic callbacks expose interval receive-buffer and decode averages. Missing, reset, first, and idle samples omit unavailable measurements instead of implying zero delay.

Current contracts are the [architecture](../development/remote-desktop.md), [Rust engine](../development/remote-desktop-rust.md), [feature](../features/browser-android-remote-desktop/remote-desktop-and-touch-input.md), and [user guide](../../../docs/guides/remote-desktop.md). [ADR 0158](../decisions/0158-remote-desktop-feedback-timing.md) records the rationale. Earlier pending working-tree edits were preserved and are outside this follow-up commit.

## Verification

- The combined input, clipboard, keyboard, feedback, video, sender pipeline, Rust-wrapper, permission, and native-adapter Node run passed **114 tests**, with **one optional Rust synthetic GPU/browser fixture skipped** because its explicit test-library setting was absent. The pipeline test launched isolated Chromium and verified visible receive/decode timing, interval diagnostics, and cleanup after closing.
- Rust tests passed **20 tests**, including three new media-clock regressions. They compare fast/slow IDR pacing on the same timeline, idle/drop/recovery behavior, Windows initial encoder-age compensation, and 32-bit wrap after a long idle period.
- An isolated temporary source copy containing Git HEAD plus only this follow-up's `rtp.rs` changes passed all **8 Rust tests**, formatting, and Clippy. The clock fix does not require the earlier uncommitted native changes.
- `cargo fmt --manifest-path native/remote-desktop/rust/Cargo.toml -- --check` and `cargo clippy --manifest-path native/remote-desktop/rust/Cargo.toml --locked --all-targets -- -D warnings` passed.
- `npm run build` passed, including TypeScript checks. Vite reported its existing large-chunk advisory. `npm run lint` passed with existing repository warnings; focused lint and diff checks passed for the changed source files.
- The repository documentation check passed description validation but reported **37 pre-existing missing-target errors**, reproduced before this follow-up's documentation edits. They include removed MOC paths and the missing `decisions/README.md` referenced by root guidance. This follow-up preserves those unrelated edits. All six changed documents passed the scoped local-link check.

These fixtures prove scheduling and protocol behavior, not actual input-to-display latency, packet loss on the user's connection, Windows GPU performance, or browser display timing.

## Further optimization priorities

| Evidence to collect on the same host, viewer, quality, and network | Next action if it dominates |
| --- | --- |
| RTT rises together with delay during scroll or motion | Compare a lower requested bitrate and capture packet loss, sender queue, and route behavior. Evaluate fuller congestion estimation before raising burst limits. |
| Low RTT but high interval receive-buffer time | Check browser scheduling and playout behavior. Evaluate a bounded WebCodecs receiver before adding a native viewer. |
| High decode time relative to the frame interval | Verify hardware decoding and codec capability; evaluate adapting FPS or resolution to receiver capacity. The current controller does not act on decode cost alone. |
| High Windows `encodeMs` or old output after a large IDR | Measure encoder backlog and design coordinated input pause/output drain and reference recovery. Blindly dropping stale H.264 deltas can create an IDR loop. |
| High Windows `captureMs` after earlier optimizations | Assess safe virtual-driver surface sharing, including ownership, synchronization, and GPU identity. |

Record interval receiver measurements and the sender's capture, encode, queue, and send timings separately. Do not sum unrelated interval maxima or subtract host/browser clocks to claim a measured end-to-end value. A controlled input/visible-response fixture or high-speed recording is still needed for that acceptance test.

## Application boundary

No deployment, launcher, application-server lifecycle operation, helper installation, driver signing, or display reconfiguration was performed. The required application build updates `dist/`; it does not reload the resident helper. Windows native changes require a verified package matching the updated helper sources. Real-device before/after comparison remains open.
