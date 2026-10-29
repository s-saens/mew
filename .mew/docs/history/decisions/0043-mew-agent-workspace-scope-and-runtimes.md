---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew agent panel is workspace-scoped. The runtime (Claude Code or Hermes) is selected in the panel. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0043 — The mew agent panel is workspace-scoped. The runtime (Claude Code or Hermes) is selected in the panel"
created: 2026-08-10
updated: 2026-09-11
---

- Date: 2026-08-10
- Status: Adopted
- Follow-up decision: [0077](0077-mew-agent-tab-working-directory.md) — cwd fixed to the workspace
- Follow-up decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Gemini runtime and Claude interactive ACP surface
- Decision maker: Song Sanghoon (directive)

## Background

The agent pane restored by ADR 0034 was tied to a project — `/api/agent/ws?project=<이름>`, the session's cwd was that project folder, and
the session registry was also keyed by project. File tools rejected access outside the project.

The actual work requested does not stop at one repo. Decisions go in docs, implementation in a product repo, and runbooks somewhere
else. With project scope, conversations split whenever tabs change, and the agent cannot read neighboring
repos, making "fix it according to docs" impossible.

Also, the upper-left corner of the pane showed only "Agent," so there was no way to tell what was connected. Replacing
the backend required editing `MEW_AGENT_CMD` and restarting the server.

## Decision

Expand the agent panel's scope to the workspace. Sessions are separated by runtime rather than project.

### 1. One session per workspace (per runtime)

- The session's cwd is `WORKSPACE_ROOT`. The same panel and conversation appear regardless of which project is being viewed
- The channel is `/api/agent/ws?runtime=<id>`. Reject IDs absent from the registry (`RUNTIMES`) with 400. If omitted, default to `claude`
- Expand the file tool boundary (ACP `fs`) to the workspace as well — do not block access between projects. That is the purpose
  of this change. Going outside still results in `UnsafePathError`
- Switching workspaces (ADR 0042) shuts down all running sessions (`disposeAllSessions`) — a child process's cwd is set at startup
  and remains tied to the old folder

### 2. Select the runtime in the window; selection does not grant additional permissions

- The upper-left corner of the panel shows the currently connected runtime's icon instead of text. Click it to open the list and switch runtimes there
- The selection is stored only in the browser (`mew:agent-runtime`) — it is not a server setting. Each person can use a different runtime
- When switching, the other session remains on the server. Returning replays past events so the conversation continues
- Execution commands are determined solely by server environment variables: `claude` uses `MEW_AGENT_CMD` (bundled default:
  `claude-code-acp`), and `hermes` uses `MEW_AGENT_HERMES_CMD` and `MEW_AGENT_HERMES_ARGS` (default: `hermes acp`). There is no path that turns a browser-supplied
  string into a command — a single id only selects a registry entry
- mew does not bundle Hermes. If its entry point is missing or it does not speak ACP, the pane shows "Failed to start agent"
  — it is not hidden from the list (hiding it would require attempting to run it every time)
- The client also has a runtime list for the icons. The server always makes the decision

## Rationale

- Project-scoped isolation provided no value. Anyone opening the panel is already an owner/manager, someone with a shell that can access the entire
  workspace (ADR 0037). Restricting only the file tools to a project does little when the same person can use Bash to modify a neighboring
  repo; the restriction was blocking the user, not an attacker.
- Adding vendors still means replacing the spawn target (ADR 0034). The runtime registry merely names each set of spawn arguments;
  it is not a custom adapter interface—the decision that ACP is the interface remains unchanged.
- Keeping runtime selection in server settings requires a restart, and one person's change affects everyone. Keeping it in the browser
  does neither.

## Results

- Conversations are no longer separated by project. The adapter stores old sessions by cwd, so past sessions
  whose cwd was a project folder no longer appear in the panel's "Previous Sessions" list (the files remain).
- The path used to read token usage also changes with cwd (`<CLAUDE_CONFIG_DIR>/projects/<인코딩된 cwd>/…`)—a new workspace-based folder is created. If it does not exist, only
  the usage field stays empty (following the same rule as ADR 0036).
- To add a runtime, add one entry to both the server's `RUNTIMES` and the client list (icons). Updating only one side silently creates a mismatch:
  the server returns 400, or the panel shows the default icon.
