---
id: "mew-git-file-history"
parent: "mew-git"
title: "Current file commits and history restoration"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-23"
status_hash: "af3b61583146b091429eb1e20b1bc1caa7ab169eb0d3c7e973c6e30f216d7a1d"
files: ["src/components/FileHistoryModal.tsx", "src/components/GitButton.tsx", "server/git.ts"]
commits: []
description: "Feature contract for committing only the open file and viewing/restoring past Git content. Explains Git isolation by absolute project path for the original repository and linked worktrees, per-account connections, preservation of other staged files, and autosave boundaries."
상위파일:
  - "MOC.md"
  - "_git-history.md"
---

## Requirements

- Commit changes to the open file and view/restore its past content.

### Scope

- Provides current-file Commit and per-file Git history viewing and reverting.

### Boundaries and limitations

- Committing the current file and committing selected files in the Git panel have different scopes.
- Do not assume autosave alone creates Git history.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- Explicit commits and history restoration check the per-account Git connection before writing. If disconnected, they open an OAuth window and retry after success; cancellation preserves the draft. Other staged files are not included in the commit. This follows the [Git connection contract](../../development/git-connections.md).

- Git instances and cache invalidation after initialization are based on the absolute project path of the current request. Even when the original repository and a linked worktree use the same `.workspace` and `docs` identifiers, HEAD, commit content, history, ignore, tracked-file, and index checks run in each working folder. Opening the original and worktree alternately or querying them simultaneously does not reuse the repository from another folder.

- Provides current-file Commit and per-file Git history viewing and reverting.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-23: Isolated Git tests that created an actual internal linked worktree verified parallel and repeated HEAD/history/content queries for `.workspace` and `docs`, differing ignore and index states, commits of worktree-only deletions, and invalidation of an initial non-repository cache. Passed 5 new and 7 existing tests, server type checks, and targeted lint checks. In a reproduction with the previous caching method injected, all 5 new tests failed. No app build or server restart was performed.

- 2026-09-29: HTTP tests with actual temporary Git repositories verified that disconnected accounts leave files and the index unchanged, ordinary saves are allowed, authors and committers are account-specific, and other staged files are preserved. Browser tests verified login cancellation for file commits, draft preservation, and exactly one retry after success.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that commits, history, and restoration for a selected file do not unintentionally include uncommitted changes from other files.

<!-- mew:validation:end -->
