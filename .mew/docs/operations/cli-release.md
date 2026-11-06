---
title: "CLI Releases and npm Publishing"
description: "Release procedure for @liiiiv/mew-cli and Linux, macOS, and Windows x64/arm64 runtimes. Covers the signed Windows installation wizard, verified desktop packages, native helpers, browser manifests, checksums, licensing, CI and npm/OIDC gates; initial desktop validation packages are published, while hands-on platform acceptance and other initial releases remain incomplete."
updated: "2026-11-07"
상위파일:
  - "../../../docs/deployment/native.md"
  - "../development/cli-distribution.md"
---

## Distribution Structure

Usage follows the [CLI Distribution Contract](../development/cli-distribution.md). GitHub executables are published to `s-saens/mew`. The root app remains a private development workspace, and only `apps/cli/` is published as the `@liiiiv/mew-cli` npm package. Transferring GitHub ownership does not change the npm scope or package name. Do not use the unscoped name `mew-cli`, which another project already uses. The person performing the actual publication must verify administrative access to the npm `@liiiiv` scope and initial package creation.

`server/release-runtime.ts` prepares the prebuilt `dist/`, server, shared sources, and workspace packages in a separate temporary directory. It converts TypeScript to JS and adjusts relative imports, child worker paths, package exports, and JSON import attributes. After separately installing production dependencies, it actually loads node-pty and node-datachannel and checks the tmux helper and shared package imports. oxlint is a production dependency because the server's code checking feature uses it.

