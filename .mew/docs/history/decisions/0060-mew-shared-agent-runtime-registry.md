---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew agent runtime is a registry shared by windows, sets, and scheduled tasks. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0060 — The mew agent runtime is a registry shared by windows, sets, and scheduled tasks"
created: 2026-08-20
updated: 2026-09-11
---

- Date: 2026-08-20
- Status: Adopted
- Subsequent decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — ACP-only surface and Gemini registration
- Subsequent decision: [0123](0123-mew-codex-acp-uses-host-cli.md) — Codex adapter engine selection
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0043](0043-mew-agent-workspace-scope-and-runtimes.md) opened up runtime selection in the agent window through a registry of `claude`, `codex`, and
`hermes`. [ADR 0052](0052-mew-agent-sets-router-dispatch.md) stated that agent sets also use the same session/runtime
path.

However, scheduled tasks (`schedules.ts`) were implemented separately. Only `claude` and `hermes` were hardcoded, and unattended execution commands were
string templates for each CLI. As a result, Codex could be selected in the agent window but not in crontab. This signaled
that runtimes had diverged across screens.

## Options

1. Add only the `codex` command to scheduled jobs — quick, but the same problem recurs with each new runtime.
2. A registry of headless CLI templates per runtime — improves cron, but still diverges from the ACP path used by the agent window and agent sets.
3. A shared ACP runtime registry, with scheduled jobs also using a one-shot ACP runner — all surfaces use the same runtime definitions.

## Decision

Option 3 adopted. mew has a single source for agent runtime definitions: `server/agentRuntimes.ts`. The agent window, agent sets, and scheduled
tasks all use the ACP spawn specs in this registry.

Scheduled tasks no longer construct runtime-specific CLI templates directly. The cron line starts
a dedicated tmux session for the job, then runs `server/runAgentJob.ts`. This runner accepts `--runtime`, `--prompt-file`, `--log-file`, and `--cwd`, creates a one-off
ACP session, and runs one prompt turn to completion.

The initially registered runtimes are `claude`, `codex`, `hermes`, `kimi`, `gemini`, `openclaw`, `opencode`, and `cursor`. If the official
ACP entry point or actual installation path differs, override it with `MEW_AGENT_<ID>_CMD` and `MEW_AGENT_<ID>_ARGS`.

## Rationale

- Scheduled tasks ultimately also “send a prompt to an ACP agent at a scheduled time.” Separate execution paths for each UI would cause supported
  runtimes and permission modes to diverge again.
- Keeping ACP as the shared boundary brings session creation, mode application, permission handling, log streaming, and runtime validation into one code
  path.
- Cron still creates tmux sessions. This preserves the existing operational practice of inspecting unattended execution later through a terminal
  popup.

## Results

- Adding a runtime requires changing only `agentRuntimes.ts` on the server and `src/components/agentRuntimes.tsx` for icons on the
  client.
- Runtimes that do not speak ACP reveal themselves through handshake failures when run, even if they appear in the list. Hiding them would require running them on every check, so
  they are not hidden.
- The “Project” field of a scheduled job becomes the runner's ACP `cwd`. If empty, it defaults to the workspace root.
