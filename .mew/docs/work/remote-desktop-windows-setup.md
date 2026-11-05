---
title: "Automatic Windows remote desktop tool preparation"
description: "Records the November 5 addition of missing Windows build-tool installation, PATH and SDK refresh, explicit Rust MSVC execution, local regression and PowerShell discovery checks, and pending live installation and connection validation."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

The [earlier failure](remote-desktop-rust-install-diagnostics.md) stopped at missing Windows Cargo after GPU compilation. Existing helper preparation now checks and installs missing Windows prerequisites with WinGet, imports the compiler/SDK environment, and runs Cargo through explicit Rust stable MSVC before checking native readiness. Installed tools are reused, including tools added after the Mew/WSL process started. The [Windows setup contract](../development/remote-desktop-windows-setup.md) owns current behavior; [ADR 0138](../decisions/0138-windows-desktop-build-prerequisites.md) records the installation choice.

Read-only inspection on November 5 found Windows Rustup/Cargo, CMake, Visual Studio C++/SDK tools, and WinGet available. Perl and libclang were not found by current discovery. This differs from the November 1 snapshot and does not establish whether every custom installation location has been checked.

## Verification

- `node --test native/remote-desktop/windows-build-tools.test.mjs server/remote-desktop-install.test.ts server/remote-desktop-rust.test.ts server/remote-desktop-platforms.test.ts server/remote-desktop-readiness.test.ts`: 35 passed, 0 failed, 1 optional native video fixture skipped because its explicit library prerequisite was not configured. The 11 new checks include actual Windows PowerShell 5.1 parsing and read-only environment discovery through WSL.
- The first real discovery run exposed incorrect quoting of the Visual Studio developer command path. After changing to `cmd /c call` and using a Windows temporary working directory, discovery imported the compiler/SDK variables and identified the installed C++ environment. The regression suite checks that this command-resolution error does not recur.
- Targeted Oxlint, JavaScript syntax checks, `npm run build` (including TypeScript), and `git diff --check` passed. The build updated local `dist/` assets and emitted the existing large-chunk advisory.
- `npm run check:docs`: 710 descriptions, 0 metadata errors; link verification failed with 42 errors outside the seven documentation files changed for this task, including missing `.mew/docs/MOC.md`, decision MOC, and decision README targets. The existing link checker reported no errors in the changed documents. Changed section anchors were checked directly.

No package installation, helper compilation, deployment, launcher execution, or server lifecycle operation was performed. Unit-test installer commands were mocked; the PowerShell integration check only read installed-tool state.

## Remaining limits

Live WinGet installation, partial Visual Studio modification, UAC approval/cancellation on the host, a full Windows Rust build, and real remote video/input remain unverified. Package policy, download errors, missing App Installer, or required Windows restarts can still require user action. Local build verification updates `dist/` assets; it does not apply server-side changes or complete host installation.
