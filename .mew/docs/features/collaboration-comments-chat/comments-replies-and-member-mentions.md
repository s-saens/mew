---
id: "mew-collaboration-comments"
parent: "mew-collaboration"
title: "Comments, replies, and member mentions"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-22"
status_hash: "7979e03691cf55ffafcd76ec7ddbc05edc3fd3d2bc53100f0b07b948ce9abe63"
files: ["src/components/Comments.tsx", "server/comments.ts", "packages/editor/src/editor/commentHighlight.ts"]
commits: []
description: "A feature contract for adding comments with Ctrl+Shift+C or by right-clicking the body, and replying, mentioning, editing, and deleting through a small quote/input popup and threads showing authors and timestamps. It explains automatic paragraph/line selection on right-click, the list, draft retention on failure, separate storage, and management permissions."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- Leave feedback at a selected location in the body and discuss it in a thread.

### Scope

- Provide comments at selected locations, replies, mentions, editing, deletion, and a comment list.

### Boundaries and limitations

- Manage comments separately from the body.
- Viewing the list requires file viewing permission; adding, editing, and deleting also require file editing permission.
- For read-only or archived files, only viewing existing comments is available. Do not create or modify comments while the body is loading.
- Keep comments in the list even when changes to the source text make their anchors unresolvable, and distinguish the management permissions of authors and the owner.
- Provide this in text editing screens for files within a project when the user is logged in and has collaboration feature permission. Do not start comments for guests, media, diffs, files outside the project, anchor previews, or while files are being revalidated.

### Detailed contracts

- [Collaboration usage](../../../../docs/guides/collaboration.md)

### Starting comments and keyboard shortcuts

Select text in Markdown Hotview or Plain, code, or text, then press the default shortcut `Ctrl+Shift+C` (`Cmd+Shift+C` on macOS) to open a comment input popup quoting the selection. The shortcut does not create a new comment when the selection is empty. On mobile, select text and use the comment icon in the keyboard accessory bar to open the same input popup. The shortcut can be changed in settings, and existing custom combinations are preserved.

**Add comment** in the body's right-click menu uses the existing selection. If there is no selection, it automatically selects the right-clicked Hotview paragraph or Plain/code line to start a comment. Disable the item when there is no text or the user lacks permission to comment. After creation, anchors, storage, and author permissions are the same as for existing comments.

When the comment shortcut reaches the app and an actual text editor has focus or a selection, prevent the browser's default action during the capture phase and route it to that editor field. In a valid editor, consume the key even when there is no selection or the input is repeated or part of IME composition, without creating a comment. Do not intercept keys from terminals, agents, remote screens, or modals as comment shortcuts. Follow the [Shared input contract](../../development/ui-contracts.md#focus-based-tab-shortcuts) for browser-reserved keys and remote input priority.

### Composer, thread, and list views

The composer popup consists of a small title row, a quote of the selected passage, an input field supporting member mentions, and Close and Submit icon buttons. Do not submit empty content. Enter submits and Shift+Enter inserts a line break; when mention suggestions are open, Enter selects a suggestion first.

Threads group the author's avatar, creation time, and body, with a reply field below. In editable files, show edit and delete tools only to the author and owner, and support keyboard and touch operation. Distinguish Save and Cancel while editing. If a create, reply, or edit request fails, preserve the error and draft without clearing the content or closing the input. Do not send duplicate content while a request is in progress.

When the workspace, file, account, view mode, or comment permissions change, close the previous popups and list, and do not apply late responses from previous fetch, create, edit, or delete requests to the new screen.

Place the title, thread count, and Close button at the top of the comment list, and show the quoted passage, first comment, author, timestamp, and reply count for each item. Show an empty state when there are no comments. Selecting an item navigates to its location in the body and opens the thread. If the location cannot be found, still open the thread and display the reason.

Position popups within the visible screen area excluding the mobile keyboard, and scroll long threads and lists internally. Close them using Close, Esc, or Back, and support keyboard operation of inputs and menus within threads.

<!-- mew:implementation:start -->
## Implementation details

- Provide comments at selected locations, replies, mentions, editing, deletion, and a comment list.
- Handle the comment shortcut during the capture phase, and use small quote areas and icon tools in the composer, threads, and list.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following are user verification criteria, not execution results:
  - Verify comment anchors, replies, mentions, list access after source text changes, and permission to edit other users' comments.
  - Verify that `Ctrl+Shift+C` opens the comment composer after text selection, and that it does not create comments when there is no selection or the screen does not support comments.
  - Use keyboard and touch to operate Close, Submit, Edit, Delete, and list selection, and verify that inputs and buttons remain accessible on small screens and with the keyboard open.
  - Verify that drafts are preserved and retries are possible when create, reply, or edit requests fail.

<!-- mew:validation:end -->
