---
title: "Place worktrees inside the repository and exclude duplicate traversal"
description: "Collect new worktrees in .worktrees under the main checkout and exclude the copies from Git, browsing, search, and watching. Define preservation of existing paths and work, and v3 compatibility at request time for v1 and v2 guidance."
created: "2026-10-23"
updated: "2026-10-23"
---

## Status

Accepted. Extends the worktree location and guidance version compatibility in [decision 0045](0045-agent-branch-guidance.md) and [0046](0046-agent-git-automation.md). Authorization scope for commits, merges, deletion, and remote operations remains unchanged.

## Background

Existing guidance required isolating work in worktrees but did not specify a location. As agents created work folders beside the repository, completed work accumulated in the parent directory. Even if worktrees are collected inside the repository, adding only a Git ignore rule still leaves Mew's full file catalog and file watcher traversing the copies.

## Decision

The default location for new worktrees is `.worktrees/<브랜치 슬러그>` under the main checkout. Find the main checkout using the common Git directory and registered worktree list, and do not create another worktree inside an existing linked worktree. Before creation, verify that the main checkout's `.gitignore` contains `/.worktrees/`. Explicit user or repository location rules take precedence.

Record this layout in the Mew repository's guidance and ignore rules as well. The parent project's tree, file catalog, document browsing, and watchers, along with Vite's development watcher, do not traverse below `.worktrees`. Exclude it even in the mode that shows all hidden files. If the user opens the worktree itself as the project root, browse and watch its files normally.

Record the guidance as v3. For valid v1 and v2 guidance, compare it exactly against the previous generated text, preserve the stored original, and pass the current guidance only in requests. Preserve strategy, manual, remote, and cleanup settings and directly edited guidance. The [project settings guide](../../../docs/guides/project-setup.md#git-branch-guidance) and [file browsing contract](../features/projects-files-search/file-folder-exploration-and-operations.md) own the specific current behavior.

Do not automatically move existing worktrees. When relocation is requested, check processes and sessions that depend on the existing paths and any uncommitted work, then use `git worktree move`. Limit cleanup to unused branches and worktrees whose integration has been confirmed, and check and preserve separate sources and production data ignored by Git before deletion as well.

## Rationale and Impact

Collect related work folders inside the repository to reduce clutter in the parent directory. Worktrees retain normal Git registration and provide the same isolation as a sibling directory layout. Apply app traversal exclusions as well to prevent duplicate search results, increased watcher resource use, and document edits to copies. Do not perform a migration that moves all existing layouts or overwrites user guidance files.
