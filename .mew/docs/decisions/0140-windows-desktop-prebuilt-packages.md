---
title: "Ship verified Windows remote desktop packages"
description: "Supersedes ADR 0138 with prebuilt Windows helper packages, exact shared-source identities, verified replacement, and a separate protected build/release pipeline. End-user setup installs no development toolchain; initial validation packages are published, while complete clean-Windows acceptance remains pending."
created: "2026-11-05"
updated: "2026-11-07"
---

## Status

Accepted. Supersedes [ADR 0138](0138-windows-desktop-build-prerequisites.md) and the Windows end-user build requirement in [ADR 0059](0059-remote-desktop-rust-engine.md). The runtime capture, input, authorization, and transport design is unchanged. The initial x64/ARM64 builds and validation prerelease publication are complete. Full clean-host and real connection acceptance remain open; see the [verification record](../work/remote-desktop-windows-setup.md#november-7-initial-validation-prerelease).

## Context

The [earlier Cargo failure](../work/remote-desktop-rust-install-diagnostics.md) showed that compiling native video components on a Windows host can block remote desktop setup. ADR 0138 automated missing prerequisites with WinGet, but still installed a substantial developer toolchain on an ordinary user's PC. This violates the intended installation experience: Mew should prepare its runtime components without requiring Rust, Visual Studio, LLVM, CMake, or Perl on that PC.

Windows capture and input still need native libraries and OS permissions. Removing native functionality or switching to an external remote desktop product would change the feature and its security/lifecycle boundaries. The build responsibility can instead move to a controlled release environment.

## Decision

Ship separate Windows x64 and ARM64 helper archives containing both GPU and Rust libraries, prebuilt production npm dependencies, patched corresponding sources, and notices. End-user `install.ps1` prepares private Node, then stages helper sources and installs only a verified package. It never runs npm lifecycle scripts, WinGet, Cargo, or native compilation.

Use the full shared helper-source SHA-256 identity as the package contract. Publish fixed archive names under immutable `mew-desktop-<sourceHash>` releases in the official `s-saens/mew` repository. The same `HELPER_FILES` inventory drives installation copies, identity computation, and package production. CLI versions do not substitute for helper identities.

Prefer a matching archive bundled in a Windows CLI runtime; otherwise fetch the exact official release. Verify archive checksum, manifest format/platform/architecture/source identity, complete payload inventory, and each file's size and hash. Probe native bindings and ABIs in staging, then replace package-owned paths transactionally. Write readiness only after all installation checks succeed. Missing or invalid packages stop with actionable errors; no host compiler or legacy-engine fallback is allowed.

Maintain `build-windows-package.mjs` separately from the installer. Build workers supply their own development tools, build both architectures, and publish only through a protected desktop release workflow. CLI packaging accepts the explicit verified package and never collects miscellaneous local native outputs. The [Windows setup contract](../development/remote-desktop-windows-setup.md) and [release runbook](../operations/cli-release.md#windows-remote-desktop-packages) own implementation and operations.

## Alternatives and rationale

- Continue WinGet prerequisite installation: repairs missing tools, but imposes download size, privilege prompts, machine changes, and build failures on end users. Superseded.
- Keep an optional host compilation fallback: helps unpublished source revisions, but silently restores the toolchain dependency and creates two support paths. Rejected for end-user preparation; maintainers build packages explicitly.
- Bundle loose precompiled DLLs only: reduces downloads, but leaves npm native bindings, corresponding sources, source identity, and compatibility verification fragmented. Rejected.
- Ship exact-source packages: keeps native functionality while moving compilation into a reproducible, reviewable release boundary. Selected, with explicit source/package availability gates.

## Consequences

Windows setup requires no development tools or separate desktop app installer. Private Node, GPU drivers, user login, OS permissions, firewall policy, and direct network reachability still apply. The optional virtual display driver retains its separate signing and administrator approval requirements.

Every shared helper-source change needs a matching Windows package before that revision can finish Windows setup. Maintainers own x64/ARM64 build verification, source/notices preservation, protected publication, and clean-host acceptance. Content hashes and checksums detect mismatches and corruption; package provenance still depends on the trusted official release pipeline. Mac/Linux retain their source-build installers until a separate decision changes them.

No Windows package build, publication, deployment, or clean-host connection is claimed by local fixture tests. Actual verification and outstanding gates belong in the [work record](../work/remote-desktop-windows-setup.md).
