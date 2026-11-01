---
title: "Remote desktop Rust installation failure diagnostics"
description: "Records the 2026-11-01 diagnosis of a Windows helper blocked by missing Cargo, improved installer command and failure details, regression checks, and the remaining user-owned tool installation and connection verification."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and resulting behavior

The reported remote desktop failure occurred before video negotiation. Read-only inspection found a failed helper installation: the Windows GPU DLL had compiled, but the Rust engine DLL and readiness marker were absent. Running only `cargo --version` through the installed Windows Node runtime reproduced `spawnSync cargo ENOENT`. Windows PowerShell could not resolve Cargo, rustc, or Perl, and libclang and Perl were absent from their checked standard locations. CMake was available. These observations do not prove that every possible custom tool location was absent.

The Rust installer previously replaced process launch errors with a general prerequisite message. It now identifies the failing command and phase, retains the launch error and cause, and distinguishes exit codes, termination signals, and timeouts. Windows guidance names the MSVC toolchain, other host prerequisites, and Windows PATH, including the requirement to install tools on Windows when Mew runs in WSL. Current contracts belong to the [Rust engine installation specification](../development/remote-desktop-rust.md#installation-and-comparison) and [user setup guide](../../../docs/guides/remote-desktop.md#first-connection).

## Verification and remaining recovery

- `node --test server/remote-desktop-rust.test.ts server/remote-desktop-install.test.ts`: 19 passed, 0 failed, 1 optional native pipeline test skipped because its explicit test-library prerequisite was not configured. Tests cover missing Windows commands, build exit codes, signals, timeouts, failed-output publication, helper readiness, and isolated installation state.
- The two new regression tests both failed against the pre-change installer loaded through a temporary Node import hook, confirming that they detect the previously hidden command details. The hook and snapshot were removed without replacing working source files.
- `npx tsc -b --pretty false`, targeted Oxlint, `npm run build`, `npm run check:docs`, and `git diff --check` passed. The build updated local `dist/` assets and emitted the existing large-chunk advisory.

The diagnostic change does not restore this host's missing build tools or create the missing engine DLL. No helper installation, deployment, launcher execution, or server lifecycle operation was performed. The user must prepare the Windows tools and retry helper preparation; actual video and input connectivity remain unverified.
