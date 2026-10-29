---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Git AI Commit generates drafts through dedicated tmux and ACP tasks. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0166 — Git AI Commit generates drafts through dedicated tmux and ACP tasks"
created: 2026-09-22
updated: 2026-09-22
---

- Status: Adopted
- Subsequent decision: [0174](0174-mew-commit-skill-and-automatic-commits.md) — changed to actual split commits using a Mew skill; independent tasks, permissions, and reconnection remain
- Decision maker: User (approved agent set selection and creation and dedicated task execution)

## Decision

- AI Commit generates a commit title and description using a selected saved agent set or a newly created one. Confirm actual staging and committing with the existing commit button.
- Target only the repository at the current project root ([0160](0160-mew-git-current-project-only.md)). Capture changed files and diffs before generation, and fix the agent set's runtime, model, and roles for each task.
- Reuse the registry and one-shot ACP path from [0060](0060-mew-shared-agent-runtime-registry.md). Run a separate session in a per-task tmux instance without submitting requests to existing conversations, tabs, or queues.
- Store task status and results per account and repository on the server for retrieval after reconnecting. Prevent duplicate execution and distinguish cancellation, timeout, and failure. Do not overwrite user-edited drafts with late-arriving results.
- Generation requests require both Git and agent feature permissions. tmux is an internal execution mechanism and does not expose arbitrary shell input. Instruct the agent to read only the provided changes and return only a JSON draft, and reject approval requests. This decision does not add OS file isolation; existing agent execution permission boundaries remain.

## Rationale

tmux handles task lifetime and output, while ACP handles shared runtime and model selection and completion determination. Do not parse interactive TUI screens or separately implement runtime-specific CLI commands.

Current operations and limitations are defined in [Git usage](../../../../docs/guides/projects.md#git-operations-panel).
