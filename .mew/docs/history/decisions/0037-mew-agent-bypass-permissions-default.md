---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent panel: expose permission modes and default to bypassPermissions. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0037 — mew agent panel: expose permission modes and default to bypassPermissions"
created: 2026-08-05
updated: 2026-09-11
---

- Date: 2026-08-05
- Status: Adopted
- Subsequent decision: [0063](0063-mew-agent-runtime-saved-defaults.md) — Saved permission default; retain the fallback when no saved value exists
- Decision maker: Song Sanghoon (directive)
- Related: Reverses one invariant in [ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) (the others remain valid)

## Background

[ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) established "do not use `bypassPermissions` at the workspace root" as an invariant. Its rationale was an actual security hole in the old agent panel removed by [0014](0014-mew-agent-panel-removal.md).

But that invariant assumed OS-level isolation (containers) would be added soon. Actual use showed that the assumption does not hold.

- Even isolation cannot protect this project. Containers block access to the home directory, other projects, and `~/.ssh`, but the mounted project folder itself remains rw. Secrets inside it, such as `.dev.vars`, remain readable. The network cannot be blocked completely either, because `api.anthropic.com` must remain accessible.
- Isolation is costly. Each project's development environment (Flutter, Android SDK, etc.) must be reinstalled inside the container; otherwise, the agent cannot verify its own changes. ACP path mapping (`#scoped` and `UsageReader` slugs) must also be changed.
- Approval prompts do not actually block anything. The agent panel uses the same gate as `authorizeTmux` (owner/manager). Those users already have the same shell through the terminal. The prompts ask again for permissions they already have, and in actual use, everything gets approved.

## Decision

### 1. Allow permission mode selection in the window

Use ACP `session/set_mode` directly. Do not create a separate concept of modes — render the mode list exactly as the backend advertises it in its `session/new` response (`default`, `acceptEdits`, `plan`, `dontAsk`, `bypassPermissions`). If a mode is not advertised, its item simply disappears and the panel continues to work.

When the agent changes modes itself (such as exiting plan mode), a `current_mode_update` notification arrives, and the server uses it to keep the selector in sync.

### 2. The default is `bypassPermissions`

ACP sessions start in a restricted mode, so the server reapplies the default mode after every `session/new` and `session/load`. To revert, use `MEW_AGENT_MODE=default`.

As runtimes were added ([ADR 0043](0043-mew-agent-workspace-scope-and-runtimes.md)), it became clear that "allow everything" has a different name in each backend — claude `bypassPermissions` · codex `full-access` · hermes `dont_ask`. So instead of hard-coding one value, select from an ordered list of candidates: the first match among the modes advertised by that session. Because some names have opposite meanings (claude's `dontAsk` means "deny anything not preapproved"), the order is the rule. This decision remains unchanged — the agent panel runs without approvals regardless of the runtime used. Unattended agent set sessions (ADR 0052) use the same path.

This puts the agent panel in the same class of tools as the terminal. The gate remains `authorizeTmux`, and beyond it, execution proceeds without approvals.

### 3. Do not weaken the gate — this is the cost of this decision

Because `bypassPermissions` is the default, the owner/manager boundary becomes the only control. Therefore, enforce the remaining invariants in 0034 even more strictly.

- The agent WS's `authorize` must allow the same set as `authorizeTmux`. Do not open it to guests or members.
- Keep the file tools' project scope (`fs` capability + `resolveProjectPath`). With approvals removed, this is the only remaining path defense.
- Do not place `~/.claude/.credentials.json` anywhere members can access. Do not mount `/var/run/docker.sock`.

## Results

- Opening an agent window now means giving that person an unattended shell. There is no intermediate check through an approval prompt. If prompt injection succeeds, execution begins immediately with the mew server user's permissions — having the agent read untrusted documents or web content is now a practical risk.
- Switches back to safer behavior remain available: the window's mode selector (per session) and `MEW_AGENT_MODE` (server default).
- Container isolation is deferred, not abandoned. If revisited, its goal should be "protecting the home directory and other projects," rather than "protecting this project." That would require per-project images, `/work/<project>` mounts (to avoid slug collisions), and `#scoped` path mapping.
- A contract test was added (`server/agentAcp.test.ts`): when the fake agent advertises the mode, `bypassPermissions` is set immediately after the handshake, and turns actually run in that mode.
