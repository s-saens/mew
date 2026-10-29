---
title: "Mew ADR — Runtimes, Permissions, and Execution Surfaces"
created: 2026-09-11
updated: 2026-09-22
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0184 — Dedicated Mewcat assistant session and automatic MCP](../../0184-mewcat-assistant-session-mcp.md)

- [0165 — Shared agent guidance file](../../0165-mew-common-agent-guidance-file.md)

- [0157 — Manage native skill and MCP configuration and scopes](../../0157-mew-native-agent-harness-management.md)
- [0174 — Mew-owned commit skill](../../0174-mew-commit-skill-and-automatic-commits.md) — Shared file for all runtimes and automatic Git commits

- [0155 — Automatic project context forwarding and documentation initialization](../../0155-mew-project-agent-context.md)

- [0143 — Official Antigravity ACP and Google authentication](../../0143-mew-antigravity-official-acp.md)
- [0142 — Claude ACP chat and official CLI authentication](../../0142-mew-claude-acp-and-cli-authentication.md)
- [0134 — Separate work panels and shared docking](../../0134-mew-dockable-workspace-panels.md)
- [0123 — Codex ACP uses the Codex CLI installed on the computer as its engine](../../0123-mew-codex-acp-uses-host-cli.md)
- [0119 — Terminals and agents share a single tab panel](../../0119-mew-unified-terminal-agent-panel.md) — Per-tab session ownership; panel separation is in 0134
- [0117 — The terminal surface in agent tabs](../../0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — retain the Gemini boundary; Claude ACP is in 0142, Antigravity ACP in 0143
- [0101 — Control runtime lifecycles in individual settings](../../0101-mew-runtime-lifecycle-controls.md)
- [0090 — Separate agent reasoning effort and permissions](../../0090-mew-agent-reasoning-and-permission-controls.md)
- [0089 — Prime Agent connects the official CLI's RPC through a Mew adapter](../../0089-mew-prime-agent-official-rpc-adapter.md) — RPC adapter; separation of thinking and permissions is in 0090
- [0074 — Switch the tab runtime from the header icon](../../0074-mew-agent-header-runtime-switch.md)
- [0063 — Per-runtime model and permission defaults](../../0063-mew-agent-runtime-saved-defaults.md)
- [0061 — Migrate to the official Claude ACP adapter](../../0061-mew-claude-acp-official-org-migration.md) — Pinned adapter; interactive tabs and authentication are in 0142
- [0060 — Unified runtime registry for windows, sets, and scheduled tasks](../../0060-mew-shared-agent-runtime-registry.md)
- [0044 — CLI tool parity and disabling ACP fs](../../0044-mew-agent-cli-tool-parity.md)
- [0043 — Workspace scope and runtime selection](../../0043-mew-agent-workspace-scope-and-runtimes.md) — Workspace scope; subsequent decisions apply to cwd and the runtime list
- [0037 — Permission modes and bypass by default](../../0037-mew-agent-bypass-permissions-default.md)
- [0034 — Reintroducing the ACP agent panel](../../0034-mew-agent-panel-acp-reintroduction.md) — Basic ACP boundaries; subsequent decisions apply to terminal, permissions, and packages
