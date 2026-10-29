---
title: "CLI Releases and npm Publishing"
description: "Covers s-saens/mew Linux, macOS, and Windows x64/arm64 executables; pinned tmux, psmux, and Job Object helpers; checksums, third-party notices, and Windows CI verification; and npm publishing, OIDC configuration after repository transfer, and updates for @liiiiv/mew-cli. Also includes checks for Mew's own license copies, metadata, and inclusion in the npm package. The first public publication and hands-on checks across all platforms have not yet been performed."
updated: "2026-10-23"
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

Remote desktop installation scripts and protocol sources are included, but Electron, capture binaries, browser downloads, and OS permission setup are left to the optional feature's existing installation path. Do not include `.env`, `.data`, hidden state, test fixtures, or local native build outputs in releases. Private Mewlink central service sources are also excluded.

## Bundling Licenses

New distributions of Mew itself follow the [Mew Source Available License 1.0](../../../LICENSE). Personal use, internal company use, and selling outputs are permitted, but selling Mew or modified versions and providing paid hosting or SaaS are prohibited without separate written permission. Detailed scope and existing MIT grants follow [Decision 0053](../decisions/0053-source-available-license.md); rights for external contributions follow the [Contribution Acceptance Criteria](../../../docs/development/contributing.md).

Before publishing, verify that the full texts of the root `LICENSE`, `apps/cli/LICENSE`, and `native/remote-desktop/LICENSE` are identical. These three packages' package.json files and their own package entries in each lockfile use `SEE LICENSE IN LICENSE`. The CLI npm package must include `LICENSE` and `README.md`; verify this with `npm pack --dry-run --ignore-scripts`. Executable packaging copies the root LICENSE. Individual license, notice, and corresponding source obligations for third-party components remain in effect and are not replaced by this restrictive license.

## Automated Releases

`.github/workflows/cli-release.yml` runs in the following order.

1. Compare the version in `apps/cli/package.json` with the `mew-cli-v<버전>` tag.
2. Use Node.js 24 on Linux Ubuntu 22.04 x64/arm64, macOS 15 x64/arm64, Windows Server 2025 x64, and Windows 11 arm64. Install dependencies, run isolated tests, build the app, and package for each platform. On Windows, prepare the MSVC environment and, after packaging, use `release-windows-verify.ts` to check actual junction extraction; Job Object, psmux, and ConPTY fixtures; and startup in a separate workspace, authentication, HTML responses, and shutdown of the compiled host. Store the generated `mew-runtime-<OS>-<arch>.tar.gz` and individual `.sha256` files as Actions artifacts.
3. Only tag runs publish the 6 executables and `SHA256SUMS` to GitHub Release after passing the protected `cli-release` environment. Do not overwrite executables for existing versions.
4. For npm publishing, select the matching tag in `workflow_dispatch` and set `publish_npm=true`. After verifying the 6 already-published runtimes and all checksums, publish to npm through the protected `npm-publish` environment. Do not change the release cache version.

Assign reviewers for both environments in the repository settings. The workflow uses the current repository through `${{ github.repository }}`. After a transfer, follow the [Repository Transfer Checks](repository-maintenance.md#transferring-github-ownership) to verify reviewers, allowed tags, protection rules, and settings previously supplied by the organization for both environments. The [Agent Execution Rules](../development/getting-started.md), which prohibit app builds and deployments, remain in effect; agents do not push tags, run workflows, or deploy on the user's behalf.

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
- Verify that distribution files contain no personal data, secrets, or private central service sources and include native component redistribution notices.
- In an empty working directory on each supported OS, perform hands-on checks of new owner creation, password changes, editing, terminal use, relaunching, and preservation of account/device registrations. Fixture verification for the current implementation work does not replace these hands-on checks.
- Check initial Mewlink registration, the online QR code, and local login, editing, and terminal use from an external browser. Other NATs, mobile networks, and remote desktop follow the [existing remote verification scope](../development/remote-access.md#verification-and-remaining-gates).

The current code and isolated verification are ready; actual CI builds, GitHub Release publication, initial npm package publication, and the hands-on checks above have not been performed.
