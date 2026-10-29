---
id: "mew-agents-input"
parent: "mew-agents"
title: "Agent Input, Mentions, Skills, and Attachments"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "a10e27bcc06cebe98975858548ff907b5953bfbcf197fe2ef971d9294144858f"
files: ["src/components/AgentPanel.tsx", "src/components/MentionTextarea.tsx", "src/components/agent-composer-input.tsx", "src/components/agent-composer-attachments.tsx", "src/components/agent-media-preview-dialog.tsx", "src/utils/agent-composer-document.ts", "src/components/drawing/DrawingEditor.tsx", "src/utils/clipboard-images.ts", "src/utils/agentInputMentions.ts", "server/skills.ts"]
commits: []
description: "Feature contract covering project, file, and folder @mentions and autocomplete lists in agent input, /skill selection, circular upload indicators for attachment tags inserted at the cursor and moved by mouse drag or touch long press, and inline attachments within user message bubbles after sending. Explains mobile keyboard image pasting, photo and video popup previews, input history, input resizing, CLI switching, queue editing, entry points for SVG history and PNG attachments from the drawing tool, candidate scope, attachment storage in `.mew/temp/assets`, and compatibility boundaries for existing references."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Collect the files, folders, skills, and content needed for a task in the agent input.

### Scope

- Provide @ project/file/folder mentions, / skill selection, attachments, previews, input history, and input height adjustment.

- Edit the pending queue in the bottom input field, with mentions, skills, file addition and removal, and photo and video previews.

- Video attachment tags in new input, pending queue editing, and sent messages open in the same popup as photos. Use native browser playback controls and inline playback on mobile. Remove the player when the popup is closed with Close, Esc, an outside click, or Back. Playable formats and codecs depend on browser support; no server-side conversion is performed.

### Boundaries and limitations

- Candidate scope, priority, and attachment storage follow the input specification.
- The full discovery list in the skill management window differs from the candidate list available for the current input.

### Related documents

- [Skill candidate contract](../../../../docs/configuration/agent-harness.md)
- [Vector drawing tool and saved history](agent-drawing-editor.md)

## Detailed behavior

If a path hint for an `@` file or folder candidate exceeds the available width, truncate the beginning with an ellipsis and show the end. Preserve the path string's reading order and the trailing `/` on folders. Subproject descriptions and `/` skill descriptions continue to be truncated at the end.

The input field in the agent window shows an autocomplete list when a token prefix is entered. Selecting an item appends one space so typing can continue.

| Input | List | Selection result |
| --- | --- | --- |
| `@` | Workspace subprojects appropriate to the role, folders and files in the current project, and folders and files within Documents | For projects, a newline after `[프로젝트명]`; for folders and files, a space after the mention token (project and relative path) |
| `/` | Local skills | `/스킬명` |

`/` candidates are dedicated/shared skills matching the current agent's cwd and runtime. Prioritize nearby projects and merge global skills, excluding child and sibling projects. Reload candidates when skills are modified, moved, or deleted in the management window. Storage locations, priorities, and application to scheduled messages follow [Skill and MCP management](../../development/agent-harness.md#input-fields-and-apis).

Agent autocomplete shows all candidates through scrolling rather than truncating them at 8 items. The list has a maximum height of 224px and fits the available visual viewport space above the input if that space is smaller. Display the list in a fixed portal layer to prevent clipping by the parent panel or obstruction by the top UI. The default portal target is body; within dialogs or fullscreen, use the corresponding boundary. Overflowing candidates scroll within the list, retaining the shared 6px scrollbar and stable scrollbar space. Recalculate placement when the screen, ancestor area, input size, or scroll position changes. Folders and files below subprojects remain selectable even when there are many subprojects, and arrow-key navigation scrolls only the list to reveal the selected item without moving the outer page.

Folders are distinguished from files by a trailing `/`. Current project candidates use the already loaded tree. Documents is merged under a separate `docs` scope, and its full permission-filtered tree (`GET /api/tree?project=docs`, omitting `path`) is fetched only when `@` is opened, including documents beneath folders collapsed in the file explorer. Documents candidates also appear when the selected editor file is scoped to the root project. Item path hints use `Documents/상대경로` and selection tokens use `[[docs:상대경로]]`. The same scope is used even if Documents is physically located in a custom folder rather than `docs`. Distinguish these candidates from current project files with the same name and relative path; when editing Documents itself, merge duplicate candidates and retain priority for the focused file.

