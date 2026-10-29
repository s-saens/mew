---
id: "mew-editor-autosave"
parent: "mew-editor"
title: "Autosave and undo"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-26"
status_hash: "49e8886c9db372cf3f0f2fde067a315ec7873a16ef66013708de4d051926c0d4"
files: ["src/components/EditorPane.tsx", "src/components/CodePane.tsx", "server/collab.ts"]
commits: []
description: "A feature contract covering body autosave, undo, and redo. Explains distinctions from Git commits, file history, and Revert File; external changes, task property merging, and save conflicts; completing saves before branch or worktree switches; and blocking late saves from the previous root."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Save edits to files and undo editing mistakes.

### Scope

- Automatically saves body changes and provides undo and redo.

### Boundaries and limitations

- Autosave and Git commits are separate.
- Because saves from an open editor can conflict with externally modified files, file history and Revert File flows are distinguished.

### Detailed contracts

- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- Task document saves pass the last saved source text. If only the body changes, the latest tags and assignees changed in the task panel are retained; conflicting changes to the same list abort with 409. The merged source returned by the server is applied to the editor and cache while preserving additional input entered while the save was pending. Application paths and API and tab regressions follow the [task save contract](../../development/task-list.md#saving-and-concurrent-edits).

- Preparation for a branch or worktree switch waits for pending autosaves and in-progress saves in `useTabs` to finish, then saves modified tabs, including external files opened by absolute path. New edits and autosaves are blocked during preparation; if saving fails, the switch does not proceed and the failed save is not immediately retried automatically. Late save callbacks from the previous root check the switch generation, and if the optional `workspace` passed to `PUT /api/file` differs from the request's actual root, the server rejects it with 409. After saving finishes, the target worktree's content and permissions are rechecked while preserving the tab structure. Follows the [worktree switching contract](../../development/ui-contracts.md#switching-worktrees-within-the-same-project).

- Automatically saves body changes and provides undo and redo.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- `task-document-save.test.ts` checks the sequence of opening a document → changing tags/assignees in the panel → saving the body, explicit tag deletion, and file preservation on conflicts. `task-document-save-ui.test.ts` checks preservation of tags, assignees, and body content when additional input occurs during an actual `useTabs` autosave response and in subsequent saves.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify correct reopening after saving and correct undo behavior, and that autosave is not displayed as a Git commit.

<!-- mew:validation:end -->
