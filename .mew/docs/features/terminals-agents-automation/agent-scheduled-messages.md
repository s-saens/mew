---
id: "mew-agents-scheduled-messages"
parent: "mew-agents"
title: "Agent Scheduled Messages"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-06"
status_hash: "333669f522d259fe25acbfd4326c1e55deca98f9f89df6cb5443d61057d19e0a"
files: ["src/components/AgentPanel.tsx", "src/hooks/use-scheduled-prompts.ts", "src/utils/agent-scheduled-cache.ts", "server/agentScheduledPrompts.ts"]
commits: []
description: "Feature contract covering creation, editing, deletion, and execution of the scheduled time and content of a message to be sent once to the current agent session. Describes early display of device-stored lists, server synchronization, session restoration, and queue handling rules for busy sessions."
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

The clock button in the agent window's input bar opens the **Scheduled Message** popup. The popup allows only future dates and times; scheduling sends the content already in the input bar, including attachment references, at that time. Once scheduling is complete, clear that input draft and the attachment display.

View unexecuted scheduled messages in the **pending queue list** directly above the input bar. They appear only after regular pending messages, ordered by send time ascending. Click a message body once to edit it in place. Like the input, pending and scheduled message editors can be resized by dragging the top border up or down, or with the up and down arrow keys when the border has keyboard focus. Click the date/time text to reopen the same time picker and change the time. Scheduled messages cannot be reordered relative to one another and can also be deleted. Regular pending messages lock queue execution until editing is completed or canceled ([ADR 0118](../../history/decisions/0118-mew-agent-queue-edit-lock.md)).

Scheduled messages remain in the server data folder. At the scheduled time, the original ACP session is reconnected to send the message; if that session is working, the message executes at the end of the server queue. Separate cron-based [scheduled tasks](../../../../docs/guides/commands.md) are independent agent tasks and do not appear in this list. Storage and session restoration follow [ADR 0091](../../history/decisions/0091-mew-agent-tab-scheduled-prompts.md).

### Browser List Restoration

- As with conversation history, asynchronously store a display list in IndexedDB. Isolate the `lists` store in the `mew-agent-scheduled-prompts` database by account, runtime, tab ID, and cwd, and display that tab's list first after checking the server tab ledger. This is independent of conversation transcript storage and its budget.
- Start the server list query at the same time as the cache read. Display the last device list until server confirmation, then replace the entire list with the successful response. If execution or cancellation has emptied the server list, save an empty list locally as well. If the query fails, retain the last displayed and stored list.
- When an API call to create, edit content/time, or cancel succeeds, immediately apply the response to the screen and cache. Do not report a subsequent query failure as a change failure, and do not allow earlier queries or late cache reads to revert the change. After switching to another account, tab, runtime, or cwd, or closing the screen, do not apply previous requests to the new screen.
- Query the server list again on WebSocket connection or reconnection, browser window focus return, and return online. Use the local list only for display before querying; do not treat a scheduled time having passed as cancellation or execute scheduled messages locally.
- Only display fields are stored; ACP session IDs and skill payloads are not retained. Storage is limited to 7 days, 128 scopes, and approximately 4 MiB total, with the oldest scopes cleaned up first. Storage failures or capacity limits do not block server queries or schedule operations. If the cache is missing or expired, the list is displayed after querying the server.

<!-- mew:implementation:start -->
## Implementation details

- Provide scheduled time and message creation, content/time editing and deletion, and queued execution in the original session.
- Display lists are stored in IndexedDB by account, runtime, tab, and working path. Successful creation, modification, and cancellation operations and server query results are reflected immediately, and the server list is rechecked on reconnection, return to the window, or return online.
- Query failures do not clear the cache, and late cache results or earlier query responses do not overwrite the latest server results or changes. The server owns actual scheduled execution and restoration ([display cache contract](#browser-list-restoration)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-09-30: Isolated Chromium tests in `agent-scheduled-cache-ui.test.ts` (1100/390px, both themes) verified cache-first display during delayed server queries; persistence after refresh following creation, modification, and cancellation during query failures; protection against overwrites by late cache and server responses; account, runtime, tab, and cwd isolation; and unavailable storage and quota failures. The existing `agent-history-ui.test.ts` also passed.
- User verification criteria: Reopen the browser and confirm that the last schedule list appears while waiting for the server query, then updates to reflect executed, modified, and canceled states after the query completes.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Confirm that schedules persist after closing and returning to the browser, modifications and cancellations are reflected, and messages are delivered to the original session.

<!-- mew:validation:end -->
