---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent window: read session lists directly from disk, and connect without waiting for agent startup. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0047 — mew agent window: read session lists directly from disk, and connect without waiting for agent startup"
created: 2026-08-11
updated: 2026-08-20
---

- Date: 2026-08-11
- Status: Adopted
- Decision maker: Song Sanghun (instruction: "The agent window is too slow—use caching or async processing so at least subsequent connections are fast")
- Related: Partially supersedes "Get the session list through ACP" in [ADR 0036](0036-mew-agent-session-controls-and-usage.md) §3. Supplements [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) and [ADR 0046](0046-mew-agent-panel-tabs-one-session-per-tab.md)

## Background

After opening the window, it took several seconds for the previous session list to appear. More tabs made it take proportionally longer. There were two causes.

1. The adapter's `session/list` reads entire session files. In `claude-code-acp` 0.16.x, `unstable_listSessions` reads every `*.jsonl` in the folder to the end with `readFile`, then uses only the first lines. In this workspace, that is 256 files totaling 266MB. Measurement: 959ms per adapter call (with a warm page cache). The window has one adapter per tab ([ADR 0046](0046-mew-agent-panel-tabs-one-session-per-tab.md)), so this multiplies by the number of tabs, and each blocks its own process's event loop for that duration.
2. The WS waited for agent startup before communicating. `handleConnection` would `await` `sessionFor()` before sending `ready` and attaching the message handler. Measurement: spawn+`initialize` 188 ms + `newSession` ~900 ms. The window stayed blank during that time, and questions sent in the meantime silently disappeared (the handler was not attached yet).

## Options

1. Wait for the adapter to be fixed—0 lines of our code / dependent on someone else's release, while the window remains slow.
2. Only cache adapter call results—small change / the first call after server startup still takes 1+ seconds, and the adapter process stalls during that time. Each tab has its own cache.
3. Read only the session list directly from disk ourselves—steps just beyond the boundary set by [ADR 0036](0036-mew-agent-session-controls-and-usage.md) / even the first call is fast, the cache is shared across the process, and responses require no child process.

## Decision

Option 3 + asynchronous connection handling.

### 1. `server/agentSessionList.ts` reads the session list from disk (claude runtime only)

- Read only the first 64 KB of each file. The title (first user message) and `cwd` are at the beginning of the file.
- Do not reread if `(mtime, size)` is unchanged. The cache is module-global and shared by all tabs.
- Title normalization, excluding `agent-*.jsonl`, rechecking `cwd`, and returning the 50 most recent entries follow the adapter's rules—so names already shown in the list stay the same.
- Only when `runtime === 'claude'`. Other runtimes continue to use `unstable_listSessions`. This shortcut is used only for a backend whose record format is known.
- Loading sessions still uses ACP `session/load`. Disk access is used only for the list.

### 2. WS does not wait for the agent to start

- Send `ready` and the session list immediately upon connection. The list reads only from disk, so no child process is needed.
- Client messages received during startup: discard → queue. Once the session starts, forward them in order. The window accepts questions during startup, and the status bar says "Preparing Agent".
- The window renders the previous sessions screen upon receiving either `meta` (= the agent has started) or the session list, whichever arrives first.

## Rationale

- Measurements (256 files, 266 MB, workspace `~/dev/liiiiv`):

| Path | First call | Subsequent calls |
  |---|---|---|
| Adapter `unstable_listSessions` (per tab) | 959 ms | 959 ms |
| Direct disk access + (mtime,size) cache | 202 ms | 26 ms |

- [ADR 0036](0036-mew-agent-session-controls-and-usage.md) §3 explicitly stated "Do not extend beyond usage" to prevent conversation correctness from depending on vendor file formats. The list does not carry that risk—it is read-only, format changes only leave the list empty or titles missing (parse failures skip only the affected file), and conversations, permissions, and loading do not depend on it. Apply exactly the same conditions as for usage.
- Share the path rules already known to `agentUsage.ts` (`sessionDirPath`)—to avoid two sets of rules.

## Results

- The list contract is enforced by tests (`server/agentSessionList.test.ts`—titles, most-recent ordering, cwd filtering, excluding `agent-*`, and rereading on mtime changes). If the vendor format changes, these tests fail first.
- Tests also establish that messages are no longer lost during startup (`server/agentWs.test.ts`—a fake agent deliberately slow to start).
- Reversion condition: once the adapter changes `session/list` to read only file headers, delete `agentSessionList.ts` and return to `unstable_listSessions`. Until then, this shortcut remains.
- Reconnecting while a session is alive was already fast (`sessionFor` returns the cached session). This decision fixes initial startup and cases with multiple tabs.
- Because the list uses only the first 64 KB of each file, records whose first user message appears later show an empty title. This was not observed in actual files (0 out of 256).
