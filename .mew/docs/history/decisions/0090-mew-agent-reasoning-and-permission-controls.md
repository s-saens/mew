---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate reasoning effort and permissions for mew agents. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0090 — Separate reasoning effort and permissions for mew agents"
created: 2026-08-27
updated: 2026-08-27
---

- Date: 2026-08-27
- Status: Adopted
- Decision maker: Song Sanghoon (directive)
- Related: [0037](0037-mew-agent-bypass-permissions-default.md) · [0063](0063-mew-agent-runtime-saved-defaults.md) · [0089](0089-mew-prime-agent-official-rpc-adapter.md)

## Background

ACP's `mode` was previously exposed in the UI as the permission mode. Putting Prime's thinking level in the same field would
cause users to confuse permissions with reasoning effort and prevent them from changing permissions. The official
Codex and Claude ACP adapters already advertise the `thought_level` session config option.

## Decision

- Mew renders ACP's `thought_level` config option as a separate **Reasoning effort** selector. It appears only for supported runtimes.
- ACP `mode` remains the **Permission mode** and is placed at the far right of the header.
- Save model, reasoning effort, and permission defaults together for each runtime. Model/permission values in existing saved files remain compatible.
- Prime maps its official RPC thinking control to `thought_level`. Permissions are enforced by a Mew-owned Prime extension hook immediately before
  tool execution: Approve Every Tool, Allow All, or Disable Tools.
- Other runtimes expose this only when their own ACP advertises `thought_level`. Mew does not create a fake selector for CLIs
  without reasoning controls.

## Results

- Codex and Claude use only their official adapters to select the reasoning effort supported by each model.
- Prime controls reasoning and permissions independently while retaining the official executable.
