---
id: "mew-agents-scheduled-messages"
parent: "mew-agents"
title: "Agent Scheduled Messages"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-04"
status_hash: "333669f522d259fe25acbfd4326c1e55deca98f9f89df6cb5443d61057d19e0a"
files: ["src/components/AgentPanel.tsx", "src/components/agent-schedule-input.tsx", "src/hooks/use-scheduled-prompts.ts", "src/utils/agent-scheduled-cache.ts", "server/agentScheduledPrompts.ts"]
commits: []
description: "One-time agent messages scheduled through floating inline hours/minutes controls, with a smooth entrance, reduced-motion support, confirmation, cancellation, and time editing. Covers document tags, device-stored list restoration, server synchronization, and queued execution in the original session."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Schedule a message to be sent once to the current agent session later.
- When the browser is reopened, display the device-stored list for the same account and tab before querying the server.

### Scope

- Provide scheduled time and message creation, content/time editing and deletion, and queued execution in the original session.
- Provide early display of device-stored lists and synchronization with the server list on reconnection.

### Boundaries and limitations

- This differs from cron scheduled tasks that repeatedly execute independent work.
- At execution time, restore the original session and append the message to the queue if the session is busy.

### Related documents

- [Terminal and agent usage](../../../../docs/guides/terminal-agents.md)

## Detailed behavior

The clock button inside the input field is replaced in place by a compact floating hours/minutes form with Check and X buttons on the right. It starts at 1 hour and 0 minutes. Hours accept whole numbers from 0 to 999; minutes accept 0 to 59, with a positive total required. Check or Enter schedules the current input, including attachment references, relative to the confirmation time. X or Escape returns to the clock without changing the draft. There is no separate popup or date/time picker. Opening the form reveals it from the clock side over 240ms with a short leftward movement and fade. With reduced motion enabled, use a 100ms fade without movement or clipping. Fields are immediately interactive; closing cancels any remaining animation, and reopening plays a fresh entrance. Browsers without the Web Animations API show the form immediately.

While registration is pending, lock the fields and both actions to prevent duplicate requests. On failure, retain the entered duration and draft and show the error beside the form for retry. Only successful creation clears the input draft and attachment display. Existing session, CLI, upload, and queue-edit restrictions remain. Floating controls wrap within narrow panels; their measured height updates editor clearance without adding a separate footer.

View unexecuted scheduled messages in the **pending queue list** directly above the input bar. They appear only after regular pending messages, ordered by send time ascending. Click a message body once to edit it in place. Like the input, pending and scheduled message editors can be resized by dragging the top border up or down, or with the up and down arrow keys when the border has keyboard focus. Click the date/time text to replace the composer clock with the same relative-time fields and update that message's send time. Initialize them from the remaining time, rounding partial minutes up and using at least one minute for elapsed times. A time edit preserves the message body and current composer draft. Scheduled messages cannot be reordered relative to one another and can also be deleted. Regular pending messages lock queue execution until editing is completed or canceled ([ADR 0118](../../history/decisions/0118-mew-agent-queue-edit-lock.md)).

Display ordinary document references as compact document tags in the scheduled list and its inline editor. Preview tags are passive parts of the message edit button, so clicking the body still starts editing. The editor supports `@` candidates, filename actions, and atomic reference removal and undo through the shared [agent input contract](agent-input-mentions-skills-and-attachments.md). Saving preserves exact scoped reference strings, including repeated references; changing the presentation does not alter scheduled payloads.

Scheduled messages remain in the server data folder. At the scheduled time, the original ACP session is reconnected to send the message; if that session is working, the message executes at the end of the server queue. Separate cron-based [scheduled tasks](../../../../docs/guides/commands.md) are independent agent tasks and do not appear in this list. Storage and session restoration follow [ADR 0091](../../history/decisions/0091-mew-agent-tab-scheduled-prompts.md).

### Browser List Restoration

- As with conversation history, asynchronously store a display list in IndexedDB. Isolate the `lists` store in the `mew-agent-scheduled-prompts` database by account, runtime, tab ID, and cwd, and display that tab's list first after checking the server tab ledger. This is independent of conversation transcript storage and its budget.
- Start the server list query at the same time as the cache read. Display the last device list until server confirmation, then replace the entire list with the successful response. If execution or cancellation has emptied the server list, save an empty list locally as well. If the query fails, retain the last displayed and stored list.
- When an API call to create, edit content/time, or cancel succeeds, immediately apply the response to the screen and cache. Do not report a subsequent query failure as a change failure, and do not allow earlier queries or late cache reads to revert the change. After switching to another account, tab, runtime, or cwd, or closing the screen, do not apply previous requests to the new screen.
- Query the server list again on WebSocket connection or reconnection, browser window focus return, and return online. Use the local list only for display before querying; do not treat a scheduled time having passed as cancellation or execute scheduled messages locally.
- Only display fields are stored; ACP session IDs and skill payloads are not retained. Storage is limited to 7 days, 128 scopes, and approximately 4 MiB total, with the oldest scopes cleaned up first. Storage failures or capacity limits do not block server queries or schedule operations. If the cache is missing or expired, the list is displayed after querying the server.

<!-- mew:implementation:start -->
## Implementation details

- `AgentScheduleInput` owns the floating relative-time form; `AgentPanel` replaces the clock, submits absolute ISO timestamps through the existing schedule API, and measures wrapped controls for editor clearance.
- Display lists are stored in IndexedDB by account, runtime, tab, and working path. Successful creation, modification, and cancellation operations and server query results are reflected immediately, and the server list is rechecked on reconnection, return to the window, or return online.
- Query failures do not clear the cache, and late cache results or earlier query responses do not overwrite the latest server results or changes. The server owns actual scheduled execution and restoration ([display cache contract](#browser-list-restoration)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The [composer work record](../../work/agent-composer-actions.md#follow-up-inline-relative-scheduling) records the inline scheduling checks and remaining browser-verification limits.

- 2026-09-30: Isolated Chromium tests in `agent-scheduled-cache-ui.test.ts` (1100/390px, both themes) verified cache-first display during delayed server queries; persistence after refresh following creation, modification, and cancellation during query failures; protection against overwrites by late cache and server responses; account, runtime, tab, and cwd isolation; and unavailable storage and quota failures. The existing `agent-history-ui.test.ts` also passed.
- User verification criteria: Reopen the browser and confirm that the last schedule list appears while waiting for the server query, then updates to reflect executed, modified, and canceled states after the query completes.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Confirm that schedules persist after closing and returning to the browser, modifications and cancellations are reflected, and messages are delivered to the original session.

<!-- mew:validation:end -->
