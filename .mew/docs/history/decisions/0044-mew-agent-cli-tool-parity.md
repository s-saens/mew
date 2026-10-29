---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew agent panel runs with the same tool set as the CLI. Disable the ACP fs capability. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0044 — The mew agent panel runs with the same tool set as the CLI. Disable the ACP fs capability"
created: 2026-08-10
updated: 2026-09-11
---

- Date: 2026-08-10
- Status: Adopted
- Follow-up decision: [0072](0072-mew-agent-gui-authentication.md) — Do not advertise the authentication capability; continue not advertising fs and retain CLI tool parity
- Decision maker: Song Sanghoon (directive)

## Background

Loading a conversation from the terminal (Claude Code CLI) in the agent panel caused it to crash on the first turn:

```
Internal error: API Error: 400 Tool reference 'Edit' not found in available tools
```

The cause is that tool names differ between the two sides. mew
advertised `fs: { readTextFile: true, writeTextFile: true }` during the ACP handshake (the file-tool boundary from ADRs 0034 and 0043), and the adapter disables
the CLI's file tools in response:

```js
if (clientCapabilities?.fs?.readTextFile) { allowedTools.push(acp.read); disallowedTools.push("Read") }
if (clientCapabilities?.fs?.writeTextFile) { disallowedTools.push("Write", "Edit") }
```

As a result, panel sessions use `mcp__acp__Read`, while CLI sessions use `Read` and `Edit`. If a tool name in the transcript is missing from the current
process's tool list, the API rejects it with 400—a conversation created on one side can never be
opened on the other. This works both ways (using CLI `--resume` on a panel session fails for the same reason).

## Decision

Advertise no client capabilities. `clientCapabilities: {}`.

- The CLI handles files directly with its own `Read`, `Write`, and `Edit`. Do not use `mcp__acp__*`
- Remove mew's `readTextFile` and `writeTextFile` implementations and path checks (`#scoped`)—without advertising them, this code cannot be called, and
  leaving it in place suggests a boundary that does not exist.
- `terminal` was never advertised. This remains unchanged

## Rationale

- The boundary was not actually blocking anything. Anyone opening the panel is an owner/manager, someone who already has a shell that can
  access the entire workspace (ADR 0037). Bash is not path-scoped, so restricting only the file tools still lets the same person
  do the same thing through the shell. This takes the reasoning behind ADR 0043's removal of the project boundary one step further.
- Being able to continue conversations on either side is more valuable. Continuing in the panel on a phone and then in a terminal at a desk is
  why this panel was built.
- The alternative (filtering CLI-created sessions out of the panel's session list) only hides the symptom. Conversations remain split even with filtering

## Results

- Paths outside the workspace are no longer blocked. The agent can write files anywhere permitted by the same Unix
  user permissions as the mew server. The gate (`authorizeTmux`) is the only remaining control; there is no OS-level isolation. The user
  knowingly chose this tradeoff—restoring the boundary would require giving up CLI compatibility, so it will not
  be reverted for the same reason. The real solution is OS-level isolation (the kind deferred by ADR 0037), not an fs capability.
- Sessions created in the agent panel before this change can no longer be loaded. Their transcripts contain `mcp__acp__Read`, and the current
  process does not have that tool—the same 400, just in the opposite direction. Sessions created from now on open
  on either side.
- The statement "File tools run inside the mew process" in SECURITY.md became untrue and was corrected
