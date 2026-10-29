---
title: "Switch the feature panel to branch-based work and previews"
description: "An earlier contract superseded by subsequent decision 0065. The decision displays work by local Git branch and worktree, along with /port-number previews, in the feature panel instead of the existing feature document hierarchy. It distinguishes runtime status, verification records, and user verdicts while preserving Markdown documents, existing execution APIs, and automatic Git handling settings."
created: "2026-10-22"
updated: "2026-10-26"
---

> On 2026-10-26, [0065](0065-remove-feature-panel.md) superseded the contracts for the feature panel, branch work ledger, dedicated API, and CLI. The decision at that time follows.

## Status

Accepted. Supersedes the feature panel display and editing scope in [earlier decision 0194](../history/decisions/0194-mew-readonly-feature-panel.md), [0196](../history/decisions/0196-mew-file-backed-feature-tree.md), and [0198](../history/decisions/0198-mew-inline-feature-title.md). The preservation contracts for Markdown documents and existing APIs, CLI, execution queue, and history remain unchanged.

## Background

When multiple agents work in parallel on branches and worktrees, a list of feature documents alone makes it difficult to tell which work can be tried directly. Users need to find running apps and verification results in one place without switching the branch of the current folder for each task. Mew's existing `/포트번호` app access can serve as an entry point for each branch.

## Decision

Change the feature panel to a list of work by local Git branch in the current project. Read actual branches, worktrees, recent commits, and uncommitted changes, and separately store titles, work descriptions, verification records, user verdicts, and preview ports and paths. Store settings in the Git common directory so worktrees in the same repository share them. Do not require remote lookups or the `feat/` naming convention.

When the user clicks **Open Preview**, open the `/포트번호` entry point at the current Mew connection URL in a new browser tab. Reuse existing preview authentication, permissions, and origin isolation. Distinguish port connectivity, records of checks actually performed, and verdicts based on direct use. Mark verdicts as awaiting verification when the commit or worktree change state changes.

The panel does not create or manage worktrees, running processes, or test data. It does not automatically build, start or stop servers, switch branches, or merge, and does not change the [agent automatic Git handling decision](0046-agent-git-automation.md) or repository execution restrictions. Saving a verdict is also not a mechanism for forcibly blocking or allowing agent merges.

Preserve the existing `Documents/features/` and Markdown feature APIs, CLI, execution queue, and report history as they are. Read and edit documents in Documents; do not automatically convert them to the new branch ledger or delete them. Details on screens, storage, and usage belong in the [owning feature contract](../features/terminals-agents-automation/feature-driven-development-and-markdown-documents.md) and [usage guide](../../../docs/guides/projects.md#기능-패널에서-작업-브랜치-확인).

## Rationale and Impact

Users can open a task's preview and check it directly instead of switching work branches. Port responses are not shown as passed checks, keeping automated checks distinct from actual usage results. Running the app on a separate port and isolating its database, uploads, and settings still require preparation, and whoever runs it must ensure the reachable port serves the app from the corresponding worktree.
