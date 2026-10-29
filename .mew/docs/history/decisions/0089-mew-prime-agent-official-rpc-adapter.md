---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Connect Prime Agent's official CLI RPC through a Mew adapter. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0089 — Connect Prime Agent's official CLI RPC through a Mew adapter"
created: 2026-08-27
updated: 2026-09-11
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0090](0090-mew-agent-reasoning-and-permission-controls.md) — Display Prime thinking as a permission mode; retain the RPC adapter
- Supersedes: [0076](0076-mew-prime-agent-local-acp-compatibility-fork.md)
- Decision maker: Song Sanghoon (directive)

## Background

The official Prime Agent has an RPC mode that provides session switching, transcript retrieval, model retrieval and changes, and thinking level changes.
Its ACP interface, however, lacks the session listing/loading and model/mode contracts Mew needs. Because of this gap, 0076
built a local fork of Prime itself and added ACP features directly.

## Decision

- Mew runs the official `prime-agent --mode rpc` from `server/primeAdapter.ts` and converts its JSONL to Mew's existing ACP supervisor
  boundary.
- The `prime` runtime runs this adapter with Node, and the saved `prime.cmd` and `MEW_AGENT_PRIME_CMD` cannot be used to point
  it back to a local fork. Use `MEW_PRIME_AGENT_EXECUTABLE` only when the official executable needs to be changed.
- The adapter maps Prime RPC's `switch_session`, `get_messages`, `get_available_models`, `set_model`, and `set_thinking_level` to ACP sessions, models, and modes, respectively.
  The session list reads Prime's official storage directory only for title and cwd
  filtering; actual loading and transcripts use RPC.
- Expose Prime's thinking level directly in Mew's mode selector. This value does not represent file tool permissions.

## Results

- Operational dependencies on local Prime source, builds, and rebases are eliminated.
- If the official CLI's RPC wire format changes, only the Mew adapter is updated. Prime storage files are used only to optimize listing, so changes to
  their format do not break session switching or conversation execution.
