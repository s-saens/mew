---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew collaboration: chat uses the presence socket, and comments attach as quotations in .mew/에 rather than in the document body. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0049 — mew collaboration: chat uses the presence socket, and comments attach as quotations in .mew/에 rather than in the document body"
created: 2026-08-11
updated: 2026-09-11
---

- Date: 2026-08-11
- Status: Adopted
- Subsequent decision: [0050](0050-mew-chat-dm-and-read-receipts.md) — no DMs; per-conversation read state
- Subsequent decision: [0051](0051-mew-comments-require-selection.md) — empty comment anchors without a selection
- Decision maker: Song Sanghoon (directive)

## Background

Until now, collaboration in mew extended only to editing the same document simultaneously (Yjs rooms and presence dots). There was no
place to exchange messages outside a document, so telling a collaborator "this paragraph seems off" required leaving mew. There
was also no way to refer to a specific passage in a document.

Adding these two features required three decisions:

1. How to transport chat — through a new WebSocket route or an existing one
2. Where to store comments — inside or outside the document file
3. How to represent where a comment attaches — coordinates or text

## Decision

### 1. Chat uses the existing presence socket (`/api/presence`)

Do not create a new WS endpoint. Every screen already has a presence socket, and authentication is already
resolved at upgrade time to identify guests. Add four message types to it:

| Direction | Message |
| --- | --- |
| Client → server | `{type:'chat', text}` |
| Server → client | `{type:'chat_history', messages}` (once on connection) · `{type:'chat', message}` · `{type:'comments', project, path}` |

- The sender is identified by the socket's identity. Names supplied in the payload are not used.
- There is one room per workspace. There is no channel or DM list—the same conversation appears even when switching projects
  (the same scope as the agent panel).
- Only the most recent 500 lines remain in `.data/chat.json`. It is recent history, not a ledger.
- Access extends to all logged-in members (broader than the owner/manager restriction for terminals and agents). Guests cannot send
  or receive messages or download history.

### 2. Comments do not write a single character to the body file

The data lives only in the project's `<프로젝트>/.mew/comments.json` (alongside `.mew/table-layout.json`).

- Adding a comment must not clutter `.md` or create a git diff — documents and conversations have different lifetimes.
- The yellow highlighting is a decoration (ProseMirror `Decoration` / CodeMirror `Decoration`). It adds no marks to the document, so copying transfers
  only the text, and saved output contains no trace of it—the same principle as footnotes (no ADR; see README).
- When a document is moved or renamed, its comments move in the same request. Otherwise, all of them become orphaned.

### 3. Anchor locations use quoted text + surrounding context rather than coordinates

Store it as a single `{ quote, prefix, suffix }` and find it again in the current body each
time it is opened (`commentAnchor.ts` in `@mew/ui`—the same approach as W3C Web Annotation's TextQuoteSelector).

- Coordinates cannot be used. Changing even one preceding character shifts everything.
- Yjs relative positions cannot be used either. They are valid only while the room is alive, but comments must persist even when the file is closed.
- This representation lets two views with different coordinate systems (the Markdown-rendered Hotview and the source view Plain) use the same single value.
  Only the text scanned differs by view; the search function is shared.
- Lookup starts with the strictest match: `prefix+quote+suffix` → progressively halve the context → `quote` alone
- If the passage cannot be found, do not render the highlight. The comment remains only in the list popup, and clicking it displays a notice if its location
  still cannot be found. Rendering nothing is better than highlighting the wrong location in yellow.
- A comment left at the cursor without a selection has an empty string for `quote` and appears as a small square in the view.

### 4. Mentions use `@`, but refer to different things in chat and comments

- In chat, `@` = file. Sent messages retain it as `[제목](<프로젝트 상대 경로>)`, while the screen displays only the title. Clicking it opens
  the file in an editor tab in the same window (no new window or URL). Ctrl+L inserts the same token.
- In comments, `@` = a person. Only the literal text `@이메일` remains in the body; the server handles delivery.
- The mentioned person receives a chat message. That message carries `to: [이메일…]` and is delivered and restored only for the
  sender and the specified recipients. This single field implements "send to that user's chat window."

## Rationale

- Why no additional socket was created: adding an endpoint creates another authentication boundary (`authorize*`) and another set of
  reconnection and cleanup paths. Presence has exactly the same lifetime as chat—it stays connected while the screen is open.
- Why `.data/chat.json`: there is one global list rather than a list per project (the same rationale as `.data/term-button.json`). Storing it in a project
  folder would split the conversation every time projects are switched.
- Why only comments live in the project folder: comments belong to their documents and must be moved and backed up with them.
- Comment access was defined by login rather than permission to view the file. Showing a file to guests and showing
  them internal team discussions are separate decisions.

## Results

- Once chat history exceeds 500 lines, the oldest lines disappear first. Write anything worth keeping in a document — chat is not a recordkeeping medium.
- With only one room, it gets noisy as more people join. If channels or DMs become necessary, `to` already exists, so extend it
  by grouping messages with recipients into lists (no new storage format is needed).
- A comment added in Hotview may not find its location when opened in Plain—because the Markdown notation (`굵게`) does not match the quoted text.
  In that case, it remains in the list but is not rendered in the body. Switching back to the original view makes it visible again.
- If the quoted text is completely deleted from the body, the comment can never find its location again. Deleting the comment is up to the user (it
  is not deleted automatically—it is someone else's writing).
- Comment changes are announced through the presence signal `{type:'comments'}`, and recipients fetch them again. The contents
  are not broadcast because guests are connected to the socket.
