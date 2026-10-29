---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Manage skills and MCP in the runtime's native configuration. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0157 — Manage skills and MCP in the runtime's native configuration"
created: 2026-09-17
updated: 2026-09-17
---

- Date: 2026-09-17
- Status: Adopted
- Follow-up decision: [0184](0184-mewcat-assistant-session-mcp.md) — Automatically inject a built-in MCP dedicated to the Mewcat assistant into sessions; retain native MCP configuration management and the prohibition on automatic conversion between providers
- Follow-up decision: [0174](0174-mew-commit-skill-and-automatic-commits.md) — Add a Mew-owned commit skill; retain management of runtime-native sources
- Decision maker: Agent implementation based on user requirements

## Background

The user requested a single place in the agent panel to view, edit, move, and delete shared and runtime-specific skills and MCP across global, current-project, and subproject scopes. Discovery paths, configuration formats, and scopes differ by runtime, and creating separate Mew copies would cause CLI and management UI settings to diverge.

## Options

1. Create a Mew-specific store and distribute configuration to all runtimes — Provides a common format but adds responsibility for synchronization, conversion, and application to runtimes.
2. Discover each runtime's native sources by scope and modify only the necessary entries — Preserves native behavior and requires supported locations and formats to be specified.

## Decision

Adopt option 2. The skills and MCP management UI directly manages runtime-native sources and does not create a separate configuration SSoT.

- Display scope (global/project), the runtime that owns the storage location, and read-only provenance independently. Do not merge entries with the same name.
- Do not equate shared skill locations with each agent's automatic discovery scope. Mew's explicit `/스킬` selection uses shared and dedicated candidates appropriate to the current cwd and runtime.
- Do not create a virtual common MCP configuration. Limit MCP moves to scopes within the same runtime, and do not automatically convert between providers.
- Perform changes only after locating the actual entry again and checking the version that was read. Do not overwrite existing destinations. Include supporting files when moving skills.
- Do not bypass the native CLI's application, authentication, or trust decisions. A configuration listing does not indicate connection status or successful execution.
- The API requires agent feature permission. Global scope is based on the server OS user and is not an isolated store for each Mew account. Do not leave secrets in listings, logs, or persistent browser storage.

## Rationale

Preserving provider-specific fields and having the CLI and Mew use the same files can reduce synchronization conflicts and incorrect cross-runtime conversions. Distinguishing installation-owned and plugin-owned files and symbolic links from ordinary user files preserves package update boundaries.

## Results

Keep currently supported locations, formats, limitations, and APIs in [Mew skills and MCP configuration](../../../../docs/configuration/agent-harness.md). Do not launch a separate MCP process or restart existing sessions for configuration management.
