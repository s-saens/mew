---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew runtime lifecycle controls belong in each runtime's settings. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0101 — mew runtime lifecycle controls belong in each runtime's settings"
created: 2026-08-31
updated: 2026-08-31
---

- Date: 2026-08-31
- Status: Adopted
- Partially supersedes: 0062 — expands the scope from runtime installation UI alone to lifecycle controls for installation, removal, login, and logout
- Decision maker: Song Sanghoon (directive)
- Related: [0060](0060-mew-shared-agent-runtime-registry.md) · [0072](0072-mew-agent-gui-authentication.md)

## Background

The runtime selector had an Install button, while each runtime's gear menu contained only executable and env settings, splitting responsibility for installation,
authentication, and removal across locations. In particular, API keys and account logout must follow each provider's CLI contract, so the browser
must not accept arbitrary commands or secret paths.

## Decision

- Each runtime's gear settings provide installation, removal, login, and logout together.
- The `server/agentRuntimes.ts` registry owns the fixed spawn spec for each action. HTTP accepts only a runtime id and a predefined action,
  not commands, arguments, or paths.
- Removal is exposed only for runtimes whose registry declares a safe uninstall command. For runtimes installed through a provider
  script with no safe removal contract, display the reason removal is unavailable and do not delete arbitrary files.
- Login relays the existing ACP/CLI authentication contract unchanged. Logout runs only noninteractive CLI commands declared in
  the registry; Mew does not read or directly delete tokens or API keys.
- Only manager and owner roles can install, remove, or log out; removal and logout require confirmation before execution.

## Rationale

Guessing and deleting package managers or credential stores outside the runtime registry can damage different files depending on the operating system and
installation method. Running only registered uninstall commands and CLI logout commands consolidates lifecycle operations in one place within the existing
shell permission boundary, without command injection or secret exposure.
