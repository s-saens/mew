---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0048 — Agents are not children of mew. A supervisor process owns them, and mew connects through a socket"
created: "2026-08-11"
updated: 2026-10-14
description: "Preserves the decision for a supervisor process with a lifecycle separate from the mew server to own agent sessions and reconnect through an internal socket. Links to subsequent decisions on OS memory control, restoration, root switching, and native Windows support."
---

- Date: 2026-08-11
- Status: Adopted
- Subsequent decision: [0164](0164-mew-agent-memory-protection.md) — OS memory limits for worker processes; retain the independent supervisor lifecycle
- Subsequent decision: [0079](0079-mew-agent-tabs-resume-after-idle.md) — restoration after supervisor shutdown
- Subsequent decision: [0092](0092-mew-agent-survives-root-project-switch.md) — shut down supervisors when switching roots
- Subsequent decision: [0209](0209-mew-native-windows-host-platform.md) — add native Windows support through a common app and OS execution layer; retain existing supervisor lifecycle, loopback, and personal data boundaries
- Decision maker: Song Sanghoon (directive)

## Background

Since [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md), agents had been child processes launched by the mew server using `spawn`, and ACP session state (transcript buffer, queue, pending approvals) lived in the mew process's memory. Thus, mew's lifecycle was the agent's lifecycle:

- Restarting mew (deployment, configuration change, crash) immediately killed the running turn. `serve.ts` deliberately killed all children on exit—otherwise orphans accumulated (on 2026-08-10: 28 processes accumulated over 6 days, 3.4 GB)
- Sessions were killed after 10 minutes with no connected window. Whether work was underway was not checked—assigning a long task and closing the window cut it off at 10 minutes

In other words, "assign work and walk away" did not work. The symptom users experienced was "the agent stops when mew shuts down."

## Decision

Launch a separate supervisor process (`server/agentHost.ts`) for each session. mew is a relay connected to a Unix socket.

```
브라우저 ──WS(/api/agent/ws)── mew ──유닉스 소켓── 감독 프로세스 ──stdio ACP── 어댑터 ── CLI
                                                 (<DATA_DIR>/agent/<runtime>-<hash>.sock)
```

- The supervisor starts with `detached`, outside mew's process group. Running turns continue even if mew dies. When mew restarts and connects to the same socket, it receives all past events again, restoring the conversation intact (the buffer is the one `AgentSession` already held—the existing reconnection restoration path is reused)
- The supervisor exits on its own only when no one is watching and no work remains (default: 30 minutes). It starts a fresh 30-minute countdown **once all work, queued tasks, and authentication in progress have finished**, and does not exit while working—this is the difference from the old idle shutdown and the point of this ADR
- Only closing a tab (`close_session`) terminates the supervisor. Closing the window or shutting down mew only disconnects the socket
- When switching workspaces, shut down all supervisors for the previous cwd (`shutdownAgentHostsForWorkspace`)—a session's cwd is set at startup

### Do not use tmux

The instruction was "use tmux sessions or something similar," but ACP is ndjson flowing over stdio. Running it inside tmux sends those lines through a pty, where echo, newline handling, and wrapping to terminal width corrupt them. What is needed is a supervisor, not a terminal, so use one process + a Unix socket instead of a pty. Logs remain available for inspection in `<socket>.log`.

### Security

Connecting to the socket effectively grants a shell (the agent uses Bash). Therefore, `<DATA_DIR>/agent/` is created with `0700` permissions and the socket with `0600` permissions — only the same Unix user can open them. WS continues to enforce the browser-side boundary (owner/manager) (`~/dev/liiiiv/mew/SECURITY.md`). This decision adds no isolation — running with the same user privileges as the mew server is unchanged from ADR 0044, and there is still no OS-level isolation.

## Results

- A mew restart or crash does not interrupt agent work. Tasks assigned before a deployment survive it.
- `serve.ts` does not kill agent tab supervisors on exit. Orphan cleanup (`reapOrphanAgents`) remains — since an adapter's owner marker is now the supervisor PID, only adapters whose supervisors have also died are remnants.
- The session's RAM remains allocated while its supervisor is alive. In the old structure, RAM was released when mew died — idle shutdown now takes over that role.
- To revert, have `agentWs.ts` manage `AgentSession` directly instead of `connectAgentHost`. `AgentSession` was left unchanged (it simply runs inside the supervisor).
