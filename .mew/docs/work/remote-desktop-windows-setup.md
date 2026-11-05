---
title: "Windows remote desktop setup architecture changes"
description: "Records the November 5 Windows setup changes: the initial WinGet tool preparation and its replacement with verified prebuilt packages. Preserves earlier verification and separates current package checks from pending Windows builds, publication, and clean-host acceptance."
created: "2026-11-05"
updated: "2026-11-05"
---

The first phase below records the superseded implementation. Current installation follows the [Windows prebuilt setup contract](../development/remote-desktop-windows-setup.md) and [ADR 0140](../decisions/0140-windows-desktop-prebuilt-packages.md).

## Phase 1: automatic build-tool preparation

The [earlier failure](remote-desktop-rust-install-diagnostics.md) stopped at missing Windows Cargo after GPU compilation. Existing helper preparation now checks and installs missing Windows prerequisites with WinGet, imports the compiler/SDK environment, and runs Cargo through explicit Rust stable MSVC before checking native readiness. Installed tools are reused, including tools added after the Mew/WSL process started. The original Windows setup contract described that behavior; [ADR 0138](../decisions/0138-windows-desktop-build-prerequisites.md) records the installation choice.

Read-only inspection on November 5 found Windows Rustup/Cargo, CMake, Visual Studio C++/SDK tools, and WinGet available. Perl and libclang were not found by current discovery. This differs from the November 1 snapshot and does not establish whether every custom installation location has been checked.

### Phase 1 verification

- `node --test native/remote-desktop/windows-build-tools.test.mjs server/remote-desktop-install.test.ts server/remote-desktop-rust.test.ts server/remote-desktop-platforms.test.ts server/remote-desktop-readiness.test.ts`: 35 passed, 0 failed, 1 optional native video fixture skipped because its explicit library prerequisite was not configured. The 11 new checks include actual Windows PowerShell 5.1 parsing and read-only environment discovery through WSL.
- The first real discovery run exposed incorrect quoting of the Visual Studio developer command path. After changing to `cmd /c call` and using a Windows temporary working directory, discovery imported the compiler/SDK variables and identified the installed C++ environment. The regression suite checks that this command-resolution error does not recur.
- Targeted Oxlint, JavaScript syntax checks, `npm run build` (including TypeScript), and `git diff --check` passed. The build updated local `dist/` assets and emitted the existing large-chunk advisory.
- `npm run check:docs`: 710 descriptions, 0 metadata errors; link verification failed with 42 errors outside the seven documentation files changed for this task, including missing `.mew/docs/MOC.md`, decision MOC, and decision README targets. The existing link checker reported no errors in the changed documents. Changed section anchors were checked directly.

No package installation, helper compilation, deployment, launcher execution, or server lifecycle operation was performed. Unit-test installer commands were mocked; the PowerShell integration check only read installed-tool state.

### Phase 1 remaining limits

Live WinGet installation, partial Visual Studio modification, UAC approval/cancellation on the host, a full Windows Rust build, and real remote video/input remain unverified. Package policy, download errors, missing App Installer, or required Windows restarts can still require user action. Local build verification updates `dist/` assets; it does not apply server-side changes or complete host installation.


## Phase 2: verified prebuilt packages

The first approach automated Rust and C++ tool installation but still required substantial development tools on an end-user PC. The replacement moves compilation to a dedicated maintainer/CI package builder. Windows/WSL preparation now prepares private Node, stages helper sources, and installs only a matching verified package. It runs no npm lifecycle scripts, WinGet, Cargo, or compiler on the host. The native capture/input helper remains necessary; no separate GUI installer is introduced.

Packages contain both GPU/Rust libraries, prebuilt production npm dependencies, patched corresponding sources, and notices. The shared helper source hash identifies an immutable x64/ARM64 release. Installation prefers a bundled Windows-runtime archive, verifies the complete manifest and payload, and probes native ABIs before replacing installed paths. Readiness is recorded only after success; missing releases and verification failures do not fall back to host compilation. See the [current setup contract](../development/remote-desktop-windows-setup.md) for the contract and [release runbook](../operations/cli-release.md#windows-remote-desktop-packages) for publication.

### Phase 2 verification

- Integrated package/installer/builder/runtime checks: `node --test native/remote-desktop/windows-package.test.mjs native/remote-desktop/build-windows-package.test.mjs server/remote-desktop-install.test.ts server/remote-desktop-rust.test.ts server/remote-desktop-platforms.test.ts server/remote-desktop-readiness.test.ts server/release-runtime.test.ts` passed 56 tests, with 1 optional native video fixture skipped because its explicit test library was not configured. The fixtures cover missing/corrupt packages, source and CPU mismatch, changed source during preparation, native ABI failure, concurrent/dead-owner locks, complete source/native/readiness rollback, and preserved recovery backups.
- Actual Windows PowerShell 5.1 checks parsed setup scripts, wrote and extracted ZIP fixtures with hidden checksum sources and paths over 300 characters, and rejected traversal, Windows device/stream aliases, links, case collisions, and inconsistent declared sizes. They installed no host tools and loaded no remote desktop binaries.
- Builder tests ran the release shell with fake GitHub commands to reject corrupt/source-mismatched packages and preserve existing release assets. Four lock-integrity-checked upstream Windows npm prebuilts were statically inspected for normal and delay imports; these imports were Windows OS libraries and `NODE.EXE`, without a separate VC CRT dependency. This is distinct from compiling or loading the newly built Mew DLLs.
- `npm run build`, including TypeScript checks, targeted Oxlint, workflow YAML parsing, and `git diff --check` passed. The build updated local `dist/` and retained the existing large-chunk advisory.
- `npm run check:docs`: 714 descriptions, 0 metadata errors; link verification reported the same 42 existing missing-target errors outside the nine documentation files changed for this phase. The existing link checker reported no errors for changed documents; changed anchors were inspected directly.

Fixture checks do not establish that either Windows architecture package builds or that a remote desktop session succeeds on a clean Windows host.

### Phase 2 remaining limits

No Windows package build, official package publication, clean-Windows installation, real video/input connection, deployment, launcher execution, or server lifecycle operation has been performed for this phase. The initial packages must be built and published before an unbundled source revision can finish Windows preparation. Native x64/ARM64 loading, installation without development tools, repeat setup, damaged-package recovery, locked-DLL rollback, and an actual connection remain release acceptance gates. Optional virtual display signing/installation and firewall approval retain their separate operator boundaries.
