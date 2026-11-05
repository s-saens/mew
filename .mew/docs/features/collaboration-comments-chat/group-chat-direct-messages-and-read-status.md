---
id: "mew-collaboration-chat"
parent: "mew-collaboration"
title: "Group chat, DMs, and read receipts"
status: "needs-fix"
created: "2026-09-18"
updated: "2026-11-05"
status_hash: "3044869fecf2142055b3c8efdd3a51053186e282981a1bed5e342a14f6bbb8ae"
files:
  - src/components/ChatPanel.tsx
  - server/chat.ts
commits: []
description: "Dock access to group rooms and DMs with aligned message bubbles, recipient notifications, read receipts, and file references. Covers notification navigation, owner-only history deletion, permissions, DM delivery boundaries, and the preserved needs-fix user assessment."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- Open Chat from its permission-gated Dock button or `Alt+C`. The button uses the existing Dock order and visibility settings, desktop panel toggling, and mobile foreground navigation; the header menu does not duplicate this entry.

- Exchange messages and file references with members while working on a project.

### Scope

- Provide group rooms, DMs, unread conversations, per-message read status, and opening file references.

### Boundaries and limitations

- Only logged-in users with chat enabled may use this feature.
- Only the administrator (owner) may delete history. manager, member, and guest have no delete button, and the API also rejects their requests.
- DMs limit delivery to the parties involved within the app; they are not encrypted secret conversations hidden from server administrators.

### Message presentation

- In group rooms and DMs, messages authored by the signed-in account appear in right-aligned bubbles. All other participants' messages appear in left-aligned bubbles. Ownership uses the author's email, independently of display names.
- Use the existing theme surfaces and rounded bubble styling from agent conversations. Keep text left-aligned inside both bubble directions. Limit bubble width to 85% of the message area, and wrap long text and file references without horizontal overflow.
- Align the author and timestamp with the bubble's side. Consecutive messages by the same author within five minutes retain separate bubbles with a smaller gap and omit the repeated header.
- Place a nonzero unread-recipient count outside each bubble, toward the center of the conversation; hide it when everyone has read the message. Preserve clickable file references, sending, and conversation filtering.

### Recipient notifications

- While the app is open, collect new incoming group messages and DMs even when the chat panel is closed. Notify only signed-in accounts with chat permission. Exclude the sender's own messages and DMs addressed to other accounts.
- Use the existing notification center: the header bell and recent list, plus Mewpet/toasts, desktop delivery, and sounds according to the user's notification settings. See [notification channels](../appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#notification-settings-and-pc-desktop-notifications). Desktop notifications require permission and an inactive window; they contain only a generic localized chat title, without sender or message text.
- An in-app notice identifies the sender without copying the message body. Clicking the notice opens the group room or the sender's DM, including when the panel is closed or another conversation is selected. Opening the notification acknowledges it through the existing notification center; conversation read receipts retain their separate behavior.
- Establish the initial chat history silently. After that, each new message produces at most one notice per page, including after a read-status signal, repeated delivery, history deletion, reconnect, or foreground reconciliation. Notifications are neither persisted across reloads nor delivered after the browser is closed.
- Account or permission changes stop collection and discard pending responses from the previous subscription. Reuse authenticated REST reads and content-free presence signals; notification support does not change DM delivery permissions.

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

- [Member chat bubble work record](../../work/member-chat-bubbles.md) records the layout regression coverage and local verification for the 2026-11-03 presentation change.

- Automated verification: `server/chat-history.test.ts` checks the owner-only API, invalid input, per-conversation deletion, preservation of other users' DMs, repeated deletion, read calculations immediately after deletion, and deletion for multiple recipients. `server/chat-history-ui.test.ts` checks the actual chat panel's confirmation dialog at 1100/390px, focus on Cancel, cancellation, deletion, disabling for empty conversations, errors and retries, presence refetching, and hiding the button from non-administrators. Existing chat tests also passed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify recipient scope and read status for group rooms and DMs, and opening file references.
  - Verify the owner's group-room and DM deletion confirmation/cancellation, errors, and real-time updates, along with button hiding and API rejection for other roles.

<!-- mew:validation:end -->
