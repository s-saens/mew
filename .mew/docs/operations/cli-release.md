---
title: "CLI Releases and npm Publishing"
description: "Release procedure for the mew-ide npm package, curl installer, and platform runtime archives. Covers four Linux/macOS runtimes, separate native Windows CI, and publication gates for 0.1.5."
updated: "2026-11-18"
상위파일:
  - "../../../docs/deployment/native.md"
  - "../development/cli-distribution.md"
---

## Distribution Structure

Usage follows the [CLI Distribution Contract](../development/cli-distribution.md). GitHub executables are published to `s-saens/mew`. Publish **only `apps/cli/`**, the unscoped `mew-ide` package; the root source workspace has the same name but is not the executable distribution. An npm organization named `mew-ide` does not reserve the unscoped package. The publisher must verify current package-name availability and account permissions before initial publication. Runtime tag names remain `mew-cli-v<version>` and do not change with the npm name.

The npm package must contain the Windows bootstrap payload generated from the existing installer sources. Inspect a real `npm pack --dry-run` after its preparation step; `--ignore-scripts` alone does not generate missing payload files. Check that the pinned Linux runtime version and checksum match the CLI version. Windows npm installation prepares the Linux runtime in managed WSL.

The [shell installation](../development/shell-installation.md) uses the same
release without npm. Run `node apps/cli/tools/bundle-standalone.mjs --output artifacts`
after installing the CLI's locked dependencies. It emits
`mew-cli-standalone.tar.gz`, `install.sh`, and their `.sha256` files. The bundle
contains the CLI and complete production dependency closure; preserve licenses
and notices. The script's default version must equal the CLI package version.
Review its pinned official Node archives and hashes when updating Node.

Runtime production dependencies include the pinned embedded Postgres distribution and its platform binary package. Preserve their bundled licenses and notices. Verify executable version checks and a fresh private cluster on each release host, alongside relaunch/data preservation and explicit external `DATABASE_URL` use. The [managed Postgres contract](../development/managed-postgres.md) owns storage and lifecycle.

`server/release-runtime.ts` prepares the prebuilt `dist/`, server, shared sources, and workspace packages in a separate temporary directory. It converts TypeScript to JS and adjusts relative imports, child worker paths, package exports, and JSON import attributes. After separately installing production dependencies, it actually loads node-pty and node-datachannel and checks the tmux helper and shared package imports. oxlint is a production dependency because the server's code checking feature uses it.

