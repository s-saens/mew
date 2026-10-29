---
id: "mew-agents-conversations"
parent: "mew-agents"
title: "Agent Conversations, Queues, and Restoration"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "b325d279cf16e291b2bcddda7cc0d70268647e336403acba780cb1081da44668"
files: ["src/components/AgentPanel.tsx", "src/components/agent-startup-queue.tsx", "src/utils/agent-startup-queue.ts", "src/hooks/use-agent-event-state.ts", "src/hooks/use-agent-work-history.ts", "src/utils/agent-work-loader.ts", "src/utils/agentFold.ts", "src/hooks/useGridDrag.ts", "server/agentHost.ts", "server/agentWs.ts", "server/agentTranscript.ts", "server/agent-history-preview.ts", "server/agent-session-search-service.ts", "server/agent-transcript-search.ts", "server/agent-runtime-history-search.ts"]
commits: []
description: "Feature contract for agent conversations, stopping, queues, restoration, history searches by topic, content, and session ID, prevention of out-of-order requests and session conflicts, and local indexing scope. Also covers new tabs, drafts, the latest 3 turns, work details, attachments, question navigation, memory protection, and model capacity retries."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Send tasks and manage progress, stopping, queues, and previous conversations. Confirm before closing an agent tab with work in progress.
- After a browser restart, display the saved queue first, then synchronize it with the server's latest queue.
- When selecting history or restoring automatically, a valid saved transcript can be read immediately without waiting for the agent to be ready. Block sending and approvals until restoration succeeds.
- The history dropdown occupies 80% of the agent session area's width and 50% of its height, resizing with the panel. Place the search field for topics, content, and session IDs at the top, with the past session list scrolling within the remaining height.
- When history is reopened, immediately show the last search results while refreshing the list and session occupancy in other tabs in parallel. Block session selection and refreshing the current conversation until occupancy has been checked. Entering a search term or pressing Enter only searches and does not open a conversation. Clear the previous list when starting a new connection.
- When stopping work in progress, preserve the queue and run tasks from the top after confirming termination.
- When temporary model provider capacity shortages are detected, retry in the same conversation with the same model after the configured delay. Adjust the delay and retry count in the default instructions, and distinguish this from actual exhaustion of the user's limits.
- In an empty conversation, use a centered, translated prompt to guide the user to start chatting.
- Use ↑/↓ in the conversation area to move between questions. From the middle of a long answer, ↑ first returns to that answer's question.
- Clicking a bubble or answer body focuses the conversation area for question navigation without displaying a border around the entire area. Keep the focus border during keyboard navigation, and hide it when the area is clicked with a pointer, even if it already has focus. Preserve the individual focus indicators of child buttons and links. In `server/agent-history-ui.test.ts`, check clicking an answer after using the input field, clicking again after keyboard navigation, and restoring focus after leaving the area.
- Click bubbles to expand or collapse their content without expand/collapse arrows. Place question copy controls outside the bubble on the left, and show answer copy controls only when expanded. For collapsed answers, place only the stop button to the right of the first line and hide the time. For expanded answers, display work duration next to the bottom `접기` button.
- An expanded answer's status, copy, and stop header sticks to the top of the conversation viewport within its own bubble. The bottom `접기` button also sticks to the bottom of the conversation viewport within its own bubble. If the top and bottom overlap, the top header covers the bottom area. Do not display the top `질문으로` button.

### Scope

- Provide message sending, stopping, work records, editing and reordering queued messages, /clear, and history restoration.
- Continue conversations after browser or project switches through independent supervision and transcripts.
- When memory is insufficient, stop work in progress, display an error, and hold the queue.
- After recovery and cancellation complete, resume the interrupted AI task first, then automatically resume the queue. Do not rerun CLI commands ([OS Limits and Scope](../../../../docs/operations/agent-memory.md)).

- While dragging a handle, show the insertion placeholder and surrounding items shifting so users can preview the drop order.
- The queue list provides its own vertical scrolling when it exceeds approximately 3.5 collapsed items in height.
- Allow users to inspect attachments in the pending queue and add or remove files and preview photos while editing.
- Clicking a queue item's body expands its full content without an item height limit or internal scrolling. Read long content using the queue list's vertical scrolling. When expanded, show the model, effort, and permissions used when the item was queued below the body, followed by attachment filename tags arranged from left to right and wrapping onto the next line when space runs out. Editing in the bottom message input starts only through the pencil button to the left of the delete X. Hide the Schedule button and provide a Cancel text button on the right of the queue item being edited.
- Save the model, effort level, and permissions used when the item was queued and load them when editing. After saving or canceling, restore the new-message settings from immediately before editing.

### Boundaries and limitations

- Distinguish closing a panel from ending a tab session.
- History, resuming external CLI conversations, and runtime-specific restoration support follow the session contract.

### Related documents

- [Terminal and agent usage](../../../../docs/guides/terminal-agents.md) · [Supervision, queue, and restoration contract](../../development/agent-sessions.md)

## Detailed behavior

### Clear conversation shortcut

When focus is in an agent panel's body, input, or tab bar, or the panel was clicked most recently, `Ctrl/Cmd+R` prevents browser refresh and sends `clear_session` to the conversation tab selected in that panel. Handling occurs during the window capture phase, so it also applies to the tab bar and body rendered separately through a portal. It behaves the same as `/clear` and the Clear conversation button and preserves the input draft. During active work, it follows the existing clear queue rules. When disconnected, it only prevents refresh and sends no request. Holding the key does not send repeated requests.

All three entry points display the `대화 비우는 중…` status and a blinking icon at the top of the conversation area before sending the request. On receiving the actual reset event, change the status to `대화를 비웠습니다`; when a clear boundary is added to the server queue, change it to `/clear를 대기열에 추가했습니다`. Hide it after 1.2 seconds. Until server confirmation, block duplicate clear requests and disable the Clear conversation button. Clear the feedback on errors, disconnection, or replacement of the session view. Announce the status to screen readers, and disable blinking in hidden tabs and when reduced motion is enabled. Do not obscure the input draft or work in progress.

2026-10-20 validation: In isolated Chromium on desktop and mobile in both themes, verified shared feedback for the shortcut, button, and `/clear`, status updates before requests, completion and queued indicators based on server confirmation and their automatic dismissal, duplicate request blocking, draft preservation, dismissal on errors and disconnection, and reduced motion. Passed 12 server clear and queue checks, type checks, targeted lint, and documentation checks. No build or server restart was performed.

