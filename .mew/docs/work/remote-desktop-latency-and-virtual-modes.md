---
title: "Remote desktop latency pipeline and virtual mode implementation"
description: "Records the November 4 implementation of negotiated playout-delay, bounded Rust delta bursts, direct Windows input, WGC/MFT event wakeups and texture conversion, and twelve virtual display modes. Separates local tests and native compilation from pending driver installation and real-device latency measurements."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and result

Implemented phases 1 and 2 of the [task](../../tasks/Reduce%20remote%20desktop%20latency%20and%20improve%20virtual%20display%20modes.md). The default Rust transport requests zero playout delay when negotiated and sends suitable delta frames with bounded token debt. Windows snapshots bypass Node's event poll while retaining native authorization and release checks. Capture wakes on WGC/MFT work, returns encoded output and accepts new input in the same turn, and removes the intermediate RGB copy while retaining the source frame through GPU read completion.

The virtual driver and client use protocol v2 and twelve advertised resolution/refresh combinations. Existing viewer negotiation already delivered dimensions and FPS; the GPU acquisition path now passes them to the driver and exact Windows display activation. Returned physical desktop bounds continue to define input coordinates even when the encoded stream is scaled. A failed exact activation cannot report success. Helper source copying and readiness hashes include all new dependencies.

Current values and invariants belong to the [architecture](../development/remote-desktop.md), [Rust engine](../development/remote-desktop-rust.md), and [virtual display](../development/remote-desktop-virtual-display.md) contracts. [ADR 0130](../decisions/0130-remote-desktop-latency-and-virtual-modes.md) records the decision and alternatives.

## Verification

- The targeted input, permission, shutdown, readiness, resident-host, video negotiation, pipeline, and viewer utility regression run passed 95 tests. It included the actual Chromium diagnostics fixture, synthetic pacing, native-adapter FFI doubles, and scaled-desktop input bounds; it did not stream the user's desktop.
- The new portable C++ pipeline regression passed: output and input in one turn, retained output credits, the three-surface limit, temporary input rejection, bounded event draining, and error propagation.
- Virtual display tests passed portable mode/timing and lease checks and an MSVC/Windows SDK CCD mock. One unsigned-package check was skipped because no dedicated package was supplied. The mock did not change Windows displays.
- An isolated temporary Windows copy compiled the GPU DLL and notification source with MSVC x64. No production helper DLL was replaced.
- `cargo test --manifest-path native/remote-desktop/rust/Cargo.toml --locked` passed 17 tests, including actual watchdog-thread releases, stale release identity, generation replacement races, SDP acceptance, and RTP/debt bounds. `cargo clippy --manifest-path native/remote-desktop/rust/Cargo.toml --locked --all-targets -- -D warnings` passed.
- The additional Rust wrapper, installation, platform, startup, and GPU-pipeline Node test run passed 30 tests; one optional synthetic GPU/browser fixture was skipped because its explicit library setting was absent.
- `npm run build` passed, including `tsc -b`; Vite reported its existing large-chunk advisory. `npm run lint` passed with existing warnings outside this task. The changed JavaScript/TypeScript files passed focused oxlint with no warnings. `npm run check:docs` passed descriptions and local links after updating the task link to its synchronized English filename. `git diff --check` passed.

## Remaining acceptance and application

No before/after measurement on an actual desktop was performed. Capture age, encoder time, sender queue/send time, interval jitter-buffer residence, and input-to-display latency still need comparison on the same GPU, browser, quality, and network. The task's estimated 15–50 ms saving is unverified.

The existing Windows SDK was available, but the driver WDK/IddCx headers were not found in the default location or existing user temporary WDK packages. The changed driver DLL, catalog, signing, installation, protocol upgrade, and actual high-refresh/headless behavior remain unverified. The user performs those operations and any server restart. This work ran neither the launcher nor application servers and changed no certificates, installed drivers, or display settings.

Review of vendor encoder options supports retaining MFT pending `encodeUs` evidence. Direct driver-to-encoder sharing remains gated on capture measurements; WebCodecs or a native viewer remains gated on receiver-buffer measurements. Neither conditional phase-3 path was implemented.
