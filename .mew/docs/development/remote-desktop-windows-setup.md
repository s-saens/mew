---
title: "Windows remote desktop prebuilt setup"
description: "Defines exact-source Windows/WSL prebuilt installation and readiness without host development tools. Covers C++20 maintainer builds, compiler discovery, build timeout diagnostics, separate npm/Rust native sources, isolated test prerequisites, publication, and acceptance gates."
created: "2026-11-05"
updated: "2026-11-07"
---

## Preparation boundary

Windows/WSL installs a prebuilt remote desktop helper. End users need no Rust, Cargo, CMake, LLVM, Perl, C++ Build Tools, or Windows SDK, and preparation never installs those tools. The helper still needs native Windows code to capture the desktop and inject authorized input. It runs with Mew's private Node runtime; no standalone GUI installer or permanent Windows service is required.

The viewer preparation action and manual desktop setup share `install.ps1` → `install-windows-native.mjs`. PowerShell prepares private Node; the Node installer obtains and verifies the matching native package and stages the declared helper sources. It does not run npm dependency installation or lifecycle scripts, WinGet, Cargo, or a compiler. Status checks and connections to a ready helper remain read-only. Package verification and ABI probes do not capture the screen or inject input.

[ADR 0140](../decisions/0140-windows-desktop-prebuilt-packages.md) supersedes the host build-tool approach in ADR 0138. The [Rust contract](remote-desktop-rust.md#installation-and-comparison) owns engine build behavior; the [distribution contract](remote-desktop-distribution.md) owns corresponding sources and notices.

## Source identity and package selection

`helper-version.mjs` computes a full 64-character SHA-256 identity from the names and contents of all `HELPER_FILES`, including nested Rust sources, lockfiles, installer code, and the maintainer build recipe. Package production and installation share this inventory. The identity is independent of an installed copy's readiness marker and of the CLI version. Repository attributes keep helper inputs at LF in Windows and POSIX checkouts; release staging preserves their bytes rather than transpiling native helper JavaScript.

| Item | Contract |
| --- | --- |
| Platforms | Windows `x64` and `arm64`; the private Windows Node architecture selects the package |
| Archive | `mew-desktop-win32-<arch>.zip` |
| Checksums | Bundled `<archive>.sha256`; official release `SHA256SUMS` |
| Release tag | `mew-desktop-<sourceHash>` |
| Official source | `https://github.com/s-saens/mew/releases/download/<tag>/<archive>` |
| Bundled copy | `native/remote-desktop/prebuilt/` in a Windows CLI runtime, with its checksum sidecar |

Prefer a bundled archive when present so a Windows runtime can prepare the helper without another helper download. Otherwise fetch the exact content-hash release from the fixed official repository. A WSL source or Linux runtime installation can independently fetch the required Windows package. A bundled archive that fails verification is an error, rather than permission to fetch different bytes or compile locally. Private Node preparation can still require its separate download.

Source changes require a new matching package. A missing release stops with publication guidance. There is no latest-version substitution, arbitrary package URL, host compilation fallback, or automatic legacy-engine selection.

## Verification and replacement

The ZIP contains `gpu-windows.dll`, `mew-desktop-engine.dll`, prebuilt production `node_modules`, patched `rust/vendor` corresponding sources, and redistribution notices. `notices/mew-desktop-source/` preserves the shared helper sources, Rust lock/build metadata, and first-party license; `notices/README.txt` describes the source and license locations. The `mew-desktop-package.json` manifest declares `format: 1`, `platform: "win32"`, `arch`, `sourceHash`, and `files`, with a relative path, byte size, and SHA-256 for each payload file except the manifest itself; the archive checksum protects the manifest.

`notices/node-datachannel-native-sources.zip` separately preserves the npm binding's node-datachannel 0.33.4 sources, libdatachannel 0.24.5 and its recursive dependencies, OpenSSL 3.6.4, and the exact vcpkg OpenSSL port and patches. These are distinct from the Rust engine's vendored versions. Its `SOURCE-ORIGINS.json` records immutable upstream commits, submodule commits, and the upstream Windows build used to establish provenance. Keep original licenses/notices in each source tree. Collection rejects an unsupported npm binding version or mismatched commit/submodule state, preserves LF and long paths, and excludes Git metadata; test-only submodules outside libdatachannel are not fetched.

Before replacing installed components, verify the archive checksum, manifest format/platform/architecture, exact source identity, allowed relative paths, complete file inventory, sizes, and every file hash. Reject path traversal, links, unsupported paths, duplicate names, missing files, and additional unlisted payloads. Load the staged native npm bindings and probe the GPU and Rust ABIs using private Node. Verification executes only native compatibility checks; it starts no capture, input, or GUI.

Keep downloads and extraction in temporary storage. Copy the declared helper sources into that staging directory and recheck their hash before publication, so concurrent source edits cannot pair new sources with older binaries. Serialize package installation per target with a process-owned lock; recover only a confirmed dead owner. Replace the declared helper files and package-owned paths only after verification succeeds. Back up the previous readiness marker first and restore it last on rollback. Replacement attempts to restore both the previous helper sources and native package on failure. If rollback also fails, preserve the backup and report its recovery path. Leave `.mew-ready` absent after successful replacement until the outer installer checks finish; marking a Windows helper ready also rechecks the installed package's source hash and CPU against the installed helper sources. Failed preparation preserves the prior matching installation when rollback succeeds. An interrupted lock write or recovery guard can require manual cleanup after checking that no installer is active. A failed download, incompatible native binding, damaged package, locked DLL, or interrupted replacement must not mark the new helper ready.

Browser preparation first stops the resident helper and waits for login-supervisor cleanup so Windows can replace DLLs. Direct manual setup can fail if an active helper still holds a DLL. Keep the existing visible error and retry flow; agents do not stop or restart the server to work around it.

## Build and release boundary

`node native/remote-desktop/build-windows-package.mjs --output <directory>` is a maintainer/CI command that runs only on native Windows. Its Windows worker already has Node, Rust stable MSVC, CMake, LLVM/libclang, Perl, Visual Studio C++ tools, and Windows SDK prepared. It runs native dependency preparation, GPU compilation, Rust vendoring/build, and ABI checks in an isolated staging directory. It does not install host tools. The builder preserves patched corresponding sources and notices, emits the manifest and archive checksum, and excludes development toolchains from the package.

The build worker also needs Git to collect the pinned npm native dependency sources before compilation. The Windows maintainer build allows 60 minutes for the initial Rust compilation; other installer phases retain their ordinary limits. If failed-build cleanup encounters locked files, report the retained staging path and preserve the original command/timeout error instead of replacing it with a cleanup error. This never changes end-user installation into a source build.

The dedicated `desktop-release.yml` workflow builds and verifies x64 and ARM64 packages, then publishes an immutable content-hash release through the protected `desktop-release` environment. The CLI runtime packager accepts an explicitly built, verified package for bundling rather than collecting arbitrary local DLL outputs. The [release runbook](../operations/cli-release.md#windows-remote-desktop-packages) owns publication order and gates.

Build-tool discovery first accepts an activated compiler environment only when `cl.exe`, `link.exe`, `rc.exe`, Windows SDK headers, and UCRT headers are available. An explicit target architecture must match the native package. Otherwise discovery imports a Visual Studio developer environment and repeats the same checks. GPU compilation shares this discovery instead of unconditionally rediscovering Visual Studio. Discovery deduplicates PATH entries while preserving search order and distinguishing drive-relative entries from drive roots; GPU compilation invokes the resolved compiler directly, preserving source paths without an intermediate command script. Return only the compiler/SDK environment allowlist, not arbitrary host variables.

The GPU helper uses C++20 so C++/WinRT uses standard coroutines with current MSVC and Windows SDK headers. Keep the static `/MT` runtime and the existing C ABI; do not restore the deprecated experimental-coroutine path to accommodate a new compiler.

The workflow prepares only the YAML parser needed by package tests, using its exact version, resolved URL, and integrity from the root lockfile. `tools/desktop-test-dependencies.mjs` installs it in temporary storage with npm lifecycle scripts disabled, then copies it into the fresh checkout. It rejects unexpected transitive dependencies and leaves application dependencies uninstalled. The isolated package builder separately prepares and verifies the native payload.

## Permissions and remaining gates

Ordinary package preparation does not need elevation to install developer tools. Existing Windows login, WSL interop, Task Scheduler, GPU driver, and [firewall approval](remote-desktop-connectivity.md) requirements remain. The optional [virtual display driver](remote-desktop-virtual-display.md) still needs a separate signed package and explicit administrator approval; its signing and installation are outside this helper archive.

Local manifest and installer regression checks do not establish Windows binary compatibility or a successful remote session. Both architecture builds, official package publication, clean-host setup with no development tools, and real video/input acceptance remain required release gates. The [work record](../work/remote-desktop-windows-setup.md) records checks actually performed.