Query Documents only while the input field's `@` menu is open. Existing candidates remain selectable during the query; on failure, retain them and retry the next time `@` is opened. Cancel in-progress queries and ignore late responses when the menu closes, the tab changes, or the root project changes. Clear and reload Documents candidates when permissions change. Do not query the full Documents tree during normal input, `/` skill selection, or CLI command mode.

`@` results show only items that **start with** the entered string. If there is a last-focused editor file, show it first; otherwise, prioritize **subprojects → folders → files**, with each type sorted in ascending Korean alphabetical order. Subprojects combine the role-specific list from `GET /api/projects` with subprojects discovered in the current tree. Thus, guests see only projects visible to their role, while managers and owners who can use the agent window see all workspace projects. Selecting a project inserts `[프로젝트명]` and places the cursor on the next line, then renames the current agent tab to `프로젝트명` without brackets. If a tab already has that name, append the smallest available number, as in `프로젝트명 (1)`. Use `@` to reference folders and files directly.

The input area has two columns. The left column stacks the model, reasoning level, and permission dropdowns above the input field; the right column places the Save button at the top and the attachment, schedule, and Send buttons at the bottom. Group the bottom buttons with `gap-1.5` spacing. Dropdown arrows point upward by default, and only the model dropdown places its arrow at the far right. Only the model dropdown fills the remaining width of the left settings row; the reasoning level and permission dropdowns retain their content widths. The minimum resize height is the hug height, calculated from the actual content height of the right button column plus the input area's computed padding and borders. Use ResizeObserver to detect button row size changes and reflect them in the minimum height, resize lower bound, and available height with the keyboard open. With the current styles, this is 137px; do not hardcode this value as the UI lower bound. At both minimum and expanded heights, align the bottom edges of the Send button and input field to the same y-coordinate. If the saved height is below the measured minimum, increase only the displayed height. The maximum is 90% of the agent window. If the mobile software keyboard or browser UI covers the bottom of the screen, calculate the actual obscured height from `visualViewport`, shift the entire input area upward by that amount, and subtract the same amount from the displayed height limit. On mobile, set the bottom limit 8px above the measured boundary to avoid overlapping the keyboard even at maximum height. Restore the user-defined height when the keyboard closes. Files selected, dropped from the OS into the input field, or pasted from an image clipboard are saved with their original bytes in `.mew/temp/assets/` of the currently open root project; the server avoids name collisions. On file selection or paste, insert a pending upload tag at the cursor or selection, then replace it in place with an image, video, audio, or generic file icon when saving completes. Insert multiple files in selection order. Text remains editable during upload, and pending tags move with the surrounding text. Sending is disabled until uploads finish. Within the input field, tags act as single characters for cursor movement, selection, Backspace/Delete removal, undo, and redo, and can also be removed with ×. Tags do not display extension text; filenames are provided through tooltips and accessible names. Size tags to fit the icon and × without empty space from a fixed minimum width. Give the container wrapping the icon and × button equal padding of 4px (`p-1`) on all four sides. Clicking a photo tag's body opens a large preview popup, which closes with ×, an outside click, or Escape. Store actual project and upload path references in the draft string, but hide them with CodeMirror atomic replacement widgets so raw paths are not displayed. Keep identifiers created during upload inside the editor and convert them to actual references for display, drafts, cursor APIs, and the clipboard so upload completion does not change the undo history. Sending, scheduling, and queue saving preserve the current order of text and tags. Sent user messages display attachment tags in that order within the bubble body. The pending queue list retains separate icons beside the body and hides path tokens in the body.

