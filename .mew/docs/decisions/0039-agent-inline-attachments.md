---
title: "Inline references and atomic editing for agent attachments"
description: "A decision to turn agent attachments into atomic CodeMirror widgets at the cursor position and preserve existing upload reference positions in drafts, queues, and prompts. Describes upload history, compatibility with existing queues, and the 2026-10-23 extension for inline display in user conversation bubbles."
created: 2026-10-22
updated: 2026-10-23
status: accepted
---

## Background

Keeping attachments in a separate list above the input prevents placing them between sentences, and all paths are appended to the end of the body when sent. The user requested inserting attachment tags like characters at the cursor position and moving them with a long press.

## Decision

- Store existing `[[프로젝트:.mew/assets/파일]]` references within the draft string and display them using CodeMirror replacement widgets and `atomicRanges`. Also read existing `.mew/files/` references.
- Manage text and attachment positions in the same document and edit history. Keep file types and photo bytes as separate metadata, and send only attachments referenced in the current document.
- Insert a unique identifier at the selection when an upload starts. Keep the identifier inside the editor even after the upload finishes, and convert it to the actual reference for display, draft values, the clipboard, and transmission. Remember success and failure results so that even if undo or redo restores an identifier, it remains linked to its result.
- New message and queue bodies preserve reference positions. When editing an existing queue item, append only missing references for its separate attachments to the end. Server prompt assembly also avoids adding references that are already present.
- Keep attachment displays in conversation bubbles and the queue list, and hide upload references in the body. Continue displaying regular file and folder mentions.

## Rationale and Impact

This extends the string-based draft, mention, and queue storage contract, so no new rich document format or separate position field is needed. References reside in the document, preserving their positions through copy and paste and in saved drafts. Raw paths are hidden in the editing UI.

Replacing the editor document when an upload completes can cause CodeMirror to lose the insertion and deletion ranges in its existing undo history. Keeping internal identifiers lets deletion, restoration, and movement use the same history before and after upload. The input cursor API converts between positions in the actual reference string and internal positions. Failed identifiers are removed from the document and restoration history. Deleting a tag does not immediately discard its metadata, allowing undo to restore the photo preview and attachment bytes.

The [Input Feature Contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns the specific scope of operations, cancellation, and verification; the [Session and Communication Contract](../development/agent-sessions.md) owns server compatibility.

## 2026-10-23 Follow-up Changes

Extend the conversation attachment display locations retained in the decision above. Sent user messages display inline tags at upload reference positions in the bubble body; historical metadata attachments without references appear at the end of the body inside the bubble. Keep the queue list, input editing, storage, and server delivery contracts. The [Input Feature Contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns the current display and compatibility criteria.