OS-specific binaries from the official [tmux-builds v3.7c](https://github.com/tmux/tmux-builds/releases/tag/v3.7c) are checked against pinned SHA-256 hashes and included as `bin/tmux`. Linux binaries use upstream static builds; macOS binaries may depend only on system libraries. The upstream license archive, sources, origins, and hashes are preserved together in `notices/tmux/`. npm dependencies' own license files are also retained in runtime node_modules.

Windows executables verify the x64/arm64 zip files from [psmux v3.4.0](https://github.com/psmux/psmux/releases/tag/v3.4.0) against pinned SHA-256 hashes and copy only `bin/psmux.exe`. `native/windows/process-host.cpp` is compiled with MSVC and included in the executable distribution. `notices/psmux/` preserves the checksum-pinned original MIT text, modified crate notices, Cargo.lock, and a complete `.crate` source archive containing the original notices for 247 locked dependencies. `dependencies.json` records declared licenses, selected permitted licenses, origins, and hashes; packaging stops if a license cannot be selected from the reviewed list.

Internal Windows workspace links are recorded in `runtime-links.json` instead of including symlinks in the archive. The CLI restores only verified `packages/` targets as junctions without administrator privileges. The overall design and current verification scope follow the [Windows Native Contract](../development/windows-native.md).

The runtime manifest declares `browserDependencies: "server/browser-dependencies.js"`, and packaging includes that required installer with the pinned Playwright tooling. CLI launch prepares missing browsers before host startup; the [browser dependency contract](../development/browser-dependencies.md) owns platform and privilege requirements. Browser binaries are downloaded on the host and excluded from the archive.

Remote desktop installation scripts and required protocol sources are included. Windows runtimes additionally bundle an explicitly built and verified desktop ZIP with its checksum; arbitrary local capture DLLs are never collected as release inputs. Linux/macOS retain the optional feature's existing source-build setup; WSL can fetch its exact Windows helper package independently. OS permission setup remains separate. Do not include `.env`, `.data`, hidden state, test fixtures, or miscellaneous local native build outputs in releases. Private Mewlink central service sources are also excluded.

## Windows Remote Desktop Packages

The [Windows setup contract](../development/remote-desktop-windows-setup.md) owns package identity, contents, verification, replacement, and host permissions. [ADR 0140](../decisions/0140-windows-desktop-prebuilt-packages.md) moves Windows compilation out of end-user preparation. Development tools are required only on package build workers; package installation never installs them on the user's PC.

Run `node native/remote-desktop/build-windows-package.mjs --output <directory>` on prepared native Windows x64 and ARM64 workers. Each worker supplies Node, Git, Rust stable MSVC, CMake, LLVM/libclang, Perl, Visual Studio C++ tools, and Windows SDK. The builder stages locked production dependencies, GPU/Rust libraries, patched vendored sources, and notices; verifies native bindings and ABIs; and emits `mew-desktop-win32-<arch>.zip` with `.sha256`. It does not install build prerequisites. Never package developer toolchains or unrelated local DLLs.

The dedicated `.github/workflows/desktop-release.yml` builds both architectures and publishes their ZIPs plus `SHA256SUMS` through the protected `desktop-release` environment. Use the full 64-character shared helper-source hash as `mew-desktop-<sourceHash>`; publish to the official `s-saens/mew` repository. Existing release assets are immutable. Configure required reviewers and protections before publication, and preserve corresponding sources and third-party notices inside every archive.

Publish matching helper packages before releasing source revisions that need Windows setup. A CLI Windows runtime bundles the matching archive/checksum under `native/remote-desktop/prebuilt/`; its packager validates this explicit input before staging it. The ordinary helper installer uses the bundled copy first, then the exact official content-hash release when no bundle exists. A bundled package requiring no additional helper download still depends on private Node being available. Linux/WSL runtime archives do not need to carry every Windows architecture: WSL selects its Windows package independently.

Before publishing, verify both architectures on a clean Windows host without Rust or other development tools: private Node preparation, package integrity and source rejection, native loading/ABI checks, first installation, repeat installation, and video/input connection. Exercise missing-release errors, corrupt archives, locked DLL replacement failure and rollback, and readiness-marker behavior. Check the archive's complete file list, patched corresponding sources, licenses, and notices. These are release gates; local fixture tests alone do not satisfy them. The optional signed virtual display driver remains a separate distribution and approval path.

The initial Windows helper validation prerelease is published; the [setup contract](../development/remote-desktop-windows-setup.md#permissions-and-remaining-gates) identifies its source and download. Both native architecture builds and isolated Windows x64 installer/native-load checks passed. The operator requested this initial preview while complete clean-host and real video/input acceptance remain outstanding; it is a prerelease and does not certify those gates. The [work record](../work/remote-desktop-windows-setup.md#november-7-initial-validation-prerelease) records the actual publication and verification. A missing exact-source release must remain a visible setup failure; it must never trigger host tool installation or compilation.

## Windows Installation Wizard

The [installer contract](../development/windows-installer.md) owns its managed WSL environment and user-data boundary; [ADR 0143](../decisions/0143-windows-installation-wizard.md) owns the delivery choice. The installer is separate from the native Windows runtime and from the retired Mewnager application.

Build `mew-windows-setup-x64.exe` on a Windows worker with Node 24 and the checksum-pinned Inno Setup compiler. First publish the same-version `mew-cli-v<version>` runtime release. The installer source must be the exact commit referenced by that runtime tag. The builder retrieves its Linux x64 checksum, pins it inside `install-manifest.json`, bundles the locked CLI production dependencies, and refuses a missing or ambiguous runtime identity. The private Node and Ubuntu rootfs inputs follow `apps/windows-installer/downloads.json`; review their official origins and hashes when changing versions. Packaging never runs the installer or modifies a host distribution.

```powershell
node apps/windows-installer/build.mjs --output artifacts
```

`.github/workflows/windows-installer-release.yml` uses the matching `mew-windows-v<version>` tag and the protected `windows-installer-release` environment. Unsigned CI build artifacts are verification inputs, not approved public installers. Configure `WINDOWS_INSTALLER_SIGNING_PFX` (base64 PFX) and `WINDOWS_INSTALLER_SIGNING_PASSWORD` as protected environment secrets, require reviewers, and verify the publisher certificate before public use. The release path must reject missing signing configuration or an invalid Authenticode signature. Recompute the EXE checksum after signing and publish that signed file plus its `.sha256`; never replace an existing version's assets. Do not store PFX material or certificate passwords in the repository or logs.

Before publication, run this acceptance matrix on clean Windows x64 machines without Node, Rust, or compiler tools:

- WSL absent, already installed, WSL 1-only, and WSL 2 ready; existing unrelated distributions and user files must remain intact.
- UAC acceptance and cancellation, disabled virtualization or restrictive Windows policy, restart deferred, logon resume, and manual rerun of the same installer.
- Fresh administrator creation, browser closed before creation, expired setup link, repeated shortcut while Mew is already running, and reopen errors. URLs and setup tokens must not appear in installer logs or files.
- Valid and corrupt cached downloads, offline interruption, incomplete import, failed ownership validation, and missing essential executable files followed by same-version repair.
- Upgrade/reinstall with existing accounts and projects, controller exit/abnormal termination, Windows localhost forwarding, and concurrent shortcut/setup attempts. Verify application editing, terminal and login-browser behavior, rather than only file markers.
- Valid Authenticode publisher/timestamp, matching post-sign checksum, Windows security prompts, and uninstall retaining the environment and data. Remote desktop and optional driver acceptance remain under their separate package gates.

Initial signed installer build, publication, UAC/reboot acceptance, and clean-host application checks have not been performed. Do not advertise a working download until these gates pass. The [guided-installation work record](../work/guided-installation-and-first-owner.md) records the isolated checks actually run.

## Bundling Licenses

New distributions of Mew itself follow the [Mew Source Available License 1.0](../../../LICENSE). Personal use, internal company use, and selling outputs are permitted, but selling Mew or modified versions and providing paid hosting or SaaS are prohibited without separate written permission. Detailed scope and existing MIT grants follow [Decision 0053](../decisions/0053-source-available-license.md); rights for external contributions follow the [Contribution Acceptance Criteria](../../../docs/development/contributing.md).

Before publishing, verify that the full texts of the root `LICENSE`, `apps/cli/LICENSE`, and `native/remote-desktop/LICENSE` are identical. These three packages' package.json files and their own package entries in each lockfile use `SEE LICENSE IN LICENSE`. The CLI npm package must include `LICENSE` and `README.md`; verify this with `npm pack --dry-run --ignore-scripts`. Executable packaging copies the root LICENSE. Individual license, notice, and corresponding source obligations for third-party components remain in effect and are not replaced by this restrictive license.

## Automated Releases

`.github/workflows/cli-release.yml` runs in the following order.

1. Compare the version in `apps/cli/package.json` with the `mew-cli-v<버전>` tag.
2. Use Node.js 24 on Linux Ubuntu 22.04 x64/arm64, macOS 15 x64/arm64, Windows Server 2025 x64, and Windows 11 arm64. Install dependencies, run isolated tests, build the app, and package for each platform. Windows jobs first produce a verified desktop package as the runtime packager’s explicit input; the independent desktop workflow publishes packages needed by unbundled source/WSL installations. On Windows, prepare the MSVC environment and, after packaging, use `release-windows-verify.ts` to check actual junction extraction; Job Object, psmux, and ConPTY fixtures; and startup in a separate workspace, authentication, HTML responses, and shutdown of the compiled host. Store the generated `mew-runtime-<OS>-<arch>.tar.gz` and individual `.sha256` files as Actions artifacts.
3. Only tag runs publish the 6 executables and `SHA256SUMS` to GitHub Release after passing the protected `cli-release` environment. Do not overwrite executables for existing versions.
4. For npm publishing, select the matching tag in `workflow_dispatch` and set `publish_npm=true`. After verifying the 6 already-published runtimes and all checksums, publish to npm through the protected `npm-publish` environment. Do not change the release cache version.

Assign reviewers for `cli-release`, `npm-publish`, `desktop-release`, and the separate `windows-installer-release` environment in the repository settings. The workflow uses the current repository through `${{ github.repository }}`. After a transfer, follow the [Repository Transfer Checks](repository-maintenance.md#transferring-github-ownership) to verify reviewers, allowed tags, protection rules, and settings previously supplied by the organization for every release environment. The [agent execution rules](../development/getting-started.md) require a build after implementation changes and prohibit deployment and server lifecycle operations; agents do not push tags, run workflows, or deploy on the user's behalf.

## Initial Publication and Subsequent Versions

For the initial publication, verify scope permissions using the responsible person's npm account before proceeding. First create the runtime tag release, then review the package contents in `apps/cli/` and publish.

```bash
# 발행 담당자가 실행. 앱 빌드는 release CI에서 이미 완료되어 있어야 한다.
cd apps/cli
npm ci
npm test
npm pack --dry-run
npm publish --access public
```

In the npm package's Trusted publisher settings, register GitHub organization/user `s-saens`, repository `mew`, workflow file `cli-release.yml`, and environment `npm-publish`. If a configuration exists under the previous owner, delete it and create a new one. Allow the direct `npm publish` used by the current workflow, and configure it immediately before publishing. The first publication with the new configuration must be completed within 2 days of registration. `repository.url` in `apps/cli/package.json` must also match the new repository. Subsequent publications use the workflow's OIDC; do not put long-lived npm tokens in the repository. [Official npm trusted publishing guide](https://docs.npmjs.com/trusted-publishers/).

For the next version, update the CLI package version and the root version in its lockfile together, then create executables with a matching new tag. The npm package version and runtime tag must always correspond. To update, users exit the CLI and rerun `npx @liiiiv/mew-cli@latest` in their working directory. An older version can be selected with `npx @liiiiv/mew-cli@<버전>`, but backward compatibility of the persistent data schema must be checked separately.

## Publishing Gates

- Pass actual native module imports, `tmux -V` or `psmux -V`, and runtime relative import and link checks in all six environments. Job Object, CMD shim, psmux attach, output save/cancel, and compiled host fixtures must also pass on both Windows architectures.
- Verify the required browser-installer manifest entry and file, preparation before host startup, cancellation, missing/invalid overrides, and a clean-host preparation on each supported platform. Browser download time must not consume the host readiness timeout.
- Verify the explicit Windows desktop archive/checksum, source identity, manifest, complete file hashes, native binding/ABI probes, and clean-host setup without development tools on x64 and ARM64. Publish the matching desktop release before relying on unbundled WSL/source installation.
- Verify that distribution files contain no personal data, secrets, or private central service sources and include native component redistribution notices and corresponding sources.
- In an empty working directory on each supported OS, perform hands-on checks of browser first-owner creation, one-time setup closure, explicit temporary-password automation, editing, terminal use, relaunching, and preservation of account/device registrations. Fixture verification for the current implementation work does not replace these hands-on checks.
- Check initial Mewlink registration, the online QR code, and local login, editing, and terminal use from an external browser. Other NATs, mobile networks, and remote desktop follow the [existing remote verification scope](../development/remote-access.md#verification-and-remaining-gates).

The current code and isolated verification are ready; actual CI builds, GitHub Release publication, initial npm package publication, and the hands-on checks above have not been performed.
