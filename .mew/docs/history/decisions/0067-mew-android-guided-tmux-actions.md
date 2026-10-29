---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Run mew Android guided commands in user-initiated one-shot tmux sessions. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0067 — Run mew Android guided commands in user-initiated one-shot tmux sessions"
created: 2026-08-21
updated: 2026-08-21
---

- Date: 2026-08-21
- Status: Adopted
- Decision maker: Song Sanghoon (directive)
- Partially supersedes: “The mew server does not install the emulator, create AVDs, or launch them” in [ADR 0058](0058-mew-android-panel-optional-gateway.md)

## Background

The Android panel showed host status and the next commands, but users had to copy them into a terminal to run them.
In particular, `sdkmanager --licenses` and `avdmanager create avd` may require interactive input, so providing only a run button would leave no place to view progress or enter input. Conversely,
sending command strings from the browser to the server for execution unnecessarily broadens the shell boundary for managers
and owners.

## Options

1. Keep copy-only guidance — there is no server execution surface, but users must switch between the panel and terminal.
2. Run arbitrary commands sent by the browser — simple to implement, but turns the Android API into a general-purpose shell execution API.
3. Run only guided commands from the server registry in one-shot tmux sessions — provides both a fixed execution boundary and a progress view.

## Decision

Place ▶ and terminal icons next to the copy icon for runnable guided commands in the Android panel.

- The browser sends only the command ID from the server registry, rather than a command string, to `POST /api/android/commands/:id/run`.
- The server constructs commands using the host SDK path and CPU architecture. Allowed IDs are limited to license verification,
  system image installation, `mew-api36` AVD creation, and headless emulator launch.
- Execution uses the same hidden `mewcmd-*` tmux sessions and `SessionTerminalPopup` as the project command buttons.
- All guided Android commands are one-shot. When a command finishes, the subsequent `tmux kill-session` closes its
  own session regardless of success or failure. While running, the ▶ control becomes a stop button.
- Before execution, the terminal icon provides an entry point to run the command; during execution, it opens a window for output and interactive input.
- Permissions remain restricted to manager and owner, as with the existing Android status API and tmux.

The distribution boundary from ADR 0058 remains in place. The emulator, system images, AVDs, and gateway are not included in the mew distribution, and opening the panel does not automatically
install or run them. This decision narrowly supersedes part of that ADR to allow the server to execute only fixed commands for
which the user explicitly clicks ▶.

## Rationale

- The command ID registry ensures that copy guidance and actual execution use the same commands without creating a general-purpose remote shell API.
- Reusing the session names, popup, and termination behavior of existing command buttons avoids adding an Android-specific process supervisor.
- Interactive installation requires a terminal popup so users can answer license and device profile prompts.

## Results

- Host CPU, disk, and network resources are used only while commands are running.
- For the long-running emulator, the session remains open until the process exits, and can be shut down with the Stop button or the popup's termination action.
- No session history remains for completed short commands. Only output from commands currently running is visible in the popup.
