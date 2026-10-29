---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Run CLI commands from agent conversations as independent tmux jobs. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0152 — Run CLI commands from agent conversations as independent tmux jobs"
created: 2026-09-16
updated: 2026-09-16
---

- Status: Adopted
- Follow-up decision: [0153](0153-mew-agent-cli-shared-queue.md) — Shared AI and CLI queue with sequential execution
- Decision maker: Song Sanghoon (directive)
- Scope: mew agent input and command records
- Partially supersedes: [0046](0046-mew-agent-panel-tabs-one-session-per-tab.md) — Allow independent CLI jobs to be linked to a tab's ACP conversation

## Decision

Place a CLI toggle, off by default, to the left of the model selector in the agent input bar. When enabled, input is a shell command for the corresponding cwd, rather than an AI prompt. Create a dedicated tmux immediately for each command. Do not apply the ACP queue, model, skills, or attachment composition.

Retain per-tab ACP conversation ownership from ADR 0046, but allow multiple independent CLI jobs to be linked to a conversation. Use account, runtime, cwd, and conversation ID as storage boundaries, and separate AI transcripts from command records. `/clear` and history navigation must not mix commands into a new conversation. Closing a tab also stops running commands started by that tab. Closing a popup, panel, or browser does not affect execution.

Display command bubbles in a monospace font with `$`, and responses as an Open Terminal button with a status color. Connect to tmux while running. A runner independent of the server streams output to gzip storage, atomically saves the completion status, and then terminates tmux. After completion, provide a preview of saved output and a download of the full compressed record.

Require both agent and terminal feature permissions (ADR 0150). The records HTTP API checks account ownership. Do not change the server control boundary for general tmux access.

## Rationale and consequences

Keep commands independent of browser connections and AI turn lifetimes, and preserve output even from commands that finish quickly. Do not duplicate large outputs in conversation transcripts or localStorage. The [mew session document](../../development/agent-sessions.md) is the canonical source for the recording and execution contracts.