Pending upload tags in new input and pending queue editing display a 12px circular `LoadingIndicator variant="spinner"`. Replace it with a file-type icon after upload completes. Distinguish it from the three-dot indicators for connection, initial preparation, and history queries; variants, reduced motion, pausing, and forced colors follow the [shared loading contract](../../development/ui-contracts.md#shared-loading-indicators).

Attachment tags begin moving immediately when held with a mouse or pen and moved more than 4px. Touch movement begins after a 350ms long press and is canceled if movement exceeds 8px before then. The existing long-press interaction also remains available for the mouse. Dragging between text while holding displays a ghost and insertion cursor to indicate placement; releasing moves the tag. Near the top and bottom edges of the input field, scroll its contents. A normal click opens a photo preview or file; dragging does not trigger the click action. Esc, pointer cancellation, or release outside the input field preserves the original position. Decisions on tag positions and metadata retention follow the [inline attachment decision](../../decisions/0039-agent-inline-attachments.md).

Sent attachments appear as the same icon tags used in the input field, at the positions of upload reference tokens in the user bubble body, without × buttons. Since sending is unavailable during uploads, bubble tags retain completed file-type icons and do not show loading states. Tags flow with surrounding text and wrap to the bubble width. Show a bubble even when only attachments are sent. Photo tags open large previews; other files open their original links. Do not automatically expand photos, audio, or video within the conversation. Hide raw upload path tokens on screen and when copying questions; retain the existing text display for regular file mentions.

For historical runtime transcripts without attachment events, restore tags at the original positions of `.mew/temp/assets/` and `.mew/files/` references remaining in the body. If the same attachment appears at multiple positions, display it at each position, but do not add extra tags based on metadata. For attachments retained only in metadata with no body reference, display one tag per file at the end of the bubble body. If MIME is missing or indicates a generic binary, determine the icon type from the extension.

Attachment uploads and reference tokens use the root project scope (`.workspace`). Storage remains at `<프로젝트>/.mew/temp/assets/` even if the file being edited is in Documents (`docs`) or switches to another file scope. Even if Documents is `.mew/docs`, do not create `.mew/files` or `.mew/assets` beneath it. Apply the same rules to new messages and pending queue editing, and continue reading historical attachment references stored in existing conversations and queues unchanged.

Open the [vector drawing tool](agent-drawing-editor.md) using the **Open drawing tool** icon at the bottom right inside the input field or `Ctrl/Cmd+Alt+D`. **Save** records the editable source SVG in the root project's `.mew/temp/drawings/` history, converts the same drawing to PNG, and links it through an existing `.mew/temp/assets/` attachment tag. Use the same behavior for new input and queue editing without automatically sending the message. Do not open it in CLI mode or during attachment uploads. Recheck the project and input target used when opening it after saving and uploading complete, so late responses do not attach to another input. The drawing tool document owns tools, shortcuts, Google Fonts, history re-editing, and the save API.

The pending queue also displays the same file-type icon tags beside the body. Clicking the pencil edit button on the right of an item displays attachment tags within the body in the existing bottom input field; files can be added with the same file attachment button and removed with each tag's ×. Photo tags use the existing large preview, and Escape closes only the preview while keeping editing active. Queue editing and new messages share the bottom input UI but maintain independent body and attachment state. Saving or canceling restores the preserved new message draft and attachments. Block both the Save button and save shortcut during attachment uploads, and save when attachment tags exist even without regular text. Selecting all and deleting removes both text and tags. Saving applies the body and attachments together; canceling retains the original attachments. Uploads from canceled edits must not attach to a subsequent edit or new message even if they finish late. Removing files or canceling edits does not delete uploaded originals from disk. Attachments stored separately from the body in older queues are appended as tags to the body on the first edit. New queues restore their exact positions within the body. Retain metadata for deleted tags for editing history, but send only attachments present in the current body. If deletion of a tag during upload is later undone, reconnect it to the completed file; do not restore failed pending tags. Remove pending tokens for uploads interrupted by refresh when restoring drafts.

Agent input uses CodeMirror's `contenteditable="true"` host and applies `-webkit-user-modify: read-write` to `.cm-content[contenteditable=true]` to override the default `read-write-plaintext-only`. Handling image events alone does not resolve the OS keyboard identifying the input as plain-text-only, so the editing host must also permit image insertion. Ensure mobile keyboards recognize it as an input that accepts image clipboard content, and route image files provided through `paste` and the keyboard's `beforeinput(insertFromPaste)` to the attachment path above. Handle external file drops during the capture phase before the editor, attaching each file separately without inserting file contents into the body. Preserve the editor's default behavior for text dragging. If the file list is empty, use files from clipboard items, and do not insert photos into the body as `<img>`. Paste text and HTML clipboard content as plain text, and do not send with Enter during Korean composition. Support is not guaranteed for OS, keyboard, and browser combinations that do not pass image files to the web; file attachments can be used in those cases. Do not read the entire clipboard history or request separate clipboard permissions. CLI mode retains the same text editing host but does not accept image attachments. Chat and comment inputs retain their existing textarea.

Keep up to the most recent 100 successfully sent inputs per tab in the browser. Pressing ↑ on the input field's first line loads the previous input; pressing ↓ on the last line loads the next input. Place the cursor at the end of input loaded with ↑, and at the start of the next input loaded with ↓ or a restored unsent draft. Arrow keys within multiline input retain cursor movement. Empty lines and whitespace-only lines each count as a line; do not load history in a direction if explicit line breaks remain above or below the cursor in that direction. Cursor movement also takes priority on lines wrapped automatically to fit the screen width.

Long input and automatic wrapping scroll vertically inside CodeMirror without increasing the user-defined input area height. The mention wrapper for image-enabled input uses `min-height: 0` so the content's minimum height does not exceed the available flex height. The autocomplete list remains above and outside the wrapper. Mobile dock reserved space and keyboard adjustments follow the existing panel layout; restore the input height and position above the dock when the keyboard closes.

Verification: `server/mention-textarea-ui.test.ts` checks list height, portal placement, scrollbars, wheel scrolling, arrow-key selection, preservation of outer scroll position, and resizing in narrow panels and desktop/mobile sizes with top UI, in both themes. `src/utils/agentInputMentions.test.ts` checks scopes, distinction between same-name files, nested Documents, deduplication, and focus priority; `server/agent-command-ui.test.ts` checks delayed queries, filtering, selection, sent tokens, query failures, ignored responses after closing, and retries in the actual AgentPanel on desktop and mobile. The same isolated Chromium tests also verify image attachment and sending through `paste` and `beforeinput`, formatting removal, blocking sends during Korean composition, multiline input history navigation, internal scrolling and height retention for long input and automatic wrapping, mobile dock reserved space, and input area boundaries during keyboard viewport shrinkage and restoration. Mobile verification uses browser viewport sizes and synthetic events and does not replace real-device verification of OS keyboard clipboards and keyboard animations.

A newly entered `! ` at the very beginning of the input removes the two characters and switches between normal and CLI modes in either direction. Preserve the remaining body and cursor. Do not switch in the middle of the body; retain the characters literally during pending queue editing, without terminal permission, when attachments exist or are uploading, or while sending a command. Apply the same switching restrictions as the existing CLI button and Ctrl+Alt+M.

Switch modes only once even if CodeMirror sends duplicate document and cursor change notifications for the same input before React renders. When processing the prefix, set the opposite of the current mode rather than toggling the mode again for each notification.

Store new attachments in `.mew/temp/assets/`. Continue recognizing historical `.mew/assets/` and `.mew/files/` references, and do not automatically move or delete existing files. Git exclusion follows the `.mew/temp` rule registered in the project's `.gitignore`.

<!-- mew:implementation:start -->
## Implementation details

- Position the cursor according to the navigation direction after browsing input history ([input specification](agent-input-mentions-skills-and-attachments.md)).

- Calculate the input area's minimum height from the actual content height of the button row and computed padding and borders. Automatically reflect changes to button sizes and spacing; if the content exceeds the saved height, increase the displayed height to keep the input field and Send button aligned at the bottom ([input specification](agent-input-mentions-skills-and-attachments.md)).

- Provide @ project/file/folder mentions, / skill selection, attachments, previews, input history, and input height adjustment.

- Keep draft editing, attachments, and height adjustment available while connecting, and restrict only the Send button and send shortcut based on connection state ([connection display contract](agent-conversations-queue-and-restoration.md#waiting-for-connection-and-reconnecting)).
- When external files are dropped into the input field, link each file as an attachment tag and handle the drop before the editor so file contents do not mix into the body being composed.
- Link photos as attachment tags in an editing host that can accept mobile image clipboard content. Text, mention, and CLI input contracts and real-device support scope follow the [input specification](agent-input-mentions-skills-and-attachments.md).
- The container wrapping the attachment tag's extension and remove button has equal padding on all sides.
- Sent user messages display attachment tags at their original positions within the bubble body. Metadata attachments without body references are appended once each to the end of the body inside the bubble, and messages containing only attachments also display a bubble.
- Long input and automatic wrapping scroll within the input field, and the editor does not grow beyond the area defined by mobile dock and keyboard adjustments.
- The agent input's `@` list combines current project candidates with folders and files inside Documents.
- Also query collapsed subfolders in Documents, and distinguish project files with the same name through path hints and scope-specific tokens.
- Documents query timing, cancellation, and permission filtering follow the [input specification](agent-input-mentions-skills-and-attachments.md).

- Pending queue editing reuses the bottom input field and attachment button while independently preserving the new message draft and attachments. Saving applies attachments together with the body, canceling retains the originals, and safeguards prevent saving during uploads or late uploads from entering other drafts ([input contract](agent-input-mentions-skills-and-attachments.md), [queue delivery contract](../../development/agent-sessions.md#messages-reconnection-and-queues)).

- Attachments for new messages and the pending queue are stored in the root project's `.mew/temp/assets/` regardless of the scope of the file being edited. Do not create a nested `.mew` for attachments under Documents ([storage contract](agent-input-mentions-skills-and-attachments.md)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- For the 2026-10-27 fixes, regression checks, and scope unverified on real devices for mobile keyboard image pasting, see the [work record](../../work/agent-keyboard-image-paste.md).

- For the verification and application status of the 2026-10-27 restoration of the circular upload indicator, see the [work record](../../work/loading-indicators.md).

- 2026-10-26: Isolated Chromium tests in `agent-history-ui.test.ts` at 1100/390px in light/dark themes verified video popup playback from the input field and sent messages; opening by click, Enter, and Space; player removal after Close, Esc, and outside clicks; no new tab creation; and restoration after refresh. Existing image popup layer checks, 4 attachment unit tests, type checks, targeted lint, description checks, and changed-document link checks passed (existing lint warnings remain). The full document link check had 17 failures due to document deletions in a separate change. App builds, server restarts, and real mobile device verification were not performed.

- 2026-10-23: 5 history UI and attachment unit tests, type checks, targeted lint, all description checks, and document link checks passed (existing lint warnings remain). Isolated Chromium at 1100/390px in light/dark themes verified original attachment positions within bubbles, repeated references, prevention of metadata duplicates, restoration of historical attachments, attachment-only bubbles, regular mentions, question copying, photo previews by click/Enter/Space, attachment URLs with special characters, expansion of long collapsed bubbles on Tab focus, and restoration after refresh; 4 screenshots were reviewed. Builds and server restarts were not performed.

- 2026-10-22: Moved attachments to inline tags at the cursor or selection and added movement after a 350ms long press. 46 separate Chromium UI tests at 1100/390px in light/dark themes verified cursor movement, selection, atomic deletion, repeated Undo/Redo, upload completion, deletion before completion, failures, copied final references, previews, movement, and cancellation. At 390px, CDP touch events also verified long presses and movement with actual touch pointers. 8 unit tests for internal identifiers, actual references, Korean/emoji position conversion, and editing history; 35 related unit, WS, supervision, and file drop tests; 3 comprehensive AgentPanel, drawing tool, and mention UI tests; type checks; targeted lint; all description checks; and changed-document link checks passed. Existing lint warnings remain. The final full document link check failed on 29 existing references because `docs/SECURITY.md` was deleted in separate work; that file was not modified. In one comprehensive UI test run, the existing CLI preparation stage timed out; a standalone rerun passed. Real-device testing of actual OS keyboards and devices, builds, and server restarts were not performed.

- 2026-10-19: Moved the autocomplete list to a portal and applied a maximum height of 224px, visual viewport boundaries, and its own scrollbar. Isolated Chromium at 1100/390px in light/dark themes verified avoidance of top UI obstruction and panel clipping, selection of the last candidate using the wheel and arrow keys, preservation of outer scroll position, and changes to the input area, screen, and keyboard viewport. The new list UI test and 7 existing input field, file drop, and mention candidate tests, targeted lint, and document checks passed. The final full type-check run failed with TS2740 in the untracked `src/utils/scrollbar-touch.ts:53` from separate work. Builds and server restarts were not performed.

- 2026-10-19: Unified attachments in the input field, pending queue, and above user bubbles as file-type icon tags. Isolated Chromium at 1100/390px in light/dark themes verified placement outside bubbles, hidden extensions and delete buttons, photo previews, restoration after refresh, and historical photo references without metadata. The comprehensive input UI test, 19 attachment/conversation unit tests, type checks, targeted lint, and document checks passed. In the first parallel run, the comprehensive input test timed out during CLI switching before the attachment checks; a standalone rerun passed. Builds and server restarts were not performed.

- 2026-10-07: Changed CLI switching in the input to Ctrl+Alt+M to avoid conflict with Ctrl+Tab browser tab navigation. Actual input tests in `agent-command-ui.test.ts` at 1100/390px verified switching in both directions, preservation of body and focus, and exclusion of switching when a button has focus.

- 2026-10-05: Isolated Chromium on desktop and mobile verified cursor placement at the end when recalling history with ↑ and at the start when loading the next history entry or restoring a multiline draft with ↓. Related UI tests, type checks, targeted lint, document allowlist checks, and workspace link checks passed. The UI test failed once due to a timeout waiting for the Send button in the existing preparation stage, then passed on rerun. Builds and server restarts were not performed.

- 2026-10-02: In isolated Chromium, verified that dropping 2 text and photo files simultaneously using file transfer data equivalent to an OS file drop invoked each attachment callback once and preserved the draft body. Targeted lint had only 1 existing warning, and the UI checker passed. The full AgentPanel tests and type checks could not be completed because an API module under development was missing, and the document allowlist check failed because of the existing unregistered `todo/docs/` boundary. No build or server restart was performed.

- 2026-09-30: After switching to a hug minimum height, verified on desktop and mobile that increasing the send button from 32 to 48px automatically changed the minimum height from 137 to 153px while preserving bottom alignment. All 6 tests covering button size restoration, default/minimum/expanded heights, and existing input regressions passed, along with type checks and targeted lint.

- 2026-09-30: First reproduced the regression that broke bottom alignment at the minimum height, then fixed it to 137px. Checked the bottom coordinates of the input field and send button at default, minimum, and expanded heights on desktop and mobile in isolated Chromium. All 6 related tests, type checks, targeted lint, and the document allowlist check passed. The full link check failed because of 2 existing unregistered boundary links in central ADR 0183. No build or server restart was performed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify mention targets, skill scope, blocking sends until attachments are complete, and input positioning above the mobile keyboard.
  - Verify that photo attachment tags have equal spacing on all sides, including visible spacing to the right of the × button.

- 2026-09-24:
  - All 5 mention utility and actual AgentPanel tests in isolated Chromium passed.
  - Verified nested file display in Documents, differentiation of identically named files, keyboard selection and sent tokens, and retries after lookup failures or cancellation on desktop and mobile.
  - Type and document checks passed; lint had only existing warnings.
  - No deployment build or server restart was performed.

- 2026-09-27:
  - Verification passed in isolated Chromium at desktop and mobile sizes for image attachment and sending via paste/beforeinput, mentions, text formatting removal, prevention of sending during composition, input history, and draft preservation during CLI switching and reconnection.
  - All 2 related UI tests, 16 input and clipboard utility tests, and type and document checks passed. Lint had only existing warnings.
  - The clipboard list on an actual mobile OS keyboard is unverified, and no deployment build or server restart was performed.

- 2026-09-28:
  - Before the fix, confirmed that the regression test failed because long input did not produce internal scrolling; it passed after limiting the mention wrapper height.
  - Verified height preservation and internal scrolling for long input and automatic line wrapping, reserved space for the mobile dock, viewport shrinking with the keyboard, and position restoration after closing it in isolated Chromium.
  - All 11 related UI, input layout, and mention tests, and type and document checks passed. Lint had only existing warnings.
  - Actual mobile keyboard animation is unverified, and no deployment build or server restart was performed.

- User verification criteria: Check queue attachment tags, adding and removing files and previewing photos during editing, applying changes on completion, and restoration after cancellation. Items containing only attachments must also support editing and saving.

- 2026-09-28: After queue attachment changes, passed 50 related UI, ACP, supervisor, and WS tests. In isolated Chromium at 1100/390px, verified attachment display, addition, removal, preview, cancellation, saving attachments alone, blocked saving during uploads, and late completion of canceled uploads. Verified retention and removal of attachment paths and photo bytes in mock Codex and Claude communication. Type and document checks passed, and lint had only existing warnings. No actual provider execution, deployment build, or server restart was performed.

- 2026-09-29: Reproduced the incorrect attachment scope when Documents was selected with a regression test, then fixed it. All 6 related tests covering attachment paths for new input and the pending queue on desktop and mobile and preservation of existing references passed, along with type checks and the document allowlist check. Lint had only existing warnings, and the full document link check failed because of the existing missing `docs/guides/getting-started-ja.md`. No deployment build or server restart was performed.

- 2026-09-29: After consolidating queue editing into the bottom input, isolated Chromium checks in `agent-command-ui.test.ts` (1100/390px) verified removal of inline editors, X and Save placement, draft/attachment/CLI mode restoration, Ctrl+Enter saving and Esc cancellation, photo previews, blocked saving during uploads, and isolation of canceled uploads. Type, targeted lint, and document checks passed. No build or server restart was performed.

<!-- mew:validation:end -->
