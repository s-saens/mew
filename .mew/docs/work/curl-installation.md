---
title: "Curl bootstrap implementation"
description: "Records the third installation entry: curl bootstrap with private Node and standalone CLI, existing-WSL Windows login tasks, release assets, tests, preservation checks, and pending publication/clean-host acceptance."
updated: "2026-11-17"
---

# Curl bootstrap implementation

## Purpose and result

Add a shell command for users already inside WSL 2, Linux, or macOS, alongside
`npx mew-ide` and source `./mew setup`. The script supplies a pinned private
Node runtime and standalone CLI without requiring host npm, Git, or a compiler.
It reuses the existing managed Postgres, default setup, background execution,
browser administrator enrollment, and remote-access chooser.

Inside existing WSL 2, login startup uses a Windows user task for the current
distribution and Linux user. It opens the Windows browser through the safe
PowerShell transport. Native Linux and macOS retain their existing login
mechanisms. No installation changes the user's shell profiles or replaces
unrelated commands, distributions, or account data.

Current contracts belong to [shell installation](../development/shell-installation.md)
and [CLI distribution](../development/cli-distribution.md).
[ADR 0180](../decisions/0180-shell-bootstrap-installation.md) records the
delivery and existing-WSL startup choice. Public instructions now present the
three routes in the README and [installation guide](../../../docs/guides/getting-started-en.md).

## Verification

Checks ran with Node.js 24.16.0. All process and OS fixtures are injected or
test-owned. The real private-Node smoke test executed only version/help paths.
No application server, production database, WSL distribution, or OS startup
registration was started, stopped, or modified.

| Check | Result |
| --- | --- |
| `npm run test:cli` | 75 passed, one opt-in Postgres binary test skipped. Includes eight shell/private-Node fixtures, standalone packaging/immutable release fixtures, and WSL startup/browser fixtures. |
| CLI host, instance lock, runtime, and release-action suites | 23 passed. The release fixture now requires the standalone archive and script alongside all six runtimes, rejecting incomplete legacy sets and corrupt bytes. |
| Real bootstrap smoke | Official Node 24.21.0 Linux x64 archive matched its embedded SHA-256. A real standalone archive and the actual script installed in an isolated path containing spaces/apostrophes; private Node and installed wrapper `--version` passed. Release downloads were redirected to the local test assets. No application setup or OS task ran. |
| Archive inspection | A real CLI bundle was extracted outside the checkout and ran `--help` using its own complete production dependencies. Dependency notices and the private Node license were retained. |
| `bash -n install.sh` | Passed. |
| `npm run build` | Passed TypeScript and Vite; existing large-chunk warnings remain. |
| `npm run lint` | Passed with existing repository warnings. Changed installer/runtime modules also passed targeted lint without warnings. |
| Documentation | 840 descriptions passed with zero metadata errors. The global link check still reports the same 39 pre-existing missing targets. Direct inspection passed for ten changed/new descriptions and 36 added local links and anchors. |

Shell fixtures cover checksum/transfer failure, retry and cleanup, missing or
duplicate checksum entries, archive links, wrong release identity, cached
relaunch, argument/path quoting, private Node after a login with no Node on
`PATH`, root/unsupported hosts, and preservation of unrelated commands,
directories, installation markers, and nested symlink targets. Standalone
fixtures retain the full dependency closure after the source fixture is removed
and check reproducible archives and rejection of replaced release bytes.

WSL fixtures check current distribution/user identity, scoped task ownership,
fixed executable paths, no immediate task execution, safe browser arguments,
and token-free failure messages. They do not execute Windows PowerShell or
establish reboot/login acceptance.

## Remaining gates

No push, release workflow, npm publication, or public script deployment was
performed. The README and script describe the delivery contract until the
matching tagged assets and public entry are published and accepted.

Clean WSL installation, interop policy failures, Windows login/reboot/browser
behavior, and native Linux/macOS installation still need platform acceptance.
OS package authorization may remain necessary for browser prerequisites. The
existing Postgres bundled-library redistribution review remains a publication
gate; this task does not complete that separate audit. See the
[release procedure](../operations/cli-release.md).
