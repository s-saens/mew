---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Automatically prepare remote desktop and run it in the Windows login session. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0138 — Automatically prepare remote desktop and run it in the Windows login session"
created: 2026-09-14
updated: 2026-09-14
---

- Date: 2026-09-14
- Status: Adopted
- Follow-up decision: [0185](0185-mew-desktop-resident-direct-host.md) — resident native host on Windows/WSL and per-connection capture/input lifetimes
- Decision makers: User (requested proceeding with remote desktop without separate installation management), Codex (implementation design)
- Partially supersedes: [0137](0137-mew-windows-desktop-pipe-bridge.md) — the segment where the Windows parent launches Electron directly and the token delivery path

## Decision

When remote desktop opens, Mew checks the required runtime and code versions, prepares them in internal tmux, and then connects. Users do not manage npm commands or a separate app. Initial downloads and failure output are visible in the existing terminal, and OS screen-sharing and input permission approvals remain required. If Windows Node is missing, verify the checksum of the official distribution and prepare it in a Mew-specific directory.

Do not depend on the WSL parent's Windows session number. Use Windows Task Scheduler's InteractiveToken to run once per connection in the current Windows account's login session. Do not require a password, administrator privileges, automatic startup at boot/login, or a resident service. Remove the temporary connection task after execution and clean it up on failure as well. Explain the cause if the user is not logged in or policy blocks task registration.

Include only a fixed executable and a random bootstrap pipe name in the task definition. Pass the token only through parent stdio → a local bootstrap pipe restricted to the current Windows user's SID → the Electron child environment. Verify the peer user and login session before authentication. Retain the existing Node–Electron authentication pipe and Mew connection lease so capture and input terminate when the parent disappears. Do not leave authentication tokens, signaling, video, or input in task definitions, files, or logs. Do not add a public TCP port either.

Mac/Linux use the existing OS-specific capture/input implementations and automate installation preparation. Do not bypass Linux login session, DISPLAY/Wayland/D-Bus, or Mac permission requirements. Retain [0136](0136-mew-native-remote-desktop-webrtc.md) for the full-screen UI, WebRTC, and exclusive control.

## Rationale

Windows service sessions are separate from the logged-in desktop, so restarting or reinstalling the server does not resolve this. Use [InteractiveToken execution](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks) and [access-controlled named pipes](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstream) to capture in the logged-in user's context only when needed. Current behavior and verification scope are documented in the [development documentation](../../development/remote-desktop.md).