OS-specific binaries from the official [tmux-builds v3.7c](https://github.com/tmux/tmux-builds/releases/tag/v3.7c) are checked against pinned SHA-256 hashes and included as `bin/tmux`. Linux binaries use upstream static builds; macOS binaries may depend only on system libraries. The upstream license archive, sources, origins, and hashes are preserved together in `notices/tmux/`. npm dependencies' own license files are also retained in runtime node_modules.

The separate native Windows check builds experimental executables. Its packager verifies the x64/arm64 zip files from [psmux v3.4.0](https://github.com/psmux/psmux/releases/tag/v3.4.0) against pinned SHA-256 hashes and uses Windows system tar to extract only `psmux.exe` into `bin/`. `native/windows/process-host.cpp` is compiled with MSVC and included in the executable distribution. `notices/psmux/` preserves the checksum-pinned original MIT text, modified crate notices, Cargo.lock, and a complete `.crate` source archive containing the original notices for 247 locked dependencies. `dependencies.json` records declared licenses, selected permitted licenses, origins, and hashes; packaging stops if a license cannot be selected from the reviewed list.

Internal Windows workspace links are recorded in `runtime-links.json` instead of including symlinks in the archive. The CLI restores only verified `packages/` targets as junctions without administrator privileges. The overall design and current verification scope follow the [Windows Native Contract](../development/windows-native.md).

The runtime manifest declares `browserDependencies: "server/browser-dependencies.js"`, and packaging includes that required installer with the pinned Playwright tooling. CLI launch prepares missing browsers before host startup; the [browser dependency contract](../development/browser-dependencies.md) owns platform and privilege requirements. Browser binaries are downloaded on the host and excluded from the archive.

Do not include `.env`, `.data`, hidden state, test fixtures, or miscellaneous local native build outputs in releases. Private Mewlink central service sources are also excluded.

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
- Valid Authenticode publisher/timestamp, matching post-sign checksum, Windows security prompts, and uninstall retaining the environment and data.

Initial signed installer build, publication, UAC/reboot acceptance, and clean-host application checks have not been performed. Do not advertise a working download until these gates pass. The [guided-installation work record](../work/guided-installation-and-first-owner.md) records the isolated checks actually run.

## Bundling Licenses

New distributions of Mew itself follow the [Mew Source Available License 1.0](../../../LICENSE). Personal use, internal company use, and selling outputs are permitted, but selling Mew or modified versions and providing paid hosting or SaaS are prohibited without separate written permission. Detailed scope and existing MIT grants follow [Decision 0053](../decisions/0053-source-available-license.md); rights for external contributions follow the [Contribution Acceptance Criteria](../../../docs/development/contributing.md).

Before publishing, verify that the full texts of the root `LICENSE` and `apps/cli/LICENSE` are identical. These packages' package.json files and their own package entries in each lockfile use `SEE LICENSE IN LICENSE`. The CLI npm package must include `LICENSE` and `README.md`; verify this with `npm pack --dry-run --ignore-scripts`. Executable packaging copies the root LICENSE. Individual license, notice, and corresponding source obligations for third-party components remain in effect and are not replaced by this restrictive license.

## Automated Releases

`.github/workflows/cli-release.yml` runs in the following order.

1. Match the version in `apps/cli/package.json` to the `mew-cli-v<version>` tag.
2. Build four Node.js 24 runtimes on Ubuntu 22.04 and macOS 15, each on x64 and arm64. Each job installs the locked dependencies, runs the runtime and CLI tests, builds the app, and packages its archive and checksum. A fifth job tests and packages the standalone CLI and shell installer.
3. After all five jobs succeed, a tag run can publish through the protected `cli-release` environment. The release contains four runtime archives, `mew-cli-standalone.tar.gz`, `install.sh`, and the `SHA256SUMS` manifest covering those six files. Repeated runs verify existing files against the manifest. Publish a new version if the bytes change. Update the public `main/install.sh` entry after accepting its matching runtime release.
4. For subsequent npm publications, dispatch the workflow on the same tag with `publish_npm=true`. The job downloads the published files, checks all six entries, and publishes through the protected `npm-publish` environment.

For native Windows verification, manually dispatch `.github/workflows/windows-native-check.yml`. Its x64 and arm64 runners build with MSVC, package the experimental runtime, run `release-windows-verify.ts`, and upload successful builds as Actions artifacts. The Windows npm bootstrap and signed setup wizard use the Linux runtime in WSL. [Windows native contract](../development/windows-native.md) · [ADR 0190](../decisions/0190-cli-release-platforms.md).

Assign reviewers for `cli-release`, `npm-publish`, `desktop-release`, and the separate `windows-installer-release` environment in the repository settings. The workflow uses the current repository through `${{ github.repository }}`. After a transfer, follow the [Repository Transfer Checks](repository-maintenance.md#transferring-github-ownership) to verify reviewers, allowed tags, protection rules, and settings previously supplied by the organization for every release environment. The [agent execution rules](../development/getting-started.md) require a build after implementation changes and prohibit deployment and server lifecycle operations; agents do not push tags, run workflows, or deploy on the user's behalf.

## Initial Publication and Subsequent Versions

Archive link checks resolve the runtime root and final symlink targets against the same physical directory on macOS. CLI tests check Unix permissions on POSIX hosts, including WSL, where the Windows installer runs managed Postgres.

The source tree prepares version `0.1.5` for the first public CLI release. The matching GitHub runtime release, npm publication, and clean-host acceptance are pending.

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

For the next version, update the CLI package version, its lockfile, and `install.sh`'s `MEW_INSTALL_VERSION_DEFAULT` together, then create executables with a matching new tag. The npm package version, shell entry, and runtime tag must always correspond. To update, users stop the background instance, then run `npx mew-ide@latest` or the newer published curl command. A repeated start while an instance is running only reopens it. An older version can be selected with `npx mew-ide@<version>` or explicit `MEW_INSTALL_VERSION`, but account and Postgres schema compatibility must be checked separately; incompatible cluster majors are never reset automatically.

## Publishing Gates

- Pass native module imports, `tmux -V`, and runtime import and link checks on each of the four release platforms. Native Windows verification covers Job Objects, the CMD shim, psmux attach, output save/cancel, and the compiled host in its separate workflow.
- Verify the required browser-installer manifest entry and file, preparation before host startup, cancellation, missing/invalid overrides, and a clean-host preparation on each supported platform. Browser download time must not consume the host readiness timeout.
- Verify that distribution files contain no personal data, secrets, or private central service sources and include native component redistribution notices and corresponding sources.
- In an empty working directory on each supported OS, perform hands-on checks of browser first-owner creation, one-time setup closure, explicit temporary-password automation, editing, terminal use, relaunching, and preservation of account/device registrations. Fixture verification for the current implementation work does not replace these hands-on checks.
- Check initial Mewlink registration, the online QR code, and local login, editing, and terminal use from an external browser. Other NATs and mobile networks follow the [existing remote verification scope](../development/remote-access.md#verification-and-remaining-gates).

The work record distinguishes actual local checks from publication and platform acceptance. Before advertising `npx mew-ide`, verify clean Linux/macOS installation, Windows CMD/PowerShell through WSL preparation and required reboot resume, background startup after terminal closure, login startup, stop/reopen, fresh administrator creation, the three-provider popup, and working document tables with managed Postgres. Actual release publication, npm publication, and these clean-host checks remain separate gates.

Before advertising curl installation, also verify a host without Node/npm/Git,
an existing WSL 2 distribution with and without user systemd, Windows interop
failure, login task ownership and reboot recovery, quoted installation paths,
private Node after login, interrupted/repeated downloads, and preservation of
unrelated files and distributions. No public script or shell assets have been
published or accepted on clean hosts by the current implementation task.
