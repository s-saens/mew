---
title: "Temporary attachment uploads and Git hooks"
description: "Records the November 9 fix for temporary attachment uploads blocked by incidental Git commits, its isolated hook and index regression checks, documentation results, and runtime application boundary."
created: "2026-11-09"
updated: "2026-11-09"
---

An image attachment was saved to disk but reported as failed when its incidental Git commit ran an unrelated project documentation hook. The failed commit also left the saved image staged. The [Git execution contract](../development/git-connections.md#git-execution-boundaries) and [Decision 0159](../decisions/0159-temporary-attachment-git-boundary.md) describe the resulting boundary.

Editor and agent uploads under `.mew/temp/assets/` now save without staging or running a Git commit. Other file-explorer uploads keep the existing incidental commit behavior. Existing repository configuration, tracked files, and index entries are not changed by the temporary upload. Projects without an ignore rule can show these attachments as untracked files.

Local verification:

- `node --test server/asset-upload-git.test.ts server/git.test.ts`: 8 tests passed. An isolated project with a failing pre-commit hook reproduced the failure before the change; afterward, both temporary upload endpoints preserved bytes, HEAD, and existing staged files. The checks also covered a stale-project request and an ordinary upload's hook and commit.
- `node --test server/localAssets.test.ts`: 4 tests passed, including attachment path and access checks.
- `npm run build` and `npm run lint -- --quiet`: passed. An initial build reported a TypeScript error in the new dialog regression test; it was fixed before the successful build.
- `npm run check:docs`: descriptions passed, but the repository link check reported 37 pre-existing missing-target links, including the already deleted decisions README and missing MOC paths.

These checks use isolated fixtures. The running Mew server was not restarted and the reported project's existing staged images were not changed. Applying the server-side fix and retrying the actual upload require the user's server restart.
