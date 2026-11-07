---
title: "Use main for ordinary agent work"
description: "Removes account-specific branch strategies and Git automation in favor of direct work on main, while preserving commit preferences, saved guidance, and existing branches/worktrees. Supersedes the automation portions of ADRs 0045, 0046, and 0054."
created: "2026-11-07"
updated: "2026-11-07"
---

## Status

Accepted. Supersedes configurable agent branching and automation from [0045](0045-agent-branch-guidance.md), [0046](0046-agent-git-automation.md), and the generated-worktree guidance and version upgrades from [0054](0054-internal-worktrees.md). Worktree navigation, path handling, and traversal exclusions remain supported.

## Context

Account-specific Git defaults created different working branches and folders for the same project. Development could continue from an older checkout while deployment used newer main commits. The user requested one main workflow and removal of the branch-strategy settings for all accounts.

## Decision

Remove branch strategy, automation, and detailed branch controls from Default Instructions. Keep commit timing and commit language independent. For ordinary agent tasks, use `main` in an existing working folder, preserve existing work, and do not create branches or worktrees or merge automatically. Explicit user requests and repository restrictions still govern exceptions; pushes require a user request.

Omit saved branch sections from request context without rewriting account MD/TXT files. Do not preserve old automation permissions in effective requests. Reject new branch-setting API writes and remove the branch snapshot field. Preserve existing branches, worktrees, and their unique changes. Do not bulk-merge or delete them as part of removing this setting.

The [guidance contract](../development/agent-guidance.md#git-working-behavior) owns exact behavior and compatibility. The [usage guide](../../../docs/guides/project-setup.md#git-branch-guidance) explains the remaining settings.

## Alternatives and rationale

- Changing only the default would leave existing account selections active and retain the reported inconsistency.
- A per-project strategy override would add another precedence rule and keep unnecessary workflow controls.
- Automatically merging and deleting all old worktrees would risk unrelated or unique work and running sessions.

A single request-time rule removes the account-dependent source of new branches while retaining normal Git history and explicit Git operations.

## Consequences

All accounts use the same ordinary workflow after the user applies server code and reopens existing agent tabs. Frontend builds update the settings UI but do not reload supervisors. Existing checkouts may still need deliberate reconciliation; this decision does not rewrite history or move running servers. Missing or unsafe main checkouts are reported with their actual blocker.