Does not apply to other panels, terminals, inactive conversations, hidden panels, runtime selectors, or modals. Does not intercept keystrokes with `Shift` or `Alt` held, or during IME composition. Fullscreen entered through the app button also includes R in keyboard locking. Support, permissions, and remote input priority follow the [fullscreen keyboard lock contract](../../development/ui-contracts.md#focus-based-tab-shortcuts).

2026-10-14 validation: In isolated Chromium for `server/agent-connection-ui.test.ts` on desktop and mobile in both themes, verified Ctrl and Cmd request sending, draft preservation, request blocking for repeated keys and disconnection, and preservation of default behavior outside the panel and for Shift, Alt, and IME input. Full type checks, targeted lint, and documentation description/placement checks passed. No build or server restart was performed.

2026-10-14 follow-up fix and validation: Moved handling previously limited to the body to the panel's window capture handler and added `KeyR` to fullscreen locking. On desktop and mobile in both themes, verified that requests go only to the selected tab and drafts are preserved with tab bar focus, Ctrl and Cmd input in actual DOM fullscreen, and body focus after clicking the conversation body. Passed 3 connection UI, fullscreen lock, and remote input checks, type checks, targeted lint, and documentation checks. Keyboard Lock API checks used mocks; actual delivery of OS-reserved keys was not verified. The file creation expectation failure in the remote keyboard integration test also reproduced with the lock code from before the change. No build or server restart was performed.

### Awaiting approval status

When a permission approval request is awaiting a user response, show the status circles on the corresponding agent tab and active response bubble in orange. The tab's orange indicator takes priority over the blue working blink and does not blink. Both indicators provide a translated `승인 대기` accessible name and tooltip. Once approval or denial responses are processed and no pending requests remain, return to the existing in-progress, completed, interrupted, or error status indicator. Inactive tabs retain the same status, while disconnected tabs hide the awaiting approval indicator.

When a new approval request arrives, expand the corresponding response bubble to show the Approve and Deny buttons. Preserve the user's choice to collapse the same request again, but expand it again when a new request is added. By default, bring the tab awaiting approval to the foreground even when the user is working in another agent or panel. If switching projects is required, finish restoring the saved layout before opening the panel and tab, and close the remote desktop viewer if it is open. Select the existing tab without creating a new session.

Automatic switching can be disabled under **Settings → Notifications → Open agent tab on approval request**. Disabling the option preserves the orange status and approval request notifications. Navigation alone does not handle approval requests or clear notifications; remove the corresponding notification after processing an approval or denial response. Duplicate live events and replayed history do not trigger repeated switching. Monitoring scope and Mewpet display settings follow the [notification contract](../appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#notification-settings-and-pc-desktop-notifications).

2026-10-14 additional automatic switching validation: Passed 35 related regression tests. In isolated Chromium on desktop and mobile in both themes, verified automatic tab selection, disabling the option, approval button submission, preserving collapse for the same request, expansion for new requests, and Mewpet speech bubble display, manual navigation, and removal after a response. Also verified project navigation, opening closed panels, and display after layout restoration in the actual App, as well as suppression of switching immediately after a setting change. Frontend type checks, targeted lint, and documentation description/placement checks passed. Full type checks did not pass due to errors in server platform and memory modules outside the scope of this work. No build or production server restart was performed.

2026-10-14 validation: In isolated Chromium at 1100/390px in both themes, verified orange, non-blinking indicators on collapsed and expanded bubbles and tabs, preservation on inactive tabs, continued pending status after responding to some of multiple requests, and return to blue after responding to all requests. Passed 20 connection UI and event composition tests, targeted lint, and documentation description/placement checks. Full type checks failed due to an unused import in `server/config.ts` and a missing declaration in `server/platform/ipc.ts` outside the scope of this work. No build or production server restart was performed.

### Task details

Opening a tab initially displays the most recent 3 questions and answers. After the initial view, prefetch collapsed thoughts and tool calls with at most two requests at a time, prioritizing the corresponding records when details are expanded. Show loading only inside the details while preparing them, and allow retries on failure. Load earlier questions and answers as the user scrolls up. Pause new detail requests for inactive tabs and hidden browsers, and resume when visible again. Actual transfer limits, compatibility, caching, and sequence numbers follow the [conversation storage contract](../../development/conversation-storage.md#lazy-loading-of-collapsed-work-details).

Combine the thought process (`agent_thought_chunk`) and tool call groups (`tool_group`) for one response turn into a single **Task details** section. It is collapsed by default and appears at the position of the first thought or tool item. Expanding it shows thoughts and tool calls in their original order, with each tool's in-progress, completed, or failed status. Do not display the existing per-group `완료 · N개 작업` collapsible boxes. Keep regular response text, approval requests, and errors outside.

Reflect new thoughts, tool calls, and status updates during execution in the same details section, preserving the user's chosen expanded state. Use the same display when restoring saved conversations, and continue to include only regular response text when copying a response. Do not create task details when there are no thought or tool records. Translate the title into Korean, English, Chinese, and Japanese.

2026-10-14 validation: In isolated Chromium at 1100/390px in both themes, verified a single details section, default collapse, Enter/Space operation, original record order, live status updates with expansion preserved, and copying only the response. Passed 20 event composition and shared translation tests, as well as type checks, targeted lint, and documentation description/placement checks. No build or production server restart was performed.

2026-10-22 validation: Under the same four screen conditions, verified that recent questions and answers remain readable first even when detail responses are delayed, while preserving detail loading, retries after errors, original order and status, and copying only the response. Checked duplicate requests, the concurrent request limit, blocking late responses after switching conversations, and preservation of live status and errors immediately before hydration. Existing UI regression checks for earlier segments, device caching, and preliminary display during restoration also passed. Actual Mewlink connection time was not measured.

### Code block language labels

Fenced code blocks in responses display the language specified in Markdown at the upper left. Convert common names and aliases to display names, such as `bash` to Bash, `cpp`, `c++`, and `cxx` to C++, and `python` and `py` to Python. For unknown languages, display the specified first token unchanged. Do not add a language label to blocks with no language or to indented code blocks. Do not analyze code to infer its language.

HTML-escape language names and wrap long names within the panel width. Keep the copy button at the upper right and copy only the code body without the language name. For command code blocks, the triangular Run button next to Copy sends them to the CLI execution path for the same conversation. Detection, permissions, readiness, and draft preservation follow the [code block execution contract](cli-commands-in-conversations.md#run-from-response-code-blocks). Use the same renderer for streaming and saved conversations.

2026-10-13 validation: Passed 5 existing Markdown tests and checks for language aliases, unspecified languages, unknown names, HTML escaping, and copied content. In isolated Chromium using the actual renderer and CSS at 1100/390px in both themes, verified language/code layout, long-name wrapping, and the copy button area. Type checks, targeted lint, and documentation description/placement checks passed. No build or production server restart was performed.

### Sent attachment display

Display sent attachments as inline icon tags by file type at their reference positions in the user bubble's body. Display them inside the user bubble even when only attachments are sent or the pending queue is executed, and provide no remove button. Detailed display criteria for photo previews, opening files, and restoring past attachments follow the [input and attachment contract](agent-input-mentions-skills-and-attachments.md).

Build attachment URLs from the `project` and `path` stored on the attachment rather than the current document scope. This correctly retrieves root `.mew/assets/` attachments even while viewing Documents. The server accepts both current `.mew/assets/` and legacy `.mew/files/` paths for attachments in new messages and pending queue edits, as well as image references from older clients, preserving display metadata. For old transcripts without attachment metadata, restore tags from references to either path remaining in the body. Do not retroactively recover files with neither metadata nor body references. Do not duplicate photo or file bytes in transcripts ([storage contract](../../development/conversation-storage.md)).

2026-10-21 validation: Before the fix, WS regression tests reproduced missing photo and PDF metadata for `.mew/assets/` and transmission of only legacy paths. After the fix, 41 related tests passed, including attachment-only sending, older image references, queue editing, execution, and reconnection with mock Codex and Claude. In 1 isolated Chromium UI test, verified tags above bubbles, photo previews, file links, and restoration after refresh on desktop and mobile in both themes. Type checks, targeted lint, and documentation checks passed. No actual provider calls, build, or production server restart were performed.

2026-10-10 validation: Passed 47 tests related to attachments, transcripts, queues, and incremental composition, and 1 isolated Chromium UI test. On desktop and mobile in both themes, verified image loading, audio/video controls, file link scope, attachment-only questions, and restoration after refresh. Type checks, targeted lint, and documentation checks passed. No actual media playback, provider calls, build, or server restart were performed.

### Long conversations and streaming updates

When new response chunks arrive in the same conversation, compose only new events on each frame. Reuse existing objects and Markdown results for completed question and answer bubbles. Apply late updates to past tool and approval statuses to the corresponding items, while preserving expansion, copying, interruption, keyboard navigation between questions, and scroll position.

The device cache for the most recent 20 questions does not re-save overlapping records when new questions shift its range. Resetting, restoring another transcript, and loading older records use the full composition rules. Preserve server records and actual agent context. The shared contract for storage, immutable snapshots, cache budgets, and measurement follows [conversation storage and segment synchronization](../../development/conversation-storage.md).

2026-10-07 validation: Passed 58 related unit and server tests and 6 isolated Chromium scenarios covering conversation history, connections, CLI/queue, schedule caching, tab closing, and new tabs. On desktop and mobile in both themes, verified restoration, scrolling, 200 sequenced events, and deduplication, and checked saving only 4 new rows in the moving cache, compatibility with existing rows, and rollback on save failure. Targeted lint and documentation description/placement checks also passed. Synthetic repeated-processing measurements and execution commands were recorded in the shared conversation storage document. No build, production server restart, or actual provider calls were performed.

### History Search

Use a single search field at the top of history to find all or part of a topic, conversation content, or session ID. Search supports both Korean written without spaces, such as `에이전트패널`, and English terms for major features, such as `agent panel`. An empty query shows recent conversations. Results are distinguished by title, body excerpt, and most recent date, with up to 50 shown within the current tab's runtime and working directory. Exact and partial session ID matches appear first.

Search 250ms after the last input, or immediately on Enter. Pressing Enter or changing the query does not open a conversation; restoration occurs only after selecting a list item. Compare response request IDs to retain the latest results even if an earlier search finishes later. Use the shared dot indicator while searching, and display failures as errors distinct from no results.

The current conversation and conversations occupied by other tabs cannot be selected. Preserve switching restrictions before occupancy lookup completes and while ongoing work, approvals, or pending messages remain. Apply the same selection and occupancy checks when the query is a session ID.

Search uses body matches in saved user questions and agent responses, along with synonyms for key terms. Exclude thoughts, tool calls/results, and system notices. Codex and Claude also search external CLI records and records beyond the most recent 50; other runtimes use Mew transcripts and the range of lists returned by the provider. The index is reused on the host without embeddings, so no external search API configuration is required, and arbitrary semantic inference is not supported. Detailed storage and communication conditions follow the [history search contract](../../development/agent-sessions.md#history-search).

### Read history content first

History selection, refreshing the current conversation, and automatic restoration display recent questions and answers stored on the server first while agent restoration continues. During preparation, users can expand, copy, and scroll through questions and answers, and the input draft is preserved. Sending, approval, and loading earlier segments are allowed after preparation completes. When content is displayed in advance, do not cover it with a loading bubble, and retain the conversation's `aria-busy` until restoration finishes.

Preliminary display does not change the tab's session pointer or device history. On successful restoration, replace it with the latest conversation; on failure, retain the previous conversation. Use the existing loading behavior if no saved transcript exists, it is corrupted, or it exceeds size or query time limits. Server reads, protocol, segments, and measurement criteria follow the [conversation storage contract](../../development/conversation-storage.md#early-display-of-server-transcripts-during-acp-restoration).

### Confirmation when closing a working tab

An agent tab's `×`, `Alt+W`, and `Ctrl/Cmd+W` delivered to the app use the same close path. If the tab's `infos[id].busy` is true, the shared confirmation dialog identifies the target tab and warns that ongoing work will end. Both ACP responses and CLI execution in agent conversations follow the existing busy state. Regular shell tabs retain their existing termination behavior, and idle agent tabs close immediately.

After removing a tab, focus the tab bar in the same agent or terminal group. Keep focus in that panel even if closing the last tab reveals the runtime selector or an empty panel. Repeatedly pressing `Alt+W` closes only remaining tabs in the same group; when no tabs remain to close, it does not move to editor tabs. If a detached group disappears, move focus to the default panel's tab bar of the same type.

The confirmation dialog defaults focus to `취소`. Cancel, Esc, and Back preserve the tab, session, draft, conversation, and command. Only after confirmation, perform the existing session and command termination, draft and cache cleanup, and tab removal for that tab. Clicking `×` on an inactive tab after switching to another tab still targets that tab for confirmation. Repeating the close shortcut in the confirmation dialog does not close background tabs. Closing the entire panel is separate from ending tab sessions.

Validation: `server/agent-close-ui.test.ts` runs the actual AgentPanel and shared confirmation dialog in isolated Chromium on desktop and mobile in light and dark themes. It verifies confirmation for shortcuts during active work and `×` on inactive tabs, preservation on Cancel and Esc, default focus on Cancel, no session or command termination before confirmation, termination of only the target tab, immediate closing of idle tabs, and repeated close-key input in the modal. Servers and sockets are replaced with fixture responses.

The same checks also verify repeated `Alt+W` starting with focus in the conversation input, closing remaining tabs and the last tab after close confirmation, and that additional close keystrokes in an empty panel are not passed to the editor.

### Status bubbles

Place a book-shaped **Manage Skills** button and a plug-shaped **Manage MCP** button to the right of `i` in the agent conversation header. Browse global, project, and subproject scopes by runtime, view source content, and add, edit, move, or delete items. This is a shared fullscreen modal separate from the existing information popup; detailed behavior and support scope follow [Skills and MCP management](../../../../docs/configuration/agent-harness.md). The gear button to their right opens **Agent default instructions** settings (`serverFiles` permission). Commit method, response language, response length, and file viewing behavior follow [shared instruction settings](../../../../docs/guides/project-setup.md#edit-the-shared-guidance-file).

**Agent** and **Terminal** are separate panels. The agent panel contains ACP chats and official agent TUIs, while the terminal panel contains regular shell tabs. The agent panel's `+` opens the runtime selector, and the terminal panel's `+` adds a shell. Existing `tmux` tabs appear in the terminal panel with their IDs and cwd preserved.

Panel movement and tab detachment follow [ADR 0134](../../history/decisions/0134-mew-dockable-workspace-panels.md) and the [UI contract](../../development/ui-contracts.md#workspace-panel-layout). Collapsing or moving a panel does not end its sessions. A panel's close button closes only that pane and gathers its tabs into a remaining panel of the same type. Preserve the last panel's tabs for reopening. Remaining panels fill the vacant space, and closed splits are not restored. Only a tab's `×` ends its session.

### Select a new agent

In the `+` runtime list, open an installed agent by clicking anywhere on its row or pressing Enter or Space. The redundant `사용` button was removed because clicking the row opens the agent; do not add it again unless the user requests it. Disable opening for items that are not installed or are being installed. Place the `설치` button for uninstalled items immediately to the left of the gear icon at the far right. Installation and settings operate independently of row selection, and the existing flow that opens the agent after successful installation is preserved.

### Model and effort selection

Place the input area's Save defaults button in a transparent container with the same 20px height as the model, effort, and permission dropdowns, with its icon centered horizontally and vertically. Center it within the 28px settings row as well, without using negative margins to adjust its position.

The Codex model dropdown combines effort-specific entries into one base model. For example, display `Astra (low)`, `Astra (medium)`, and `Astra (high)` as a single `Astra`, and select the effort level in the adjacent Thinking dropdown. Preserve other parenthetical descriptions in model names. If there is only one base model, disable only model selection; Thinking selection remains available if multiple effort levels are supported.

When changing models, retain the current effort level if supported; otherwise, select `medium`, then the first supported option. Update the Thinking list to the supported values advertised by the selected model. When effort changes, also synchronize Codex's actual composite model ID so saved defaults, reconnection, and the display stay consistent. Retain the previous value if configuration fails. Preserve other runtimes' model lists and the exact model IDs of the existing set. Execution and defaults contracts follow [runtime settings](../../../../docs/configuration/agent-runtimes.md#model-and-permission-defaults-and-runtime-selection).

### Login screen

Display `<에이전트 이름> 로그인` as the title. Provide login methods as buttons clickable across the entire row instead of explanatory cards, and retain distinctions needed for selection in their names, such as Kimi's `.com` and `.ai`. For API keys, use an input with an associated label and a `연결` button.

Do not display explanations of internal behavior, such as where the server runs, CLI credential management, session reconnection, or how authentication codes are stored. Also remove the authentication browser's `SERVER OAUTH` badge and repeated guidance at the bottom. Do not add this explanatory text again. Maintain implementation information in [runtime settings](../../../../docs/configuration/agent-runtimes.md).

Show progress, authorization codes and copying, `로그인 계속하기`, code input, errors, and retry guidance only in states that require them. Retain the login site's host and provider-requested guidance, and do not list long OAuth URLs in the body. Briefly explain steps users must perform themselves, such as entering Prime's `/login`. Preserve login method, authentication task, and browser connection contracts.

Lay out content at a maximum width of 24rem. In short panels, users must be able to scroll upward to access Back and input fields. Buttons and inputs display keyboard focus; announce progress with `status` and errors with `alert`.

### Empty conversation

A new ACP tab without a session ID to restore immediately displays an empty conversation and input without waiting for connection or process readiness. Also skip conversation and queue cache lookups and the cache wait of up to 200ms. Supervisor and agent startup, communication initialization, empty session creation (including MCP), and application of default settings continue in the background.

The Send button and `Ctrl+Enter` remain available for regular messages during preparation. Clear the input, display the body and attachments in the `대기 중` list, and automatically send them in submission order once preparation completes. List bodies can be expanded for reading, and the X button cancels items before sending. Confirm termination when closing a tab with pending items as well. Preserve restrictions on actions requiring a session ID, such as CLI execution and scheduling, and the block on sending while reconnecting an existing conversation.

Retain pending items and allow cancellation during login, initialization errors, and disconnection. Send them only after confirming actual session readiness, rather than merely receiving a connection or login completion signal. Do not resend already sent items on reconnection. This list resides in the current tab's memory, and recovery after refresh or tab closure is not guaranteed. Detailed conditions, setting preservation, and scope switching follow the [session contract](../../development/agent-sessions.md#messages-reconnection-and-queues).

If there are no conversation bubbles or items awaiting initialization to display, show `채팅을 시작하세요` in the secondary text color, centered horizontally and vertically in the content area. Translate it into Korean, English, Japanese, or Simplified Chinese according to the app language, and hide it when a message, command, or error bubble or a pending item appears. Do not show this text while restoring an existing conversation or loading history, and do not let it overlap the login screen.

2026-10-22 verification: In isolated Chromium for `server/agent-connection-ui.test.ts` (1100/390px, both themes), verified the empty conversation display and `aria-busy=false` before a new tab's socket connects and during agent initialization, 0 IndexedDB conversation cache opens, acceptance and cancellation before connection, attachment/settings preservation, and FIFO transmission after readiness. Checked that nothing is sent on `ready`, empty session meta, late meta during authentication, or receipt of `auth_complete` alone; preservation during disconnection, initial errors, and login; and no retransmission on duplicate meta. Existing conversation restoration, reconnection, history, and clearing checks also passed.

### Panel status and error notices

Show connection and reconnection status for regular shells and official TUIs as small translucent notices at the top center of the tmux content area. Terminal open failures provide a reconnect button in the same notice. Show ACP chat command lookup and execution errors and runtime open failures in the same format over the corresponding content area. The heights of the command button bar, conversation, and input area do not change.

The shared `PanelNotice` uses the theme surface color at 85% opacity with a slight background blur. Position it 8px from the content edges and limit it to a maximum width of 22rem and maximum height of 6rem. Long errors support wrapping, internal scrolling, and text selection. Outside the notice, do not intercept clicks, touch, or scrolling; announce errors with `alert` and connection status with `status`. Errors in work records, login input validation, and detailed error windows retain their existing context.

### Waiting for connection and reconnecting

During connection, reconnection, and initial preparation of an existing ACP session to restore, history switching, or refreshing the current conversation, show the shared `LoadingIndicator`'s three small dots in the center of the conversation area. The dots grow and shrink on a 1.2-second cycle with phases offset by 160ms, changing only size and opacity. Use the theme's secondary text color without displacing content. Show the same three dots at a smaller size when fetching the history list. Display the actual conversation immediately when loading finishes. Use the logo highlight only for app entry loading, and do not show it inside panels. Do not reintroduce the black overlay or persistent connection text.

Preserve the conversation and input draft. If IndexedDB records for the same session or a preliminary display of the restored session's server transcript is available, bubbles remain readable while waiting for connection. During other loading, hide the existing conversation DOM and block interaction with `inert` while preserving scroll position and bubble state. When disconnected, also lock the session toolbar with `inert`. Do not cover the input area, tab bar, panel close control, or other panels; users can continue drafting, editing, attaching files, and adjusting height. Block sending via the button or `Ctrl+Enter` during disconnection, history switching, and preliminary server transcript display, while preserving the draft. New tabs first accept messages into the initialization waiting queue, retaining existing restrictions on attachments and CLI mode.

Keep the existing 1-second reconnection interval. If there is a session ID to restore but no device records, keep the three dots during initial session preparation even after the socket opens, without hiding authentication screens or initial errors. Clear history loading on receipt of `history`, existing `replay`, `reset`, or `error`. Announce the conversation area with `aria-busy` and the outer container of the three dots with `status` and a translated accessible name. Show static dots when reduced motion is enabled. Stop animation in hidden tabs. Separate visibility from input focus so visible dots continue moving even when another panel has focus. Do not reintroduce Mewcat disconnection notifications unless the user requests them; retain actual task error, completion, and approval notifications.

Verification: `server/agent-connection-ui.test.ts` checks the actual AgentPanel in isolated Chromium on desktop/mobile in both themes for no cached prose preview or socket connection while querying the tab ledger; dot size changes, phase offsets, and centering in an unfocused restored docked panel; no notifications during initial connection, preparation after socket connection, or prolonged reconnection; no overlap between the loading area and input; draft editing, height adjustment, send blocking, and recovery; per-tab isolation and motion stopping in hidden tabs; static dots under reduced motion; history list and conversation loading; and loading dismissal after replay/reset/error. Socket transmission is replaced with fixtures.

### Connected accounts, subscriptions, and usage limits

Successful login does not guarantee subscription entitlement or remaining usage. In Claude, Kimi, Codex, and Cursor ACP chats, opening the agent window's
**i (Session Info)** popup when no login prompt is present immediately shows the account and provider plan under `연결 계정 · 구독`. The on-screen field label is `계정`, with no explanation of the lookup method. Account information is retrieved when the popup opens, with no separate body card or additional expansion step. The same account information is also available in settings for supported runtimes. Antigravity provides ACP chat and official Google authentication, but is not included in the account and plan information card. Do not infer account information that the official server does not return.

Distinguish subscription requirements, exhausted usage, and insufficient credits from expired authentication. Even if the provider wraps an error as Authentication required, preserve
the existing conversation and login state when it is an explicit limit error. Preserve queued messages and stop automatic sending. Refreshing
account information, reconnecting the panel, and editing queued messages do not signal execution to resume. When the user sends a new message, resume in queue order.

Do not treat free or unsubscribed status as equivalent to being unable to make requests now. Products with an available free allowance can be used without a subscription.
Do not infer unsubscribed status from a plan code or lookup failure alone; display values whose paid status could not be confirmed, such as Kimi's VIP10, as returned and defer judgment.

Align the session toolbar's history, usage battery, clear conversation, info, skills/MCP, and instructions buttons on the same vertical centerline. Use `items-center` for the button group and flex layout instead of an inline baseline for the battery button.

For Codex, Claude, and Kimi Code, show a fully rounded battery 40px wide and 20px high at the far right of the session toolbar, after the instructions button. Among valid limits actually returned by the provider, select the one with the shortest aggregation period and display only the remaining percentage rounded down to an integer (for example, 28% remaining weekly displays as `28`; if a 5-hour limit is also present, show the 5-hour remainder). Do not infer the period from the plan name. The background fill follows the remaining percentage and distinguishes 25% or less from 10% or less. The shared tooltip and accessible name show the period, remaining %, and reset time if provided. Use `—` while fetching, on failure, for unsupported CLIs, and for API key connections; actual exhaustion is `0`. Do not assume recovery to 100% from data whose reset time has passed. Fetch initially in a visible connected tab, then refresh every 5 minutes; do not fetch for hidden documents/tabs. Multiple panels for the same Mew account and runtime share results and in-flight requests in memory; fetch separately when the account changes. The battery number is a button that opens a popup directly below it showing all subscription limits. Show the remaining percentage, fill bar, and reset time if provided for every returned period and model-specific limit. Additional model-specific limits do not participate in selecting the shortest period for the summary battery. Adjust the popup's horizontal position to stay within the viewport and allow scrolling within the space below. Close it by pressing the button again, clicking outside, pressing Esc, or going back; support opening and closing with the keyboard. Do not infer or add limits that were not retrieved. This battery does not change limit-error or queue-resumption decisions.

Each item in the full subscription limits popup places the period, gauge, and remaining percentage on one line (for example, `1주 ━━━━━ 91%`). The gauge fills the remaining horizontal space; long period and model names are truncated with an ellipsis and provide a tooltip with the full name. Show the reset time below that line.

Use the existing context, input/output, cache, total token, and API-equivalent cost displays in the i popup to check session token usage. Remove the duplicate `구독 · 사용량 확인` entry point and use the `구독 관리` button (`구독하기` for free plans or when a subscription is required) to open the official page in the internal DOM browser. This UI consolidation is not a decision to prohibit retries. Fit the popup to narrow panel widths and scroll internally when content is long. Because the server CLI account and the account
on the web subscription page may be logged in separately, prompt users to verify that they are using the same account within the subscription window. Do not repeat free plan descriptions or provider lookup notes in the account summary, and indicate that API key connections
are billed separately. Closing the subscription window only refreshes status; it does not automatically make a payment or send a prompt. Display account information temporarily without retaining it in conversation transcripts or
browser storage. Keep the decision in [ADR 0130](../../history/decisions/0130-mew-agent-account-entitlement.md), and provider-specific lookup capabilities, execution contracts, and APIs in [runtime settings](../../../../docs/configuration/agent-runtimes.md).

### Automatic Retry for Insufficient Model Capacity

If an ACP chat provider explicitly reports temporary model congestion, such as `Selected model is at capacity. Please try a different model.`, retry with the same session and model after a default delay of 30 seconds. Detect both RPC errors and capacity errors at the end of an answer immediately before normal turn completion. Make up to 20 additional attempts after the initial request. The interval and maximum attempts for **Automatically retry on model congestion** can be saved under **Default Instructions → Mew Global Instructions → General**. Setting the count to 0 disables automatic retries. Follow [Model congestion retry usage](../../../../docs/guides/project-setup.md#model-congestion-retries) for settings scope and storage.

While waiting, concisely show the remaining time and attempt count and a stop action, and retain the working state and pending messages. Preserve work already performed and answers received, continuing without repeating completed instructions from the beginning. **Stop** cancels the wait; after termination processing, execute the queue under the existing FIFO rules. Do not issue further requests after the tab is closed.

Settings changed during retries take effect from the next turn. If an attempt succeeds within the configured count, continue executing the queue; if capacity remains unavailable through the final attempt, show the final error and hold the queue. Resumption requires the user to send a new message manually; automatic submission, reconnection, and queue editing do not signal resumption. Do not apply automatic retries to exhausted user limits, subscription, payment, or authentication errors, or ordinary rate limits. Do not automatically rerun official TUIs, regular terminals, or CLI commands. Follow the [Session contract](../../development/agent-sessions.md#automatic-retry-for-insufficient-model-capacity) for classification, per-account snapshots, and cancellation boundaries.

### Creating a new tab

Pressing `사용` for a runtime or agent set validates the current root project path through the server's `agent-cwd` check before creating a tab. During validation, keep the selector open and show `여는 중…`. If validation fails, show the reason on the same screen and do not create a tab. Restoration-compatible data may have an empty cwd, but the new-tab creation function does not allow an empty cwd.

The account server ledger is the SSoT for the tab list, and `localStorage` is a fallback for the initial screen. Therefore, even if transcript and content caches fill the browser storage quota and fallback updates fail with `QuotaExceededError`, continue rendering new tabs and saving to the server ledger. Apply the same best-effort principle when saving the active tab, recent runtime, and selector view.

Under the [Conversation storage contract](../../development/conversation-storage.md), store transcripts in per-account IndexedDB for the most recent 20 questions. The server provides SQLite range queries and changes since reconnection; scrolling up loads older ranges. Remove the device transcript when a tab is explicitly closed. Follow the [Browser storage contract](../../development/browser-storage.md) for settings, drafts, and legacy cache cleanup. The localStorage quota issue on 2026-09-08 was a case where three closed Codex tabs accounted for about 89% of roughly 10.49MB total, and is separate from the new IndexedDB budget.

While querying the server tab ledger, show the existing empty speech bubble, and do not connect sessions or update the server ledger before confirmation. Per the user request on 2026-09-30, after confirming the ledger, first show verified IndexedDB records for the same account and session as actual conversation bubbles. Do not reintroduce the old localStorage prose preview. If there is no cache for the session to restore or a different history entry is selected, use the existing loading speech bubble. Show a new tab's empty conversation immediately.

The `모델 · 노력 · 권한` divider shown directly above a user message in an ACP agent conversation is called a **status bubble**.

- It always appears for the first user message.
- After that, it appears again only if the model, effort, or permissions differ from the previous user message.
- Do not add a new status bubble if the combination is unchanged, even when continuing the same conversation an hour later or restoring it after idle shutdown. Preserve the settings stored for the same question even if the restored answer's wording or chunks differ.
- Values at send time are recorded in the conversation transcript, so the status bubble from that time remains visible after reconnection or session restoration.
- Status bubbles use the same full width as task bubbles rather than user messages. Only user messages are indented to the right.

### Editing the pending queue

Reordering the pending queue can start only from the dedicated drag handle at the far left of each item. With both mouse and touch, drag immediately without a long press, and apply `touch-action: none` only to the handle. The handle's up/down arrow keys also move the item to an adjacent position. Disable the handle when there is only one item or while editing the queue. Remove reordering by long-pressing the content. During dragging, the grabbed row floats with the pointer, and a dashed placeholder marks the insertion position. Other rows in between move up or down according to their actual heights and spacing to preview the resulting order. Determine targets using the original slots so preview movement does not cause positions to oscillate. Send the reorder once on release; pointer cancellation, Esc, or loss of window focus restores the preview. Under reduced motion, omit movement animations for surrounding rows and the placeholder.

Display the pending and scheduled queue container on a layer above the conversation area and prevent its height from being compressed. Cap the container at approximately 3.5 collapsed items by default (24px rows, 4px gaps, 109px including top/bottom padding and borders), and scroll vertically inside the queue when it exceeds this height. Do not propagate scrolling to the conversation area at scroll boundaries. Separate the conversation's internal layers so bubbles and the new-message indicator do not cover the queue's top border or contents.

Clicking pending queue content toggles collapse/expansion. Expanded content preserves line breaks and shows the full text without an item-level height limit or internal scrolling. Read long content using the queue list's vertical scrolling. When expanded, show the model, effort, and permissions from queue registration below the content, followed by attachment filename tags arranged left to right and wrapping to the next line when space runs out. Clicking the content does not acquire an edit lock or change the input draft. Edit content and attachments in the existing bottom message input only when the pencil icon (Edit) immediately left of the delete X on the right is pressed. Do not show an edit button for `/clear` or CLI commands. Distinguish the queue row being edited with its background, and block queue reordering, deletion, and editing other items. Retain the bottom input's mentions, skills, attachments, image pasting, and height adjustment.

During editing, replace the send button with a save icon and hide the schedule button. Show a translated `취소` text button on the right of the queue item being edited. Provide a translated accessible name and tooltip for the save button. Disable CLI mode switching, scheduling new messages, and sent-message history navigation during editing.

Preserve the new message's in-progress content, attachments, and CLI mode separately from queue edit state, and restore them after saving or canceling. Store each item's display names and actual setting IDs for model, effort, and permissions at queue registration. Opening queue editing loads that snapshot into the dropdowns, and changes are retained only for the item being edited. Saving applies them along with the content and attachments; after saving or canceling, return to the new-message model, effort, and permissions from immediately before editing. Do not overwrite settings changed after queue registration with past queue settings. Disable saving defaults during editing. Cancel preserves the original queue item; Esc and browser/device back also cancel. Back closes only the editing layer in the shared overlay stack and keeps the panel open. If mention suggestions or a photo preview is open, Esc closes that view first. Ctrl/Cmd+Enter saves the modified queue item instead of sending a new message. Do not save while disconnected, while attachments are uploading, or when both content and attachments are empty.

### Keyboard scrolling by question

After clicking the conversation area or focusing it with Tab, press the up/down arrow keys to move by user question. Align the start of the question below the conversation area's top padding; for questions with attachments or execution settings, use the start of that group. Exclude answer, tool, error, and CLI bubbles as navigation targets.

- Pressing ↑ in the middle of an answer first moves up to that answer's question. Pressing ↑ again while aligned with the question's start moves to the previous question.
- ↓ moves to the question after the current top position. It advances to the next question even from the middle of an answer.
- Do not wrap at the first or last question. Even if insufficient space below prevents aligning the last question to the top, repeated key presses preserve question order.
- If scrolling with a mouse, touch, or another method changes the position, select navigation targets again based on the new position. Retain loading of earlier ranges above and existing scroll preservation.
- Do not intercept keystrokes in inputs, editable content, or selection widgets, or modified key combinations and IME input. Preserve cursor movement and sent-message history navigation in inputs outside the conversation, and reordering through queue handles. Question navigation itself does not change bubble collapse states or keyboard focus.

Verification: `server/agent-history-ui.test.ts` checks ↑/↓ from the middle of long answers, repeated question navigation, bottom alignment constraints and first/last boundaries, target recalculation after manual scrolling, inputs, modified key combinations, and button focus, together with existing range loading and cache restoration, in isolated Chromium on desktop and mobile in both themes.

### Task bubble status

Set the top-right corner radius of user chat bubbles and the top-left corner radius of agent answer task bubbles to 0. Keep the existing rounding on other corners, applying it equally in collapsed and expanded states.

Do not show collapse/expand arrow icons in question, answer, or task groups. Toggle the existing collapse state by clicking the content or header, or pressing Enter or Space on the focused button, and announce the state with `aria-expanded`. Collapse an expanded answer using its sticky top header or the bottom `접기` button. While reading long answers, the bottom button sticks to the bottom edge of the conversation viewport and does not move above its own answer bubble's top. Retain a background and divider so content does not show through behind the button, and hide it for collapsed answers.

Place the question copy button outside the bubble background on the left in both collapsed and expanded states. Copy the entire question without changing its collapse state. Show the answer copy button only in the expanded header, and hide it when collapsed.

For collapsed answer summaries, show the original text of the last answer in up to two lines fitted to the panel width, with an ellipsis at the overflowing end. Do not use a fixed 80-character limit. Place the stop button at the right of the first line while work is in progress, reserving only the width needed for the button on that line. Do not show task duration in collapsed answers or reserve space or an extra line for it. Expanded answers hide the summary and align the top status dot, copy button, and stop button on the same vertical centerline. Show task duration immediately left of the bottom `접기` button on the same vertical centerline, and keep it sticky along with the button during scrolling. Update elapsed time while work is in progress, and do not reserve time space for old transcripts without timing data. Copy the entire answer without changing its collapse state.

When scrolling the corresponding conversation area moves an expanded answer header's original position above the viewport, the header sticks to the top edge of the conversation viewport. Show the status dot, copy button, and in-progress stop button together, retaining a background and divider so content does not show through behind the header. The header does not extend beyond its own answer bubble's bottom and is pushed upward as the next bubble arrives. Collapsed answer headers are not sticky. If the top header and bottom collapse area of the same answer bubble overlap, the top header covers the bottom area. Set expanded top and bottom bars to 26px high (70% of the previous approximately 37px), copy/stop/collapse buttons to 20px high, the copy icon to 10px, the stop indicator to 8px, and the status dot to 5px. Set time and collapse text to 11px.

The `질문으로` button in the top header was removed at the user's request. Do not add it again without an explicit follow-up request. Retain ↑/↓ question navigation in the conversation area.

Verification: `server/agent-history-ui.test.ts` checks question copy placement outside the bubble, copy visibility only in expanded answers, no duration in collapsed answers and alignment of duration with the bottom collapse button when expanded, matching vertical centers of completed/in-progress headers and top sticking in the middle of long answers, displacement at the bubble bottom, copy/stop controls in completed/in-progress headers and absence of the question navigation button, and existing keyboard question navigation and range restoration, on desktop and mobile in both themes.

Task bubble dot colors indicate execution state: blue for in progress, green for completed, gray for stopped, and red for failed. Stopped tasks remain gray after refresh or conversation restoration. Even if ACP replays intermediate answers differently or omits them, preserve the stored stopped state for ranges with the same question content and order ([Restoration contract](../../development/agent-sessions.md#messages-reconnection-and-queues)). If neither a stored stopped state nor an ACP termination event exists and the current session is idle, treat the last task as completed.

Completed tasks preserve the full transcript at termination. Thus, even after the supervisor process shuts down due to inactivity, the reloaded view retains the user question, full answer and work details, completion state, and elapsed time. Do not truncate the beginning of a turn because it contains many events.

<!-- mew:implementation:start -->
## Implementation details

- Replace the input for opening a session ID directly with unified topic, content, and ID search. Combine the local index, external CLI records, and runtime list, and restore conversations only through list selection after request ID and existing occupancy checks ([Search behavior](#history-search), [Selection rationale](../../decisions/0084-agent-history-search.md)).

- Move question copy outside the bubble background and show answer copy only in the expanded header. Align the expanded header's status dot, copy button, and stop button on the same vertical centerline ([Bubble display contract](#task-bubble-status)).

- Show command lookup/execution and runtime open errors as small translucent floating notices over the content area. Scroll long errors inside the notice, and retain existing task error records and detail windows.

- Make expanded answer headers sticky within their own bubbles and compensate for the conversation viewport's top padding so they stick to its edge. Make the bottom `접기` button sticky as well and compensate for the conversation viewport's bottom padding. Give the top header a higher stacking priority than the bottom area. Reduce expanded top and bottom bar heights to 26px, scaling down buttons, icons, status dots, and time text together. Remove the top `질문으로` button at the user's request and do not add it again without an explicit follow-up request. Retain ↑/↓ question navigation. Preserve collapse state and copy, stop, and input behavior ([Bubble display contract](#task-bubble-status)).

- Remove collapse/expand icons from question, answer, and task groups while retaining click, Enter, Space, and accessibility state behavior. Remove the fixed 80-character limit for answer summaries and apply two-line ellipsis truncation, reserving only the width needed for the stop button on the first line and hiding task duration in collapsed answers ([Bubble display contract](#task-bubble-status)).

- Connect click/Tab focus and question-based arrow-key scrolling to the conversation area. After manual scrolling, recalculate targets from the current position, and preserve consecutive question order despite bottom alignment constraints ([Keyboard scrolling contract](#keyboard-scrolling-by-question)).

- Even during memory protection, check for recovery every 2 seconds and automatically resume AI continuation and the queue. Preserve original settings and edit locks; a user stop removes continuation.

- Asynchronously store queue content, type, attachments, and settings in per-account IndexedDB. Show the queue for the same tab and session before connection, then replace it with the server snapshot. Keep it visible during reconnection and block edits until server state is confirmed ([Conversation storage contract](../../development/conversation-storage.md)).

- Stopping AI or CLI cancels only the active work and approval requests. After termination completes, execution resumes from the shared FIFO queue, while edit locks and protective holds remain in place. Closing a tab or switching conversations also clears pending work.

- During drag reordering, surrounding items move to their new positions using the shared 180ms movement animation. The grabbed item follows the pointer immediately; consecutive reordering and reduced motion settings follow the [shared motion contract](../../development/ui-contracts.md#drag-reordering-motion).

- When New Conversation in history is clicked while idle, the UI clears first, while server termination, reconnection, and preparation proceed in the background. Connection loading does not cover the empty screen; the input draft is preserved, and new messages are accepted into the initialization waiting queue ([session contract](../../development/agent-sessions.md#messages-reconnection-and-queues)).

- Server transcripts are saved incrementally to SQLite, and recent conversations are stored asynchronously in per-account IndexedDB. The latest 20 questions, earlier segments, and changes since reconnection are synchronized by sequence number. Existing JSON is migrated nondestructively, while legacy supervisor replay and protection against automatic restoration failures are retained ([conversation storage contract](../../development/conversation-storage.md)).
- Loading earlier segments preserves scrolling, bubble keys, and the full question order for CLI. After checking the ledger, device records for the same account and session are displayed first.

- Queue items' setting display names and execution IDs are saved in `settings` and restored from `meta.queuedSettings`. Settings changed during editing apply only to the local draft; saving updates the server queue. Execution also uses the saved settings, and the latest new-message settings are restored after the turn.

- Reorder pending queue items using the dedicated handle at the far left. Drag immediately with a mouse or touch without a long press, or use the up and down arrow keys on the handle. The body only toggles between collapsed and expanded states, and all handles are disabled during editing. The vertical list preview displaces rows of different heights at their actual sizes and displays a dashed insertion slot and a row that follows the pointer. The server order is updated once, on drop.

- Reserve height and a higher layer for the pending and scheduled queues, and separate the conversation's internal layers so bubbles do not obscure the top of the queue.
- Limit the pending and scheduled queue containers to a maximum height of 109px, with internal vertical scrolling and overscroll containment ([queue display contract](#editing-the-pending-queue)).
- Remove the height limit and internal scrolling from expanded queue bodies to lay out the full content. Read long bodies using the existing queue list scroll.
- Reuse the bottom input UI instead of inline queue editors. Replace Send with a save icon, hide Schedule, and place Cancel on the right of the queue item. Restore the new-message draft, attachments, and CLI mode after saving or canceling ([queue editing display](#editing-the-pending-queue)).
- Set the top-right corner radius of user bubbles and the top-left corner radius of agent response bubbles to 0 ([conversation display specification](#task-bubble-status)).
- Display a new tab's empty conversation without waiting for preparation, with a chat-start prompt available in four languages centered in the body ([empty conversation display contract](#empty-conversation)).
- Indicate server tab ledger queries and existing-session connection, initial preparation, and history loading with three small dots in the center. Do not display this indicator while preparing a new tab that has no session ID to restore. Do not display legacy prose cache previews. Early display of IndexedDB bubbles for the same session follows the storage contract below. Use the same shared dot indicator for history list queries, without a logo or black overlay. The conversation body loading overlay has no background fill, allowing the panel's themed background to show through. Hide existing conversations during preparation while retaining input blocking and draft preservation.
- The three dots use the theme's secondary text color, with staggered phases that sequentially change their size and opacity.
- Preserve the conversation and draft, and display the actual conversation once preparation finishes. Keep the input editable during connection and history loading, blocking only sending. Dots animate in visible tabs regardless of input focus. Display them statically with reduced motion, and stop them in hidden tabs.
- Tab switching remains available, and no disconnection Mewcat notification is sent.

- Provide message sending, stopping, work records, editing and reordering queued messages, /clear, and history restoration.

- Restoring existing conversations skips temporary empty session creation on supported runtimes, and transcript cache merging on refresh compares long repeated chunks in linear time. Retain existing fallbacks when restoration or authentication fails ([execution contract](../../development/agent-sessions.md#messages-reconnection-and-queues)).

- Connect attachment tags and a separate attachment button to the pending queue. Apply attachment changes when saving and preserve the originals when canceling. Prevent saving during uploads and prevent late uploads from entering another draft ([input contract](agent-input-mentions-skills-and-attachments.md), [queue delivery contract](../../development/agent-sessions.md#messages-reconnection-and-queues)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Record automated checks and production application status for history search in the [work record](../../work/agent-history-search.md). User verification criteria are to find relevant conversations using `에이전트패널`, Korean with spaces, English expressions, and session IDs, and to confirm that Enter only searches and that existing occupancy and work restrictions apply when selecting results.

- 2026-10-08: Passed 44 unit, WS/supervisor, segment combination, and existing restoration/connection regression tests for early display of saved transcripts. In isolated Chromium at 1100/390px in both themes, verified body reading and copying during automatic/selected restoration, blocked sending and approvals with draft preservation, no pointer changes before success, failure recovery, ignoring late early-display results and earlier segments, and re-requesting a missing final segment. Type, targeted lint, and document description/placement checks passed. Synthetic first-body-display comparisons and measurement scope follow the [conversation storage contract](../../development/conversation-storage.md#2026-10-08-measurement-of-early-transcript-display-during-restoration). No build, production server restart, or actual provider calls were performed.

- 2026-10-06: Moved work duration next to the bottom collapse button in expanded responses. History UI checks at 1100/390px in both themes verified hidden times for collapsed responses, removal of time from the top header, alignment of the bottom time and collapse button, and time display during ongoing work. Type, targeted lint, document boundary, and link checks passed.
- 2026-10-06: After removing the top `질문으로` button, history UI checks at 1100/390px in both themes verified its absence from completed and ongoing responses, top and bottom collapse controls, copying, stopping, and ↑/↓ question navigation. Type, targeted lint, document boundary, and link checks passed.

- 2026-10-06: After adding the bottom `접기` button, isolated Chromium checks at 1100/390px in both themes verified that it stays at the bottom of the viewport for long responses within bubble boundaries, collapses on click or Space, and disappears after collapsing. History UI, type, targeted lint, document boundary, and link checks passed.

- 2026-10-06: Passed 3 history, command, and connection UI checks, along with type, targeted lint, document boundary, and link checks. In isolated Chromium at 1100/390px in both themes, verified question copy placement outside the bubble, response copy visibility based on expansion state, a vertical center difference of no more than 0.5px among completed/ongoing header elements, and copying, stopping, and question navigation. No build or server restart was performed.

- 2026-10-06: 2 connection and command UI regression checks passed, along with type, targeted lint, documentation boundary, and link checks. For shared notifications, verified the translucent background, maximum width and height, scrolling of long errors, and body clicks outside notifications in isolated Chromium at 1100/390px in both themes. No build or server restart was performed.

- 2026-10-05: Passed 3 history, input, and connection UI checks and 2 language selection checks. On desktop and mobile in both themes, verified that expanded headers stay at the top of the viewport within their own bubble's bottom boundary, question navigation, full copying, and stopping for completed and ongoing responses, removal of the bottom collapse control, and existing arrow key behavior and segment restoration. Type, targeted lint (3 existing Fast Refresh warnings), document boundary, and link checks passed. No build or server restart was performed.

- User verification criteria: In the middle of a long response, confirm that the bottom `접기` button stays at the bottom of the viewport, appears only within that bubble, and collapses the response on click, Enter, or Space.

- User verification criteria: In the middle of a long response, confirm that status, Copy, and Stop stay at the top of the viewport and disappear together when their bubble ends. When the top and bottom overlap, the top header must cover the bottom collapse area. The expanded top and bottom bars must have the same 26px height, and the small buttons must support copying, stopping, and collapsing. The top `질문으로` button must be absent, and collapsing, copying, and stopping must work independently.

- 2026-10-05: Passed 3 history, input, and connection UI checks. On desktop and mobile in both themes, verified Copy on the first line and time on the second, summary width per line, time display for short responses, transcripts without times, full response copying, Enter/Space toggling, and existing question navigation and cache restoration. Targeted lint, document boundary, and link checks passed. The full type check failed due to an out-of-scope `변경사항` translation key error in `GitWorkbench.tsx`. No build or server restart was performed.

- User verification criteria: Confirm that question Copy is to the left outside the bubble background and response Copy appears only when expanded. The status dot, Copy, and Stop buttons in the expanded header must share the same vertical center; collapsed responses must hide the time, and the summary must not overlap the first-line Stop button. Display the time for expanded responses next to the bottom `접기` button. Questions and responses must open and close without arrows while retaining full response copying, status dots, and stopping.

- 2026-10-05: Passed 3 history, input, and connection UI checks. On desktop and mobile in both themes, verified ↑/↓ in the middle of long responses, consecutive question navigation, bottom alignment limits, first/last boundaries, manual scrolling, and input and button focus. Type, targeted lint, and document boundary checks passed. The full document link check failed due to missing `docs/work/remote-access.md` in out-of-scope ADR 0195, and the commit hook's central document map check failed because the same ADR was not registered in the MOC. No build or server restart was performed.

- User verification criteria: In the middle of a long response, confirm that pressing ↑ shows that question and pressing ↑ again shows the previous question. ↓ must move to the next question, and arrow keys in the input must retain their text-editing behavior.

- 2026-10-03: Passed 52 memory, ACP, clear, and CLI checks (skipped 2 optional OS checks). Verified automatic AI continuation, queue edit locks, recovery headroom, user stopping, and prevention of CLI reruns. Targeted lint and document link checks passed. The full type check failed due to an existing `OutputAsset.code` error in `unified-editor-ui.test.ts`, and the document boundary check failed due to the out-of-scope unregistered `todo/docs` path. No build or server restart was performed.

- 2026-10-02: After removing internal scrolling from expanded items, desktop and mobile queue UI checks verified the full six-line height and list scrolling. Existing queue editing and drag regression tests, type, targeted lint, and document link checks passed. No build or server restart was performed.

- 2026-10-02: After capping the queue list height at approximately 3.5 default rows, existing desktop and mobile queue UI regression tests, type, targeted lint, and document link checks passed. The document boundary check failed due to unregistered documents in out-of-scope `todo/docs/`. No build or server restart was performed.

- 2026-10-02: Desktop and mobile queue UI checks verified the saved model, effort, and permissions below the expanded body, with filename tags below them arranged left to right with wrapping configured. Existing expansion, scrolling, and editing regression tests, type, targeted lint, and document link checks passed. No build or server restart was performed.

- 2026-10-02: Desktop and mobile queue UI checks verified the expanded body's 3.5-line height limit, internal scrolling, and 4px right padding. Targeted lint and document link checks passed. The document boundary check failed due to unregistered documents in out-of-scope `todo/docs/`. No build or server restart was performed.

- 2026-10-01: Passed 47 ACP, shared queue, and memory protection checks (skipped 2 optional OS checks). Verified execution of the reordered top message after stopping AI, execution of the next message after canceling approval, continued waiting until CLI termination is confirmed, and AI→CLI ordering. Type, targeted lint, document boundary, and link checks also passed. No build or server restart was performed.

- 2026-09-30: Related drag UI regression checks verified reordering animations and existing input and cancel behavior. The scope and limitations follow [shared motion verification](../../development/ui-contracts.md#drag-reordering-motion).

- 2026-09-30: Desktop mouse and mobile touch UI regression checks verified surrounding row movement and dashed insertion slots before drop, unchanged server order before drop, reordering of rows with different heights, and restoration of the original order on pointer cancellation or Esc. Reviewed drag captures from both screens, and frontend type, targeted lint, and document boundary checks passed. The full type check was blocked by an out-of-scope syntax error in `server/agentWs.ts`, and the document link check by existing missing links.

- 2026-09-30: Desktop and mobile UI regression checks verified expansion/collapse on body click without entering editing and with draft preservation, the 4-line height limit and internal scrolling, pencil placement to the left of X, and editing, saving, canceling, and going back through the pencil. Type, targeted lint, and document checks also passed.

- 2026-09-30: Desktop and mobile checks in `agent-command-ui.test.ts` verified the queue item's Cancel text, hiding the Schedule button during editing, cancellation on Back, and restoration of the original queue item, new-message draft, and CLI mode. Type and targeted lint checks also passed.

- 2026-09-30: Passed 2 connection UI and segmented history tests. On desktop/mobile in both themes, verified removal of the previous body after clicking New Conversation without server list, termination, or preparation responses, no reconnection loading display, draft preservation, and blocked sending. Type, targeted lint, and document checks also passed.

- 2026-09-30: Passed 101 related automated tests. Verified SQLite migration, incremental saving, rollback on failure, multiprocess WAL, WS segments/deltas and generation changes, IndexedDB, scrolling, account isolation, quota failures, and existing ACP/queue/connection regressions. Desktop/mobile and both themes were checked in isolated Chromium. Measurement conditions, figures, and limitations on actual application follow the [conversation storage contract](../../development/conversation-storage.md#validation-and-measurement).

- Confirm that changing the model, effort, or permissions after enqueueing leaves the settings from enqueue time in the queue and that queue editing displays those settings. Confirm that canceling or saving edits restores the new-message settings and that queue execution uses the saved settings.

- User verification criteria: Drag the left queue handle immediately and confirm that the insertion gap and surrounding row reordering appear, and that releasing applies that order. Canceling must retain the original order. Also confirm that clicking the body only expands the full content to a maximum height of 4 lines, and that the pencil button to the left of X opens editing in the bottom input.

- User verification criteria: Select the queue pencil button to edit in the bottom input, then cancel with the queue item's Cancel button, Esc, or Back, or apply changes with the save icon or Ctrl/Cmd+Enter. Confirm that the existing new-message draft, attachments, and CLI mode are restored afterward.
- 2026-09-29: The existing `agent-command-ui.test.ts` passed after the icon changes. In isolated Chromium at 1100/390px, verified cancellation, saving, and blocked saving during attachment uploads, and confirmed X and Send icon placement in screenshots. Type, targeted file lint, and document checks also passed.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Confirm that the top-right corner of user bubbles and the top-left corner of agent response bubbles are square in both collapsed and expanded states.
  - Confirm that the empty conversation prompt appears in the selected language in the center of the body and does not overlap loading, login, or conversation bubbles.
  - Confirm that switching screens or reconnecting during work preserves transcripts and queue order without duplicate sends.

- 2026-09-25: In isolated Chromium on desktop and mobile in both themes, verified overlay boundaries, draft editing and height adjustment while connecting, blocked sending, and draft preservation and sending after tab switching and reconnection.

- 2026-09-25: Passed 75 tests related to `agent-startup.test.ts`, `agentHost.test.ts`, ACP/authentication/transcripts/WS, cache, and connection UI. With mock stdio ACP, verified removal of empty sessions before restoration and duplicate default-setting calls, unsupported load, expired authentication, recovery failure, and writer release. Repeated-chunk cache merging preserved content across all short combinations and long transcripts. Actual provider response times and perceived times after deployment have not been measured.

- 2026-09-25: After switching to empty-bubble shimmer, passed 27 connection UI, transcript cache, and conversation collapse tests. In isolated Chromium at 390/1100px in both themes, verified initial preparation, reconnection, history list and body loading, dismissal after success/failure, draft preservation, and reduced motion. Type, document boundary, and link checks also passed.

- 2026-09-26: Connection UI regression checks delayed the server tab query response to verify that cached prose was not displayed and sockets did not connect before the query. In both themes, verified actual unfocused loading playback time, light position changes, and left-right traversal in the 1100px restored docked panel and 390px regular panel. Type, lint (existing warnings), and document checks also passed.

- 2026-09-26: Removed the interval when the light band disappeared outside the area and increased contrast. In both themes at 390/1100px, checked that actual screenshot pixel contrast at the left, right, and return points was at least 25/255. Also verified fixed positioning and brightness changes with reduced motion; connection UI, type, and document checks passed.

- 2026-09-26: In both themes at 390/1100px, checked that actual pixel intensity across the light band's top, middle, and bottom followed the 0/50/100/50/0 ratio. Connection UI, type, and document checks passed.

- User verification criteria: Check queue attachment tags, adding and removing files and previewing photos during editing, applying changes on completion, and restoration after cancellation. Items containing only attachments must also support editing and saving.

- 2026-09-28: After queue attachment changes, passed 50 related UI, ACP, supervisor, and WS tests. In isolated Chromium at 1100/390px, verified attachment display, addition, removal, preview, cancellation, saving attachments alone, blocked saving during uploads, and late completion of canceled uploads. Verified retention and removal of attachment paths and photo bytes in mock Codex and Claude communication. Type and document checks passed, and lint had only existing warnings. No actual provider execution, deployment build, or server restart was performed.

- 2026-09-29: After consolidating queue editing into the bottom input, isolated Chromium checks in `agent-command-ui.test.ts` (1100/390px) verified removal of inline editors, X and Save placement, draft/attachment/CLI mode restoration, Ctrl+Enter saving and Esc cancellation, photo previews, blocked saving during uploads, and isolation of canceled uploads. Type, targeted lint, and document checks passed. No build or server restart was performed.

- 2026-09-29: After switching to left handles, `agent-command-ui.test.ts` verified immediate dragging and arrow key movement with desktop mouse and mobile touch, no entry into editing after dragging, editing on body click, and existing queue attachment, save, and cancel behavior. Type, targeted lint, and document link checks passed.

- 2026-09-29: After changing queue settings snapshots, passed 43 related ACP, queue, and UI tests. On desktop and mobile, verified passing IDs from enqueue time, loading and modifying queue settings, and restoring new-message settings after canceling or saving. With mock Codex and Claude, verified WS/supervisor delivery, applying settings during queue execution, and restoring runtime settings after the turn. Type, targeted lint, and document checks also passed. No actual provider execution, build, or server restart was performed.

- 2026-10-02: After queue cache restoration, verified early IndexedDB display, settings restoration, account isolation, retained display on disconnection, application of an empty server queue, and cleanup on tab closure in isolated Chromium on desktop/mobile in both themes. Passed 4 conversation segment tests and existing CLI/queue UI tests, along with type, targeted lint, and document link checks. The document placement check reported 3 unregistered `todo/docs` paths unrelated to this change. No build or server restart was performed.

<!-- mew:validation:end -->
