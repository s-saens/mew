---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Mew agent models and permissions can be saved as per-runtime defaults. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0063 — Mew agent models and permissions can be saved as per-runtime defaults"
created: 2026-08-20
updated: 2026-09-11
---

- Date: 2026-08-20
- Status: Adopted
- Subsequent decision: [0090](0090-mew-agent-reasoning-and-permission-controls.md) — Extend model and permission defaults to include reasoning effort
- Decision maker: Song Sanghoon (directive)
- Related: Partially supersedes the fixed permission defaults in [ADR 0037](0037-mew-agent-bypass-permissions-default.md) and uses the shared runtime path from [ADR 0060](0060-mew-shared-agent-runtime-registry.md)

## Background

The model and permission mode could be changed in the agent window, but those values applied only to the current ACP session. Launching
Codex again in a new tab or on the next server run reverted to the default model advertised by the runtime and the full permissions from [ADR 0037](0037-mew-agent-bypass-permissions-default.md).
Users had to select the same model, reasoning effort, and permissions again every time.

Browser `localStorage` is suitable for remembering tabs and runtime selection, but not for the agent's own defaults. Those values are lost
when switching browsers or devices, and server-side scheduled tasks and agent sets cannot access them.

## Decision

Place a save icon directly beside the model and permission selectors in the agent window. Clicking it saves the
current model ID and permission mode ID to `<DATA_DIR>/agent-defaults.json` **per runtime**. Saved Codex values are kept separate from those for Claude, Hermes, and other runtimes.

New ACP sessions apply the saved values immediately after `session/new` and `session/load`. The single application path is `AgentSession`
in `server/agentAcp.ts`, so the agent window, agent sets, and scheduled tasks all use the same runtime defaults. If an agent set explicitly specifies
a model, that model is applied afterward and takes precedence.

The precedence and failure rules are as follows.

1. The permission setting `MEW_AGENT_MODE` takes precedence over values saved through the UI because the operator enforces it server-wide.
2. Apply the saved permission mode if it appears in the current runtime's list.
3. If no saved value exists or a runtime upgrade has removed it, fall back to the allow-all candidate order from ADR 0037.
4. If the saved model is absent from the current runtime's list, keep using the runtime's default model. A single default must not block session startup.

Only managers and owners can use the save API. It uses the same shell permission boundary as the agent window; runtime IDs are checked against the server registry,
and model and mode IDs have length limits. The saved file is replaced atomically and has permissions of `0600`.

## Results

- Example: Select `gpt-5.6-sol high` and the desired permission mode in Codex, then save them. They apply to subsequent Codex sessions, including after a server restart.
- Saved defaults are per runtime for the Mew instance, not per user. Managers and owners using the same server share the same defaults.
- The save icon is highlighted when the current selection matches the saved values. Saving does not restart the current session; it only changes the initial values for the next session.
- The security assessment and owner/manager gate from ADR 0037 remain in place. The only change is from “always allow all” to “allow all when no saved value exists.”
