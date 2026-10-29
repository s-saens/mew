---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Codex account usage opens the official dashboard directly. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0104 — Codex account usage opens the official dashboard directly"
created: 2026-09-01
updated: 2026-09-11
---

- Date: 2026-09-01
- Status: Superseded by: 0130
- Supersession confirmed: 2026-09-11 — [0130](0130-mew-agent-account-entitlement.md). The prohibition on account queries and exclusive use of an external dashboard were replaced with official CLI queries and an internal subscription page.
- Supersedes: [0098](0098-mew-agent-account-usage-cli-bridge.md)·[0100](0100-mew-agent-account-usage-summary.md) — the scope of CLI account usage queries, summaries, and raw output display in the Info popup
- Decision makers: Song Sanghun (direction), Codex (implementation)

## Background

Account usage queries in the Info popup ran slash commands from the Codex or Claude Code CLI in a temporary tmux session; for Codex, they also provided a link to the official Usage dashboard showing the same information. Users want to open the official dashboard directly when checking limits instead of viewing CLI bridge results.

## Decision

- `조회` in the Codex Info popup is a standard link that opens `https://chatgpt.com/codex/settings/usage` in a new tab.
- Mew does not execute or read the CLI, tmux, authentication stores, or provider APIs to query account usage.
- Remove raw CLI output, limit summaries parsed by Mew, and the Claude Code account usage query UI and its API. Runtimes without an official web dashboard link do not display this UI.

## Results

Responsibility for displaying, authenticating, and refreshing account limits and billing information remains with the provider dashboard, and queries from the Info popup do not change local agent sessions or CLI state.
