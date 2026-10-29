---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the Mew commit skill and automatic commits by task. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0174 — Mew commit skill and automatic commits by task"
created: 2026-09-23
updated: 2026-09-23
---

- Status: Adopted
- Decision maker: User request
- Partially supersedes: [0166](0166-mew-git-ai-commit-drafts.md), [0170](0170-mew-git-selected-files-and-composer.md) — actual commits by task instead of applying AI drafts and separately confirming commits
- Partially supersedes: [0157](0157-mew-native-agent-harness-management.md) — add a Mew-owned commit skill; retain source management for general runtime skills

## Decision

The canonical source for the commit procedure is `skills/commit/SKILL.md` in the server data folder. Create it from an initial template, then preserve subsequent user edits. Read and edit it in Mew Skills management; Mew `/commit` in every runtime and Git AI Auto Commit use the same file. Do not distribute or duplicate it as a runtime-global or project skill.

The execution button for AI Auto Commit means executing actual commits that divide selected files by task. An independent tmux or ACP task reads the skill, change snapshot, and recent message conventions to create a per-file commit plan. Mew validates the plan's scope, duplicates, omissions, and whether changes have occurred, then commits each group and records hashes, files left uncommitted, and failures. The initial implementation splits at the file level, keeping multiple hunks in one file in the same commit.

Preserve the boundaries of the current project repository and selected files. Preserve unselected changes and staging state, and do not push. Do not revert commits created before cancellation or failure; retain them in the results. Do not automatically execute draft tasks from earlier versions. Merely mentioning the skill in a regular conversation does not grant commit authorization; follow the scope of the user's request and shared commit guidance.

## Rationale

The user requested behavior like `/commit` that records logically distinct changes in multiple commits when needed. Using one file as the shared standard prevents runtime-specific skills and guidance within the button from diverging.

Current behavior is documented in [Git Usage](../../../../docs/guides/projects.md#git-operations-panel), [Skill Management](../../../../docs/configuration/agent-harness.md), and [Execution Contract](../../development/agent-sessions.md).
