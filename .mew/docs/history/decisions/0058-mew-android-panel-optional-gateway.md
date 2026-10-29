---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew Android window is an optional gateway. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0058 — The mew Android window is an optional gateway"
legacy_description: "Do not bundle the Android Emulator in the distribution; add only status checks and a loopback gateway display to Mew."
created: 2026-08-20
updated: 2026-09-11
---

# 0058 — The mew Android window is an optional gateway

- Status: Adopted
- Subsequent decision: [0067](0067-mew-android-guided-tmux-actions.md) — execute fixed guided commands clicked by the user; exclusion from the distribution and the prohibition on automatic execution remain
- Scope: mew
- Related: [0057 — The mew browser window opens through a loopback proxy restricted to managers and owners](0057-mew-localhost-browser-panel.md)

## Context

We want to display an Android Emulator session on the server machine inside the browser in mew. There are three options.

1. Include the emulator/WebRTC runtime in the mew distribution.
2. Have the mew server manage emulator installation, AVD creation, and startup.
3. Have mew only check status and display the loopback gateway, leaving the emulator runtime as an external tool.

Android Emulator and system images are large and consume substantial resources while running. In contrast, mew's default execution path must remain lightweight. WSL/KVM
permissions, Android SDK installation, and system image license acceptance also depend on each host, making them difficult to fix as part of the app
distribution.

## Decision

Keep the mew Android window as an optional gateway.

- Do not include Android Emulator, system images, AVDs, or a WebRTC gateway in the mew distribution.
- The mew server does not start emulator processes.
- Through `GET /api/android/status`, mew checks only `/dev/kvm` on Linux and WSL or Emulator acceleration status on macOS, Android SDK tools, and whether
  an AVD with the same architecture as the host CPU exists. Apple Silicon uses `arm64-v8a`; Intel/AMD uses `x86_64`.
- The Android screen opens a WebRTC/gateway URL started separately by the user through the same loopback proxy as the browser window.
- Access is restricted to managers and owners, as with the browser window and terminal.

## Results

When Android functionality is disabled, mew's only added overhead is the panel code and status check API. The emulator incurs RAM, CPU, and disk
costs only when the user starts a separate session.

The initial implementation uses manual gateway URL entry. Adding an emulator supervisor later requires a separate ADR. Even then, the supervisor must remain
an opt-in execution path separate from mew itself.
