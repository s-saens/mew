---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Connect Claude through ACP chat and official CLI authentication. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0142 — Connect Claude through ACP chat and official CLI authentication"
created: 2026-09-14
updated: 2026-09-14
---

- Date: 2026-09-14
- Status: Adopted
- Partially supersedes: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Claude's interactive terminal surface and authentication placement; retain the Antigravity and Gemini decisions
- Decision makers: User (requested restoring Claude ACP and a Codex-level authentication flow), Codex (implementation)

## Background

The user requested using Claude ACP again in a structure where Mew provides an agent UI without reselling provider usage. The ACP adapter was already used for scheduled tasks, while only interactive Claude tabs had been separated into the official TUI. Changing only the UI would leave CLI-based account lookup and authentication environments inconsistent with the adapter execution environment.

## Decision

- Restore ACP as the default interactive surface for `claude` and display it as `Claude Agent` in accordance with SDK branding guidance. Reuse the pinned `@agentclientprotocol/claude-agent-acp` and shared ACP chat, session restoration, and authentication center.
- The official Claude Code `auth login` command owns authentication. Distinguish subscription and Console selections, and integrate with the shared internal browser, CLI exit status, and retry flow for failures or interruptions. If a manual authorization code is required, pass it temporarily only to the relevant login CLI; do not add an API for entering or storing OAuth tokens.
- ACP execution, login, logout, and account lookup use the same CLI engine and provider environment. Prefer an explicitly specified CLI path; otherwise, use the adapter's official CLI delegation path. Do not send conversation prompts for status queries.
- Retain the Claude executable from the old terminal settings as the CLI engine path. The existing `MEW_AGENT_CMD`/`MEW_AGENT_CLAUDE_CMD` handle the ACP adapter path. Do not incorrectly pass arbitrary official CLI TUI arguments to ACP.
- Do not delete existing Claude CLI session files. Select the original conversation in ACP history to continue it. Do not forcibly terminate old running tmux processes during deployment preparation.
- Check model/protocol and authentication regressions with temporary fake CLI/ACP implementations; do not automatically perform actual account logins or run paid prompts.

## Scope of contract interpretation

ACP/SDK UI integration itself is separate from reselling usage. The [Anthropic SDK announcement](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) explains that changes to SDK use with personal subscriptions have been put on hold, and [Zed](https://zed.dev/docs/ai/external-agents) also uses users' own authentication. At the same time, the [SDK product guide](https://code.claude.com/docs/en/agent-sdk/overview) explicitly restricts offering claude.ai login in one's own product without approval. Therefore, do not interpret the absence of resale alone as securing permission for all commercial cloud subscription integrations.

This decision restores the ACP connection in the current user-owned execution environment. Offering a paid cloud service to the general public requires separately establishing per-user isolation and the actual authentication and billing contracts. Follow the [license review](../../work/agent-model-license-review.md) for detailed rationale.
