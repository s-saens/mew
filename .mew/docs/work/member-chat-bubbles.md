---
title: "Member chat bubble alignment"
description: "Records the 2026-11-03 member chat presentation change: own messages on the right, other participants on the left, grouped headers, bounded wrapping, and local verification."
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
