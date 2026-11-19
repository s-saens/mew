---
title: "Termux setup prerequisites"
description: "Records Termux prerequisites, unattended installation, first-owner HTTP readiness, command registration, and verification results."
created: "2026-11-16"
updated: "2026-11-16"
---

# Termux setup prerequisites

Source setup treated Termux as ordinary Linux, offering nvm for Node and `sudo apt` for build tools. The setup script now detects a native Termux environment and offers `pkg` installation of Node LTS and npm, or the missing compiler, make, Python, and tmux. It checks the Node version after installation and provides manual commands when installation is declined or noninteractive. The [installation guide](../../../docs/guides/getting-started-en.md#termux-on-android) owns user-facing instructions and limitations.

Local verification: six prerequisite regression checks passed with mocked package commands; `bash -n mew`, scoped oxlint, `git diff --check`, and `npm run build` passed. Documentation metadata validation passed, but the repository-wide link check reported existing missing MOC and decision links and an unrelated absolute task asset link. No actual Termux package installation, Android device test, launcher execution, deployment, or server lifecycle operation was performed. Full source installation remains unverified on Android; native npm modules and mandatory browser preparation remain potential blockers.

## Source installer

`install-termux.sh` downloads a pinned source archive, verifies its SHA-256 checksum, and runs the existing setup with terminal input. It remembers the installed source revision so users can retry setup after a failure. The [Termux installation guide](../../../docs/guides/getting-started-en.md#termux-on-android) owns the public command.

The local build and lint passed. The CLI suite passed 79 tests and skipped one optional PostgreSQL test. The Termux bootstrap fixture verified terminal input, checksums, retry, and preservation of an existing directory. Document metadata passed. The global link checker reported 39 existing broken links. Full setup and browser preparation on Android still require a device test.

The [Termux prerelease](https://github.com/s-saens/mew/releases/tag/mew-termux-v0.1.5) contains the installer and its pinned source archive. Both assets downloaded without authentication. The installer matched the committed script, and the archive matched the script's SHA-256 checksum.

## Unattended Termux setup

The updated installer uses the source setup defaults and preserves existing settings. It uses Termux PostgreSQL with a private Unix socket when no external database is configured. It skips server-side browser preparation on Android and loads Playwright only when a supported host starts a browser session.

The [0.1.6 prerelease](https://github.com/s-saens/mew/releases/tag/mew-termux-v0.1.6) installer and source archive passed anonymous download and checksum verification. A clean Linux extraction passed dependency installation, the project build, and all 28 focused tests. The local CLI suite passed 79 tests and skipped the optional live PostgreSQL test. Lint passed with existing warnings. The documentation checker reported 39 existing broken links. No Android device was available to verify end-to-end setup.

## First-owner link readiness

The Termux launcher now checks the local authentication endpoint before reporting startup or printing the setup link. The default address matches the IPv4 loopback bind. The launcher opens the private link with the Termux browser command when available, and `setup-link` renews it without rebuilding.

The [0.1.7 prerelease](https://github.com/s-saens/mew/releases/tag/mew-termux-v0.1.7) installer and source matched their verified downloads. A clean source extraction passed dependency installation, build, and 24 tests covering readiness and first-owner setup. The CLI suite passed 79 tests with one opt-in skip. Lint passed with existing warnings and the documentation checker reported 39 existing broken links. Browser behavior on the reporting Android device remains unverified.

## Termux command

The 0.1.8 installer reuses the 0.1.7 source archive and registers `mew` in Termux's command directory after setup succeeds. It preserves existing commands that it does not own and forwards launcher arguments from any working directory.

The [0.1.8 prerelease](https://github.com/s-saens/mew/releases/tag/mew-termux-v0.1.8) installer and source matched the verified files after anonymous download. The build and lint passed. The CLI suite passed 79 tests with one opt-in skip, including command forwarding, failed setup, and preservation of an existing command. The documentation checker reported 39 existing broken links. Command registration has been tested in an isolated fixture. Android device verification remains open.
