---
id: "mew-collaboration-chat"
parent: "mew-collaboration"
title: "Group chat, DMs, and read receipts"
status: "needs-fix"
created: "2026-09-18"
updated: "2026-10-07"
status_hash: "3044869fecf2142055b3c8efdd3a51053186e282981a1bed5e342a14f6bbb8ae"
files:
  - src/components/ChatPanel.tsx
  - server/chat.ts
commits: []
description: "A feature contract covering group rooms, DMs, unread conversations, per-message read receipts, and file references for logged-in members. The user assessment is marked as requiring changes. It explains per-conversation history deletion by the administrator (owner), chat permissions, DM delivery scope, and the boundaries of server administrator access."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- Exchange messages and file references with members while working on a project.

### Scope

- Provide group rooms, DMs, unread conversations, per-message read status, and opening file references.

### Boundaries and limitations

- Only logged-in users with chat enabled may use this feature.
- Only the administrator (owner) may delete history. manager, member, and guest have no delete button, and the API also rejects their requests.
- DMs limit delivery to the parties involved within the app; they are not encrypted secret conversations hidden from server administrators.

### Delete history

- Use the trash button in the chat header to delete history for the current group room or a DM you participate in. Disable the button when the conversation is empty or deletion is in progress.
- The confirmation dialog identifies the target conversation and explains that its history will be permanently deleted for all participants. Canceling preserves the history.
- Deletion removes the corresponding messages from the server ledger. Other conversations and other users' DMs remain intact. For mention DMs with multiple recipients, the entire message is deleted, so it also disappears from the screens of that message's other recipients.
- After deletion, use a presence signal to refetch participants' history and unread counts. On failure, display an error and allow retrying.

### Detailed contracts

- [Collaboration guide](../../../../docs/guides/collaboration.md) · [Chat storage and delivery contract](../../development/collaboration.md)

<!-- mew:implementation:start -->
## Implementation details

- Check both owner and chat permissions on `DELETE /api/chat`, and delete ledger entries by conversation key. Preserve read pointers and generate timestamps for new messages that are later than the preserved read timestamp.

- Provide group rooms, DMs, unread conversations, per-message read status, and opening file references.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Automated verification: `server/chat-history.test.ts` checks the owner-only API, invalid input, per-conversation deletion, preservation of other users' DMs, repeated deletion, read calculations immediately after deletion, and deletion for multiple recipients. `server/chat-history-ui.test.ts` checks the actual chat panel's confirmation dialog at 1100/390px, focus on Cancel, cancellation, deletion, disabling for empty conversations, errors and retries, presence refetching, and hiding the button from non-administrators. Existing chat tests also passed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify recipient scope and read status for group rooms and DMs, and opening file references.
  - Verify the owner's group-room and DM deletion confirmation/cancellation, errors, and real-time updates, along with button hiding and API rejection for other roles.

<!-- mew:validation:end -->
