---
title: "Git account identity in command buttons"
description: "Records account-specific command-button commit attribution and local Git panel reflog identity, their local verification, and the remaining shell remote-authentication gap."
created: "2026-11-13"
updated: "2026-11-13"
---

Project command buttons now scope commit author and committer identity to the initiating Mew account, using the linked GitHub identity or the Mew profile when disconnected. Git panel local ref actions use a linked identity for reflogs while retaining disconnected local operation. See the [Git execution contract](../development/git-connections.md) and [command guide](../../../docs/guides/commands.md).

On Linux and macOS the command runs in a subshell, so shell state changes do not persist to the shared session. Arbitrary shell commands and terminal buttons still use OS credentials for remote Git operations; the existing per-operation credential socket cannot safely cover their lifetime and arbitrary destinations. The requested account-specific remote authentication for these commands remains unresolved. Existing running sessions and interactive processes retain their previous behavior.

Local verification: `node --test server/command-git-identity.test.ts server/cmd-button-workspace.test.ts server/subprojects.test.ts server/git-connections.test.ts` passed 10 tests. Targeted `oxlint` and `npm run build` passed. `npm run check:docs` found 39 existing link errors outside these changes; description validation passed. No deployment or server restart was performed. Real GitHub authorization and remote transfers were not tested.
