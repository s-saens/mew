---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Migrate the Mew Claude ACP adapter to the official agentclientprotocol package. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0061 — Migrate the Mew Claude ACP adapter to the official agentclientprotocol package"
created: 2026-08-20
updated: 2026-09-11
---

- Date: 2026-08-20
- Status: Adopted
- Subsequent decision: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Claude interactive tabs use the official TUI; retain the ACP package for scheduled jobs
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0034](0034-mew-agent-panel-acp-reintroduction.md) fixed `@zed-industries/claude-code-acp` as the first Claude backend. This package
has been deprecated, and npm also advises migrating to `@agentclientprotocol/claude-agent-acp` to continue receiving
updates. The successor repository is maintained under the official ACP GitHub
organization.

## Options

1. Keep the deprecated package at `0.16.2` — current behavior remains unchanged, but future fixes and ACP updates will not be received.
2. Migrate to the official successor package — contract tests are required because the executable name and adapter version change.

## Decision

Option 2 adopted. The Claude runtime installs a pinned version of `@agentclientprotocol/claude-agent-acp` as a local dependency and runs
`node_modules/.bin/claude-agent-acp`. The principle of not using `npx @latest`, the ACP boundary, permission gates, and environment variable overrides remain
in place. This decision replaces only the specific Zed package choice in ADR 0034.

## Rationale

- The old npm package is deprecated and explicitly names the official successor package.
- The successor repository, TypeScript SDK, and Codex adapter are all under the official `agentclientprotocol` organization, consolidating the maintenance boundary
  for ACP-related dependencies in one place.
- The successor adapter also supports the existing `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_EXECUTABLE` environment variables and the ACP stdio entry point.

## Results

- The package and executable names change. During deployment, the new binary must exist after `npm install`.
- The successor package requires Node 22 or later. Mew's supported runtime must also meet this minimum.
