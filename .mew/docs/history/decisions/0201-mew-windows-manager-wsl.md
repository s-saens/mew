---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0201 — Windows portable management app and WSL execution layer"
description: "Historical decision superseded by 0210. Defines the boundary in which a standalone Tauri management app in the mew repo handles Windows environment preparation, installation, and operation, while the actual mew server runs as a non-administrator user in a dedicated WSL 2 distribution."
created: 2026-10-07
updated: 2026-10-14
---

- Date: 2026-10-07
- Status: Superseded — Management app retired under [0210](0210-mew-retire-mewnager.md)
- Partially supersedes: [0111](0111-mew-native-deployment-and-supervisor.md) — Add a Windows-only WSL management GUI entry point while retaining the Linux server execution boundary
- Decision makers: User (requested implementation of a Windows GUI management app), Codex (implementation)

## Background

Windows needs an entry point for managing installation, status checks, and updates without directly operating an Ubuntu terminal, while providing the existing tmux and POSIX execution contracts unchanged. Retain the Linux-native server and loopback binding boundaries in [0111](0111-mew-native-deployment-and-supervisor.md).

## Options

1. Port the server to native Windows — requires separate implementations of the tmux, shell, scheduling, and process management contracts.
2. Electron management app — reuses React and TypeScript but bundles a browser engine.
3. Tauri, React, and Rust management app + WSL 2 — uses the system WebView2 and retains the existing Linux execution contracts.

## Decision

- Adopt option 3 and place the standalone app, npm lockfile, Cargo lockfile, and build pipeline in `mew/apps/manager`. Do not require Rust or Windows tools for the existing mew app build.
- The Windows app handles installation, environment checks, updates, logs, and server controls. The server, terminals, and agents run as a non-administrator user inside WSL.
- The default is a dedicated `Mew` distribution. Do not delete existing distributions or change the default WSL distribution or global settings. Do not automatically install into existing user-owned environments.
- Elevate through UAC only to prepare Windows features; handle distribution registration and user data in the original Windows user context. If a reboot is required, preserve the step and settings and resume after relaunch.
- Serve the server on localhost. External access and firewall exposure are separate user settings and are not enabled automatically.
- A portable executable means the management app itself runs without installation. WSL, the distribution, mew, and user data are stored separately. WebView2 and an internet connection are required.
- Do not expose an arbitrary shell execution API to the GUI. Execute only allowed operations and validated settings in the native layer, and do not retain the first account's password in logs or settings.

## Rationale

Manage installation scripts and the server together in the same repo to reduce version compatibility costs. Adding only a Windows-specific management layer improves installation UX while retaining the server's core execution contracts.

The behavior and validation scope at the time are preserved in the [Management app feature history](../windows-manager-feature.md).
