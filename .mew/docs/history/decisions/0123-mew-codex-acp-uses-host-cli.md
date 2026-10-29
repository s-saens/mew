---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Mew Codex ACP uses the Codex CLI installed on the computer as its engine. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0123 — Mew Codex ACP uses the Codex CLI installed on the computer as its engine"
created: 2026-09-08
updated: 2026-09-11
---

- Date: 2026-09-08
- Status: Adopted
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Separate host-restricted OAuth context; host Codex CLI selection remains unchanged
- Partially supersedes: [0034](0034-mew-agent-panel-acp-reintroduction.md)·[0060](0060-mew-shared-agent-runtime-registry.md) — Scope of internal engine selection in the Codex adapter
- Decision makers: User + Codex

## Background

Mew's pinned version of `@agentclientprotocol/codex-acp` provides a stable ACP contract, but also pins the version of `@openai/codex` bundled with the package. As a result, Mew sessions could continue to see the old model list and features even after the computer's Codex CLI was updated.

## Options

1. Pin both the adapter and engine — highly reproducible, but updates to Codex on the computer are not reflected in Mew.
2. Pin the ACP adapter and use the computer's installation only for the engine — preserves the ACP contract while models and features follow the user-managed Codex installation.
3. Remove ACP and open the Codex TUI directly — uses the latest CLI but loses Mew's chat, history, and scheduled task contracts.

## Decision

Adopt option 2.

- Continue pinning the ACP protocol adapter `node_modules/.bin/codex-acp` as a reproducible Mew dependency.
- The actual Codex engine and both the `login` and `logout` commands use the same Codex CLI installed on the computer.
- The CLI selection order is `MEW_AGENT_CODEX_CLI_CMD`, the existing `CODEX_PATH`, `codex` on `PATH`, and the official default standalone location `~/.local/bin/codex`.
- The `PATH` search excludes executables inside Mew's `node_modules` or pointing into it. If no host CLI is available, it surfaces a startup error rather than automatically falling back to the older version bundled with the package.
- The selected path is passed to the adapter as `CODEX_PATH`. The credential location `~/.codex` and the restricted server browser OAuth contract remain unchanged.

## Rationale

The stability of the ACP wire contract and the Codex engine's update cycle are separate concerns. Separating them pins the adapter behavior Mew depends on while allowing the model list and features managed by the user through the official standalone installation to be used as is.

## Results

- Updates to Codex on the computer are reflected in the engine and model list of new Mew Codex sessions.
- The adapter update lifecycle is separated from the Codex engine update lifecycle.
- Adapters already running use their existing child processes, so they use the new engine after the Mew code is applied and the session reconnects.
- Mew's Codex installation task continues to prepare the ACP adapter dependency; the host Codex CLI must be installed separately using the official standalone installation.
