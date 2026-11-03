---
title: "Member chat presentation and recipient notifications"
description: "Records the 2026-11-03 member chat bubble alignment and recipient notification work. Covers grouped headers, wrapping, closed-panel collection, conversation navigation, and local verification limits."
created: "2026-11-03"
updated: "2026-11-03"
---

The member chat previously rendered every message as left-aligned text. The change uses the existing agent conversation surfaces and rounded bubbles to make authorship clear in group rooms and DMs. The [chat feature contract](../features/collaboration-comments-chat/group-chat-direct-messages-and-read-status.md#message-presentation) owns the resulting behavior.

`src/components/ChatPanel.tsx` aligns the signed-in account's messages right and all other authors left, including consecutive messages. Names and times follow the same side; unread counts sit outside the bubble toward the center. Bubble width is bounded, long words wrap, and file-reference buttons remain interactive.

## Verification

- `node --test server/chat-bubbles-ui.test.ts server/chat.test.ts server/chat-history.test.ts`: 15 passed, none skipped. The browser fixture renders the actual panel through intercepted requests without starting an HTTP server. It checks 1100/390px in light/dark mode, author alignment, the five-minute grouping boundary, bubble corners and width, long-text wrapping, unread placement, file opening, and group/DM sending.
- Inspected desktop and mobile fixture screenshots. Own messages appear on the right and other participants on the left, with no horizontal overflow. These are simulated browser viewports, not physical-device checks.
- `npm run lint` and targeted lint passed with existing warnings. The new browser test has no lint warnings. The design detector reported no findings, and `git diff --check` passed.
- `npm run check:docs`: description validation passed; the link phase is blocked by the unrelated pending `.mew/tasks/Image preview and attachment editing.md` asset URL. Both changed documents' descriptions and local link targets passed a scoped check, and the linked `message-presentation` heading was inspected.
- `npm run build` passed, including TypeScript checks and the Vite production build, with chunk-size warnings. The first two attempts stopped at an implicit `any` callback parameter in the unrelated pending `server/input-focus-ui.test.ts`. An explicit `Event` annotation unblocked that check; the file contains another task's changes and is excluded from the chat commit.

No deployment or application server lifecycle operations were performed. Real multi-account delivery was not exercised through a running application.

## Recipient notifications

The follow-up adds incoming member-chat messages to the existing notification center even when chat is closed. Initial history is silent; a monotonic cursor excludes old and duplicate messages, the current sender, and other people's DMs. Notification actions open the corresponding group room or DM. Desktop titles omit the sender and message body, and channel settings remain shared with existing notifications. The [recipient notification contract](../features/collaboration-comments-chat/group-chat-direct-messages-and-read-status.md#recipient-notifications) owns current behavior.

Follow-up verification:

- `node --test src/utils/chat-notification-rules.test.ts src/hooks/use-chat-notifications.test.ts src/utils/mewcat-notifications.test.ts src/components/mewcat-notifications.test.ts server/chat-bubbles-ui.test.ts server/chat.test.ts server/chat-history.test.ts`: 44 passed, none skipped. Coverage includes group/DM eligibility, silent history, bounded ID retention, duplicates, deletion, absent-panel collection, header notification clicks, serialized overlapping requests, failure recovery, account/permission cleanup, foreground/reconnection catchup, initial DM read isolation, and repeated navigation to the same DM.
- The existing desktop delivery test now verifies a generic localized chat title without the sender and opens the corresponding DM when clicked. Delivery is simulated with a fake browser notification API; actual OS permission prompts, audio playback, physical devices, and real multi-account delivery were not exercised.
- `npm run build` passed with chunk-size warnings. `npm run lint` passed with existing warnings; targeted lint for the new notification modules and tests passed without warnings. `git diff --check` passed.
- The full documentation check still reports the unrelated pending task asset URL listed above. Changed document descriptions and local links passed scoped inspection.

Only chat-related hunks in the already modified `src/App.tsx` belong to this change. Other project-navigation edits remain outside its commit. No deployment or application server lifecycle operation was performed.
