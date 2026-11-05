---
title: "Prepare missing Windows desktop build prerequisites automatically"
description: "Accepts WinGet installation of missing Windows remote desktop build tools during helper preparation, with process-local discovery refresh, explicit Rust MSVC selection, host approval, and verified readiness."
created: "2026-11-05"
updated: "2026-11-05"
---

## Status

Accepted. Extends [ADR 0059](0059-remote-desktop-rust-engine.md) installation behavior. Package installation and actual Windows video/input acceptance remain separate from local regression verification.

## Context

The [November 1 diagnosis](../work/remote-desktop-rust-install-diagnostics.md) found a compiled Windows GPU DLL without the Rust DLL or readiness marker. Windows Cargo could not launch; the checked Windows paths also lacked other Rust build prerequisites. The installer improved error details but still required users to install a development toolchain manually. WSL tools do not satisfy Windows compilation, and newly installed tools can remain invisible through an older inherited PATH.

## Decision

During existing Windows helper preparation, reuse detected tools and install missing prerequisites through exact WinGet package IDs. Request the Visual Studio C++ workload and SDK components, and modify an existing partial Build Tools installation explicitly. Refresh Windows paths and import the selected compiler/SDK environment before GPU and Rust builds. Run Cargo through the verified Rustup executable and stable MSVC toolchain without changing an existing user default.

Keep package operations in preparation, require host approval for Windows elevation, and stop on installation or verification failure. Do not initiate reboots, install a fallback package manager, or select the legacy video engine automatically. Preserve existing locked dependency sources and mark readiness only after all native checks pass. The [Windows setup contract](../development/remote-desktop-windows-setup.md) owns implementation details.

## Alternatives and rationale

- Continue manual installation: retains fewer installer responsibilities, but leaves ordinary remote desktop setup blocked on development-tool knowledge and stale PATH errors.
- Download each vendor installer directly: could work without WinGet, but adds separate download, version, checksum, and elevation implementations for every prerequisite.
- Ship precompiled native libraries: could remove local build prerequisites, but requires a separately maintained platform release and verification pipeline that is not currently available for this helper.
- Use WinGet during helper preparation: reuses Windows package verification and installer elevation while keeping package selection fixed and failures visible. This is the selected approach.

## Consequences

First preparation can install substantial Windows development tools and accept their package terms. Download size, administrator approval, Windows policy, and required restarts can still block setup. Discovery updates child-process variables without requiring a Mew restart solely for PATH changes. Mac/Linux retain existing prerequisites. Automated regressions cover orchestration and read-only Windows discovery; live installation and a full Windows build remain acceptance gates recorded in the [work record](../work/remote-desktop-windows-setup.md).
