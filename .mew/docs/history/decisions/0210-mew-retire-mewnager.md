---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0210 — Retire mewnager and unify execution through the shared mew CLI"
description: "Remove the standalone Windows WSL management app mewnager's source, CI, current features, and tasks while preserving existing records and user data. Retain native Windows verification and public publication gates."
created: "2026-10-14"
updated: "2026-10-14"
---

- Date: 2026-10-14
- Status: Adopted
- Decision makers: user (requested removal of mewnager), Codex (implementation)
- Supersedes: [0201](0201-mew-windows-manager-wsl.md) — Decision to retain the standalone Windows WSL management app
- Partially supersedes: [0209](0209-mew-native-windows-host-platform.md) — Clause retaining the management app's existing WSL contract

## Decision

With the native Windows execution layer added, focus on the shared mew CLI and OS-specific execution layers without maintaining a separate Tauri management app.

- Remove the source, lockfiles, and build scripts in `mew/apps/manager` and the dedicated `manager-windows.yml` CI. Retain the shared mew app, Windows psmux and native helper, and remote desktop implementation.
- Move existing feature and task documents to mew's `docs/history/` and remove them from current feature and task lists. Existing usage and development documentation addresses provide retirement notices and history links. Preserve the code from that time in Git history.
- Do not automatically delete or migrate management app executables, WSL distributions, projects, accounts, or data on users' PCs. WSL source installations remain usable.
- Full native Windows CI and real-hardware verification and the first public publication remain pending. Do not treat management app removal as completed public support or publication of the npx package.
- Do not automatically recreate a separate management app. Consider reintroduction only with an explicit user request and a new decision.

## Results

Reduce duplication in app and deployment paths and manage platform support and verification through the shared CLI. The current contract remains in [Native Windows Execution Layer](../../development/windows-native.md), and previous features remain in [Management App History](../windows-manager-feature.md).
