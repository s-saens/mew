---
title: "Inline references and atomic editing for agent attachments"
description: "A decision to use atomic inline agent attachment widgets while preserving reference positions and existing storage. Includes sent attachment tags and the accepted 2026-11-01 extension replacing raw ordinary references in user bubbles with document icons and filename actions that open the editor."
created: 2026-10-22
updated: 2026-11-01
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

## 2026-11-01 Follow-up Changes

Status: accepted. Ordinary document references currently expose long `[[project:path]]` strings in sent user messages. Extend the inline tag presentation to these references: first activate a document icon to reveal its filename, then activate the filename to open the exact scoped path in Mew's editor. This replaces the original decision's plain-text presentation of ordinary references within sent user bubbles.

Keep raw tokens in copying, drafts, queues, and runtime delivery. Reuse the shared `ActionMenu` for the interactive filename popup, including keyboard operation, focus restoration, dismissal, and viewport placement. A hover-only tooltip cannot provide the requested touch interaction; direct icon navigation skips filename confirmation. Preserving raw text would retain the reported visual clutter. The shared popup provides the requested two-step interaction without another popup framework.

Repeated references retain their positions. Ordinary references remain separate from uploaded attachment metadata and existing media previews. Because tokens do not encode whether a target is a file or folder, both use the document-reference presentation; opening follows the existing host editor callback. The [Input Feature Contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns current behavior, and the [work record](../work/agent-document-tags.md) records verification and application limits.
