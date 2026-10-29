---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: add 1:1 conversations and read receipts to chat. Separate conversations by recipients (to) without creating rooms. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0050 — Add 1:1 conversations and read receipts to chat. Separate conversations by recipients (to) without creating rooms"
created: "2026-08-12"
updated: 2026-08-20
---

- Date: 2026-08-12
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

Chat in [ADR 0049](0049-mew-team-chat-and-inline-comments.md) had one room per workspace. That document also outlined the extension path right there—"If channels
or DMs become necessary, `to` already exists, so extend it by grouping messages with
recipients into lists (no new storage format is needed)."

Two things became necessary this time: 1:1 conversations and read indicators. With only one room, even personal messages went to everyone,
and there was no way to know whether a sent message had reached the other person.

Three decisions were needed:

1. How to separate conversations — room identifiers or recipient lists
2. How to represent "read" — a list of readers per message or a read position per person
3. What the number should count

## Decision

### 1. Do not create rooms — with `to` it is a DM; without it, a group chat

This is exactly what ADR 0049 anticipated. `ChatMessage.to?: string[]` is all there is; there are no room identifiers or room lists. Conversations are computed
from the viewer's perspective:

| Message | For viewer A | For viewer C |
| --- | --- | --- |
| No `to` | Group chat | Group chat |
| `author: A, to: [B]` | Conversation with B | Not included in the list |
| `author: B, to: [A]` | Conversation with B | Not included |

- The server selects only what that person can see in `GET /api/chat`. Other people's DMs are absent from the response entirely — filtering them
  in the UI would expose everything in developer tools.
- Messages addressed to multiple people (comment mentions) appear in each recipient's conversation on the sender's side.
- The ledger remains the most recent 500 lines in `.data/chat.json`. Group chat and DMs share one ledger.

### 2. Read status is one record per person per conversation: "read up to here"

`reads[읽은 사람][대화] = 시각`. The conversation key is `group` or the other person's email. Do not attach a list of readers to each message — that would
grow the arrays by 500 lines × the number of people, when all that is actually needed is a single boundary.

The recorded value is not "the current time" but the timestamp of the last message in that conversation at the moment it is read.
Using the current time would mark the next message arriving in the same millisecond as read — the count for a message
never displayed would disappear. For the same reason, message timestamps in the ledger increase strictly (`max(now, 마지막+1)`).

### 3. The number is the "count of recipients who have not read it yet" — hide it when it is 0

This follows the same rule as KakaoTalk. The server counts it for each message and returns it as `unread`; the UI only renders it.

- For group chat, the population is all current accounts (excluding the sender); for DMs, it is `to`.
- Deleted accounts are not counted. Otherwise, their share of the count would never decrease.
- People who have never opened chat continue to count as unread (as in KakaoTalk).

### 4. Comment mentions go to the specified person rather than the group chat

ADR 0049 §4 specified this behavior, but the implementation was posting to the group chat. Add `to: [지목된 사람들]` to match the documentation — discussions
of other people's documents will not go to everyone.

## Rationale

- Why no room identifier was created: building a room id from two people's emails requires normalization (order and case), and that
  id becomes embedded in three places: the ledger, read receipts, and UI. `to` is an existing field and requires no migration.
- Why read receipts are broadcast: the sender's count must decrease, but presence signals carry
  no content. Reuse `{type:'chat'}` and have the recipient fetch again (no content flows through guest sockets).
- Broadcast only when the read record changes. Continuously marking messages as read while the window is open creates an infinite broadcast loop

## Results

- One more boundary was added: only the sender and recipients can see a DM. Filtering happens in the server response itself
- The ledger's 500-line limit is shared by group chat and DMs. If the group chat is busy, older DMs are pushed out first. Write conversations
  worth keeping in documents — chat is still not a recordkeeping medium.
- If only the UI (dist) is updated without restarting the server, the old server ignores `to` and sends DMs to the group chat. The
  UI therefore treats a response without the `unread` key as coming from an old server and disables DMs. Restarting the server automatically
  unlocks them.
- As more people join, the icon column on the left gets longer. Beyond twenty people, a list and search will be needed (not being built now)
