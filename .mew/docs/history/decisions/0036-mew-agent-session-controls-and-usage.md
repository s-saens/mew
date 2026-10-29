---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent panel session controls (New Session, Load), prompt queue, and token usage display. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0036 — mew agent panel session controls (New Session, Load), prompt queue, and token usage display"
created: 2026-08-05
updated: 2026-09-11
---

- Date: 2026-08-05
- Status: Adopted
- Subsequent decision: [0046](0046-mew-agent-panel-tabs-one-session-per-tab.md) — One session per project
- Subsequent decision: [0047](0047-mew-agent-session-list-from-disk-and-nonblocking-connect.md) — ACP-only session list
- Subsequent decision: [0103](0103-mew-queued-clear-session-boundary.md) — Immediate /clear behavior
- Subsequent decision: [0118](0118-mew-agent-queue-edit-lock.md) — Immediate sequential queue execution during editing
- Subsequent decision: [0122](0122-mew-codex-history-load-restarts-writer.md) — Reuse the writer when loading Codex history
- Decision maker: Song Sanghoon (directive)
- Related: Supplements [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) (does not supersede it)

## Background

The agent panel restored by [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) only supported "one session per project, retained even when the panel closes." Actual use revealed three things available in the CLI but missing from the panel.

1. There is no `/clear` or `/resume`. There is no way to clear a conversation or return to a previous one. The only reset mechanism was to leave the panel idle for 10 minutes and wait for the idle timer to kill the process.
2. Messages cannot be sent while a turn is running. `AgentSession.prompt()` threw `이미 진행 중인 턴이 있습니다`, and that string appeared verbatim as an error in the panel. Users had to watch for the turn to finish and then enter their message again.
3. There is no visibility into what the session is currently using. The model, turn count, start time, and token usage are nowhere to be found.

## Decision

### 1. Control sessions only through ACP methods

`/clear` = `session/new`, `/resume` = `session/list` + `session/load`. All three exist in ACP and are implemented by `@zed-industries/claude-code-acp` 0.16.2 (`loadSession: true`, `sessionCapabilities.{list,fork,resume}`).

- Reuse the child process. Opening a new session does not kill and restart the agent — it calls `session/new` again over the same connection.
- There is still only one live session per project. "New Session" and "Load" replace that session, and the panel discards the conversation rendered so far when it receives a `reset` event. Running multiple sessions simultaneously is outside this decision's scope — previous conversations remain in the list, so users can return to them.
- Determine feature availability through capabilities. Pass `agentCapabilities` from the `initialize` response directly to the panel, and do not render the corresponding buttons for backends that report no support. Switching vendors makes the buttons disappear instead of silently breaking them.

### 2. Queue input during execution instead of blocking it

`prompt()` no longer throws. If a turn is running, it queues the input, and the server runs queued inputs in order when the turn finishes.

- The queue lives on the server. It remains intact even if the panel closes or the user reconnects from another device.
- Stop (`cancel`) also clears the queue. Having the next item run automatically after being told to stop would be surprising behavior.
- Queued messages can be canceled individually.

### 3. Read token usage from Claude Code session JSONL — the only exception outside ACP

The ACP 0.14 schema has `Usage` and `UsageUpdate` types, but `claude-code-acp` 0.16.2 sends no usage data (there is no usage-sending code anywhere in the adapter's dist). Therefore, it cannot currently be obtained through the protocol.

So `server/agentUsage.ts` reads `<CLAUDE_CONFIG_DIR>/projects/<인코딩된 cwd>/<sessionId>.jsonl` directly. This is an intentional exception to ADR 0034's "ACP is the interface," so it comes with conditions.

- It is read-only, and absence is acceptable. If the file is missing or its format changes, only the usage field shows "No Records"; the rest of the panel continues to work. Conversations, permissions, and file scopes do not depend on this file.
- Use the same path convention as the adapter (`cwd.replace(/[^a-zA-Z0-9]/g, '-')`). A mismatch only makes usage appear empty.
- Lock down the file parsing contract with tests (`server/agentUsage.test.ts`). If the vendor format changes, this is where it fails first.
- Do not expand it to other purposes. Conversation restoration, session lists, and model information all come through ACP. This file is exclusively for displaying usage and turn counts. Delete this module when the adapter starts sending `UsageUpdate`.

### 4. Send state as snapshots rather than events

Send the session ID, start time, turn count, running status, queue, and usage together as `{type:'meta', meta}`. Do not accumulate them in the event buffer — conversations are replayed on reconnection, not state; buffering state would replay outdated snapshots and briefly render old values in the panel.

## Results

- Usage numbers come only from the Claude Code backend. With another ACP backend, that field is empty, which is not a bug.
- Total tokens are the cumulative sum of input, output, cache writes, and cache reads. Cache reads are counted again each turn, so interpret this as usage volume rather than billing. The context field indicates "how heavy it is right now."
- When loading a previous session, history arrives as a replay of `session/update`, which has no `turn_start` or `turn_end`. The panel's folding rules also handle this case by having a user utterance close the preceding turn (`src/utils/agentFold.ts`, covered by tests).
- The one-session-per-project restriction remains. Running two conversations simultaneously in one project requires a separate decision.
