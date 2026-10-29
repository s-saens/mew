---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Agent sets: Bundle an agent, model, and role, and let the router distribute work. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0052 — Agent sets: Bundle an agent, model, and role, and let the router distribute work"
created: "2026-08-12"
updated: 2026-09-11
---

- Date: 2026-08-12
- Status: Superseded by: 0095
- Supersession confirmed: 2026-09-11 — [0095](0095-mew-agent-sets-as-tab-presets.md). The separate router, queue, and window were removed, and runtime, model, and role definitions are also covered by the subsequent preset decision.
- Decision maker: Song Sanghoon (directive)

## Background

The agent window ([ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) · [0046](0046-mew-agent-panel-tabs-one-session-per-tab.md)) is a conversation managed by a person. Each tab is one session, and the person viewing the window chooses where to put each prompt. To assign work with different roles (organizing documents, modifying code, and research), the person had to open multiple tabs and distribute work mentally, and those distribution rules were never recorded anywhere.

Another issue: closing the window removes the actor that drives that conversation's queue. [ADR 0048](0048-mew-agent-supervisor-process.md) already identified the inability to "assign work and walk away" as a problem.

## Decision

An agent set = one bundle of (agent runtime + model + role). Sets are arranged in a grid, and when work is submitted through a single input line, the router set decides where it goes.

```
입력줄 하나 ──▶ 라우터 셋(판정 전용) ──▶ 대상 셋의 큐 ──▶ ACP 세션 ── 어댑터 ── CLI
     └── @지목이 있으면 라우터를 건너뛴다 ──────────▶
```

- The role is a system prompt. ACP has no system prompt field, so it is prepended to the session's first prompt (`agentSetRunner.#compose`). It remains in context for the duration of the same session
- The router cannot be deleted, and its role cannot be edited. This set has only one job: making a routing decision. Editing its role breaks the decision format and silently breaks routing. Only the agent and model used to make the decision can be changed (the server enforces this by overwriting stored values — `normalizeSets`)
- The decision result is read as an id or name (`pickSet`). Models often answer with a name instead of an id, and when they add extra commentary, the conclusion is on the last line. If no set can be selected, the task remains a routing failure — it is not sent to an arbitrary set
- The server owns the queue and lifecycle. The window is for viewing, and WS (`/api/agentset/ws`) only streams state; it does not create sessions. Work continues even when the window is closed
- A session starts on its first task (lazy startup) and shuts down after 10 minutes of inactivity. Even with 20 sets created, RAM usage reflects only those actually working

### Why the agent window was not extended

The agent window assumes that "a person drives one conversation" (tab = session; events flow only while a window is attached). Sets assume the opposite: "work continues even when no one is watching." Putting them in the same window would give tabs two meanings — keep them in a separate window.

### Relationship to ADR 0048

0048 (the supervisor process) is not implemented yet (no `server/agentHost.ts` as of 2026-08-12). So the set runner currently also lives inside the mew process — restarting mew kills running set tasks and loses task history. When 0048 is implemented, it must move out under supervisor management along with agent window sessions. This document does not reverse 0048; it is unfinished work in the same direction.

### Security

Sets are ultimately agents that use Bash too. Both WS and REST use the same gate as the terminal (`authorizeTmux`, owner/manager). As a surface that runs arbitrary prompts unattended, they are in the same category as scheduled tasks (`schedules.ts`), and the default permission mode is `bypassPermissions`, as in [ADR 0037](0037-mew-agent-bypass-permissions-default.md). No additional isolation is added — OS-level isolation is still absent ([ADR 0044](0044-mew-agent-cli-tool-parity.md)).

## Results

- Division of work by role has moved outside the window. Distribution rules remain in each set's `role` string rather than in a person's head
- The extra router run delays the first response (one decision turn). When in a hurry, bypass it with `@이름`
- Task history exists only in memory (50 entries per set). If persistence becomes necessary, `<DATA_DIR>/agent-sets/<id>.jsonl` is the next step
- To revert, delete the window (`AgentSetPanel`) and the 3 server files (`agentSets.ts` · `agentSetRunner.ts` · `agentSetWs.ts`). The agent window was not touched — only `AgentSession` and the runtime registry are shared
