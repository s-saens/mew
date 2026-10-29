---
title: "Windows management app build and validation"
created: 2026-10-07
updated: 2026-10-08
description: "Implementation and operations records for mewnager, discontinued on 2026-10-14. Preserved as historical material, not current installation or support guidance."
retired: "2026-10-14"
---

> This document records the history of mewnager, retired on 2026-10-14. The app code and CI were deleted; the code from that time remains in Git history. For the current runtime contract, follow [Windows native](../development/windows-native.md); for the retirement decision, see [ADR 0210](decisions/0210-mew-retire-mewnager.md).

Product behavior, UI, and execution boundaries are owned by the [feature document](windows-manager-feature.md), user installation by the [usage guide](windows-manager-guide.md), and platform selection by [ADR 0201](decisions/0201-mew-windows-manager-wsl.md).

## Standalone build

`apps/manager` is a separate npm project from the main app. It builds its React/TypeScript UI in its own `dist/`, which Tauri/Rust bundles into a GUI PE exe. It does not change the main mew `dist/` or the running server. The default Windows window size is 1160×820, with a minimum of 760×620, and it uses WebView2.

The Windows build machine requires Node 24, the MSVC toolchain for Rust stable (1.90 or later), and Desktop development with C++/Windows SDK from Visual Studio Build Tools. Follow the official [Tauri Windows build guide](https://v2.tauri.app/distribute/windows-installer/).

From the repository root:

```powershell
npm ci --prefix apps/manager
npm run exe --prefix apps/manager
```

The output is `apps/manager/src-tauri/target/x86_64-pc-windows-msvc/release/mewnager.exe`. With `--no-bundle`, no MSI/NSIS installer is created. `npm run package --prefix apps/manager` collects the exe named `mewnager-<버전>-windows-x64`, notices, SHA-256, and zip in the distribution folder. WebView2 is not bundled in the exe and is required on the machine running it. Code signing is not currently included.

`.github/workflows/manager-windows.yml` builds and checks on Windows, then uploads the files above as Actions artifacts. It runs on changes to app source, shared fonts/marks, or the workflow, or on manual invocation. Do not commit exe/target/dist/node_modules to the repository. Update the mewnager version together in the npm package, Tauri config, and Cargo package.

## Verification

```bash
npm run build --prefix apps/manager
npm test --prefix apps/manager
cargo test --manifest-path apps/manager/src-tauri/Cargo.toml
pwsh -NoProfile -File apps/manager/tests/windows.ps1
bash -n apps/manager/src-tauri/scripts/install.sh
```

GUI tests require Chromium. Run `npx playwright-core install chromium` in `apps/manager` or specify the installed executable path with `MEW_MANAGER_CHROMIUM`. If unavailable, only GUI tests are skipped. CI prepares the browser. The GUI fixture mocks Windows IPC and does not execute OS operations. Use an absolute path for the screenshots environment variable `MEW_MANAGER_SCREENSHOTS`. Mark captures as test data and save them to an ignored path such as `artifacts/`.

The GUI fixture's HTTP server uses `path.sep` to validate paths within the build folder. Hardcoding `/` causes even valid Windows paths to be rejected with 403. Verify that the first page response is 200 before testing UI behavior.

PowerShell regression checks cover WSL help option selection, UTF-8/UTF-16 output, preservation of signed failure codes and original output, and the generated child wrapper. On Windows, only the UAC invocation is mocked to also check parent log forwarding, reboot codes, and temporary result cleanup. Actual optional feature activation/WSL installation is not performed. `tests/windows.ps1` uses a UTF-8 BOM for Windows PowerShell 5.1 and explicitly reads script source as UTF-8.

To check only the UI in a browser, use `npm run dev --prefix apps/manager` (127.0.0.1:1420). An explicit preview notice and disabled installation controls are displayed. It does not falsify the installation readiness state of the user's executable.

## Cross-compiling a Windows exe on Linux

[Tauri's MSVC cross-compilation path](https://v2.tauri.app/distribute/windows-installer/#cross-compilation) requires cargo-xwin, clang, LLD, and llvm-rc.

```bash
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
npm ci --prefix apps/manager
npm run tauri --prefix apps/manager -- build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle
npm run package --prefix apps/manager
```

clang/llvm-rc/lld-link must be available on PATH. cargo-xwin prepares the Microsoft SDK/CRT in a separate cache. Warnings about missing Microsoft CRT PDBs concern debug symbols during cross-linking on Linux and are distinct from failure to produce a distribution exe. The default `npm run exe` on Windows does not require cargo-xwin.

## Windows acceptance checks

Linux checks do not replace checks of UAC, optional features, actual WSL registration, or localhost forwarding on Windows. Through Windows host integration on 2026-10-07, PowerShell 5.1 checks, WSL status queries, and the final exe's WebView2 startup, native IPC, and screen loading were verified. A complete fresh installation has not yet been verified. For testing on actual hardware, check the following on a separate Windows VM/device while preserving existing distributions.

1. Status/errors for WSL not installed, unsupported Windows, virtualization disabled, and a different distribution with the same name.
2. App running as a standard user → UAC at required steps → reboot → resume with the same exe.
3. Ubuntu checksum/import, root tool preparation, clone/setup as the mew user, and first owner login.
4. Recovery after interruption or network failure, paths with spaces, and corrupted management settings.
5. Start the server, keep it running after closing the window, reopen to query its status, stop it, and start it manually after reboot.
6. Update from clean main, block dirty/ahead/non-main states, and display download/build failures with retry.
7. Preserve the original Ubuntu, default distribution, and other servers; no passwords in task logs/settings.
