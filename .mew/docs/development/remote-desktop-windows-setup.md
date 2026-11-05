---
title: "Windows remote desktop build preparation"
description: "Defines Windows/WSL discovery and WinGet installation of missing native build tools, same-process PATH and SDK refresh, explicit Rust stable MSVC selection, host approval, readiness, and failure boundaries."
created: "2026-11-05"
updated: "2026-11-05"
---

## Preparation boundary

Windows/WSL helper preparation installs missing build prerequisites before compiling GPU capture and the Rust engine. The existing viewer preparation action and manual desktop setup use the same `install.ps1` → `install-windows-native.mjs` path. Status checks and ordinary connections to a ready helper do not install packages. Preparation and ABI checks do not capture the screen or inject input.

`windows-build-tools.mjs` owns package selection and retry boundaries. `windows-build-environment.ps1` only discovers tools and prepares process-local compiler variables. It does not install packages, change registry environment values, or report unrelated host environment variables. The [Rust contract](remote-desktop-rust.md#installation-and-comparison) owns compilation and dependency source preservation; the [distribution contract](remote-desktop-distribution.md) owns notices and redistribution boundaries.

## Discovery and installation

Read the current Windows Machine/User PATH on each discovery and preserve private Node and existing custom paths. Also search the Cargo home, standard CMake/LLVM paths, Strawberry Perl, and the WinGet app execution alias. Existing installations are reused. Tools installed only in WSL cannot build the Windows helper.

| Missing prerequisite | Exact WinGet package ID | Post-install requirement |
| --- | --- | --- |
| MSVC and Windows SDK | `Microsoft.VisualStudio.2022.BuildTools` | C++ workload, selected target architecture, usable `cl.exe`, `link.exe`, `rc.exe`, Windows headers and UCRT headers |
| CMake | `Kitware.CMake` | Windows `cmake.exe` |
| libclang | `LLVM.LLVM` | `libclang.dll`, exported as `LIBCLANG_PATH` |
| Perl | `StrawberryPerl.StrawberryPerl` | Windows `perl.exe` |
| Cargo/Rustup | `Rustlang.Rustup` | Windows `rustup.exe` and Cargo shim |

Use exact IDs from the `winget` source and keep WinGet's package hash checks enabled. Installation accepts package/source terms and suppresses terminal prompts; Windows elevation prompts still require host approval. Vendor installers can update the Windows installation and persistent tool paths. There is no automatic reboot. First-time preparation can download several gigabytes and take substantially longer than subsequent preparation.

The Visual Studio package requests `Microsoft.VisualStudio.Workload.VCTools` with recommended components and adds the ARM64 compiler component on ARM64 hosts. An existing Visual Studio 2022 Build Tools installation lacking required components is modified at its discovered installation path. Other complete Visual Studio editions can satisfy discovery without installing Build Tools. Force execution at the WinGet layer does not pass Visual Studio's process-closing `--force` option.

Rediscover after every package installation and stop if its required tool is still unavailable. If WinGet is absent, explain how to install/update Microsoft App Installer or prepare the tools manually. Do not install a second package manager or silently choose the legacy engine. Installation cancellation, policy/download failures, and required restarts remain visible in **View Setup Details**; the user resolves them and retries **Reconnect**. See the [user guide](../../../docs/guides/remote-desktop.md#first-connection).

## Compiler environment and readiness

Import `VsDevCmd.bat` compiler/SDK variables for the selected x64 or ARM64 target. Preserve the refreshed Windows paths and export `LIBCLANG_PATH` to both native builds. Normalize case-insensitive environment names so an inherited `PATH` cannot override the prepared `Path` when Node starts Windows children.

Select `stable-x86_64-pc-windows-msvc` or `stable-aarch64-pc-windows-msvc`. Probe Rust and Cargo through the discovered Rustup executable; install that toolchain with the minimal profile only when unavailable. Do not change an existing Rustup default or add a repository override. Execute Cargo vendor/build through the verified `rustup run <toolchain> cargo` path, so another Cargo earlier in PATH cannot bypass the checked toolchain.

GPU compilation runs first; a failure prevents the Rust build. `install.ps1` writes the existing readiness marker only after tool preparation, native binding checks, GPU compilation, Rust compilation, and the engine ABI probe succeed. Source hashes and installation copies include all three new preparation files. Missing tools or partial outputs never mark the helper ready.

## Verification

Run `node --test native/remote-desktop/windows-build-tools.test.mjs` for reused/missing tools, stale inherited PATH, exact package selection, partial Visual Studio modification, explicit MSVC selection, cancellation/failure handling, and native build environment propagation. Its read-only PowerShell test runs when Windows PowerShell is available, including a conventional WSL mount, and otherwise skips. It checks script parsing and actual environment discovery without installing tools or starting capture.

These checks do not verify live package installation, UAC approval, a complete Windows Rust build, or remote video/input. The [work record](../work/remote-desktop-windows-setup.md) records actual local verification; [ADR 0138](../decisions/0138-windows-desktop-build-prerequisites.md) records the decision.
