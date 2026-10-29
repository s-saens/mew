---
id: "mew-settings-mewcat-assistant"
parent: "mew-settings"
title: "Mewpet assistant, conversations, and Mew operations"
status: "changed"
created: "2026-09-30"
updated: "2026-10-29"
files: ["src/components/mewcat-assistant.tsx", "src/hooks/use-mewcat-assistant.ts", "server/mewcat-assistant.ts", "server/mewcat-mcp-stdio.ts", "src/App.tsx"]
commits: []
description: "Contract for the Mewpet assistant's independent agent conversations, runtime selection, screen operations, project creation, Documents setup, permissions, result verification, and built-in MCP tool help in resources/help의."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- Ask questions and execute Mew features in the area between recent notifications and system resources in the Mewpet popup.
- Automatically inject Mew's built-in MCP into the selected agent without requiring the user to establish a separate MCP connection.
- Apply the current language to the UI, instructions for subsequent AI responses, and new document creation.

### Scope

- Provide runtime selection and authentication guidance, assistant-specific conversations, streaming responses, Stop, Clear Conversation History, and restoration.
- Navigate notifications, conversations, input, and resources with a single scroll area for the entire popup. Clear Conversation History resets both the displayed history and the current conversation context.
- Provide current context and product help, project creation and opening, Documents setup, file and panel opening, and request drafts for project work conversations.
- Preserve existing notifications, resources, account permissions, and documents.

### Boundaries and limitations

- Allow owner and manager accounts to create and open projects; Documents setup is owner-only. Accounts without agent permission cannot use the conversation area.
- Do not modify existing runtime MCP settings. Do not mark tool failures or disconnections as completed.
- Deletion, deployment, app builds, and updates are outside the tool scope. The user sends project work drafts.
- Session restoration and actual tool connections depend on ACP runtime support; verification with actual provider accounts is separate.

### Related documents

- [Existing Mewpet](mewpet-mascot-notifications-and-breaks.md)
## Detailed behavior

Decision: [ADR 0184](../../history/decisions/0184-mewcat-assistant-session-mcp.md).

### Purpose and entry point

Help novice developers and general users working on multiple projects ask questions and execute requested features without studying Mew settings. Clicking Mewpet displays a conversation area between the existing recent notifications and the system resources at the bottom. Accounts without agent permission can use only the existing notifications and resources. Resources follow the existing system permission.

- The gear button at the top of the speech bubble closes the bubble and opens the **Mewpet** section in Settings directly. It immediately displays the section contents on mobile as well; if Settings is already open, it navigates to the Mewpet section in the same window. This is separate from the assistant's runtime selection gear.
- When no runtime is selected: **Connect Agent** opens the runtime list in the agent panel. The user selects a runtime and completes any required installation and login. The selected runtime is also used for the assistant.
- If a work agent is already connected and no assistant runtime is selected, use the first ready runtime. Do not start the assistant process until Mewpet is opened for the first time.
- After selection: Display the agent name, a Clear Conversation History button, and a gear button. Use the gear's own selection list to switch installed ACP runtimes, or prepare another runtime in the existing agent panel. Clear Conversation History uses the existing new conversation action to reset the displayed history and the current agent conversation context. Disable clearing when there is no history, before the connection is ready, or while a request is in progress; also disable runtime changes while a request is in progress.
- Direct users to the agent panel when login is required. Once the work conversation is ready after authentication, recheck authentication for the assistant on the same runtime.
- Display the runtime selection list above the speech bubble so conversation content does not obstruct clicks or touches on options. Preserve the shared `SelectField` positioning, keyboard, touch, and closing behavior.
- In gradient themes, display the popup background and speech bubble tail at 75% opacity, matching the hamburger menu, and apply a 6px backdrop blur to the body. Keep the inner conversation bubbles and input field solid, and do not blur text or icons. In solid-color themes, use the existing opaque background. Follow the [Popup theme contract](../../development/ui-contracts.md#theme-colors-and-derived-accents) for shared behavior.
- The question input placeholder is “I want to build a note-taking app.” Send with the Send button or Enter; Shift+Enter inserts a line break, and Enter during IME composition does not send.
- Stream responses in speech bubbles, and navigate recent notifications, conversations, input, and resources with a single scroll area for the entire popup. Do not give the notification list or conversation area separate height limits or scrolling. Follow new responses when the user is viewing the bottom, and preserve the scroll position while the user reads earlier history. Provide progress status, Stop, Approve/Reject, and reconnection after failure. Conversations and tasks persist when the popup is closed.

### Conversation ownership and restoration

Use a dedicated supervisor and ACP conversation for each account, browser tab identifier, and runtime. The supervisor's working directory is fixed at `DATA_DIR/mewcat/<digest>`. Pass the current screen's project and UI language separately with every request, so switching projects does not recreate the assistant conversation. Do not reuse regular project sessions as assistant conversations.

Store runtime selection in per-account browser localStorage, the browser tab identifier in sessionStorage, and the ACP session pointer in localStorage per account, tab, and runtime. On refresh, reconnection, or return after a runtime change, use the existing supervisor or session/load on a supported runtime. Other browser tabs have separate assistant conversations. Restricted storage limits saving and restoration convenience. Runtime load support issues or history restoration failures can be identified through connection errors.

Conversation transcripts use the existing [Storage contract](../../development/conversation-storage.md). Display up to 200 recent conversations on the current screen. Preserve existing conversation and project names when the language changes.

### Automatic MCP

Inject Mew's own stdio MCP bridge into session/new and session/load. Do not require users to provide an MCP address or token, install MCP, or edit configuration files. Do not change the global or project MCP source settings or the existing [MCP management window](../../../../docs/configuration/agent-harness.md). Authentication retries, new conversations, and ACP restarts for restoration use the same MCP information.

The bridge sends requests to the server through a helper-only Unix socket. The directory uses 0700 and the socket uses 0600; no separate authentication secret is passed to the browser. The server rechecks the original web session's authentication and agent permissions on every call and when receiving screen action results. Project creation and opening are allowed for owner and manager; document initialization is owner-only. Per-screen feature permissions and file access follow the existing UI/API.

| Tool | Behavior |
| --- | --- |
| `mew_get_context` | Retrieve the current project, UI language, project management permissions, and default parent location for new projects |
| `mew_get_help` | Retrieve current product documentation for one topic: getting started, projects, Documents, agents, Git, or Mewpet |
| `mew_create_project` | Create a new project folder inside an existing parent folder; do not overwrite existing folders |
| `mew_open_project` | Open the requested project in a top tab and activate it |
| `mew_setup_documents` | Create missing default documents while preserving the specified project's existing settings and documents |
| `mew_open_file` | Open an existing file in the specified project in the regular editor |
| `mew_open_panel` | Open the agent, Documents, Git, browser, settings, or project selection screen |
| `mew_start_project_session` | Open a separate project conversation and prepare a work request draft in the input field |

Send screen navigation operations to the requesting browser with an operation ID. Verify that project tab restoration, file tab selection, and acceptance of the request in the work conversation are reflected in the actual UI state. Open Documents files using the existing `docs` API and tab scope. The browser handles existing project switching, file opening, and panel actions and returns the results. Ignore responses for other operation IDs, and do not treat failures, disconnections, permission revocation, or a 60-second timeout as success. Do not automatically delete files already created if subsequent screen navigation fails. If the server restarts, surviving supervisors resume tool calls through the same local socket path after the browser reconnects.

Do not provide tools for deletion, deployment, Mew builds, updates, or secret modification. The agent's own shell and file access follow existing execution permissions; this MCP is not an OS sandbox.

### Project startup flow

Route requests such as “I want to build a note-taking app” through checking the current context → creating and opening a project → setting up Documents → opening a separate project conversation. Ask only for required information such as the name and location as needed. Prepare the actual work request as an input draft for the user to review and send. Include instructions with every request not to claim completion before tool results arrive. The AI's tool selection and response quality depend on the connected runtime.

### Translation

Provide Korean, English, Japanese, and Simplified Chinese titles, buttons, placeholders, statuses, errors, and accessibility text through `mewcat.assistant.*` keys. Apply language changes immediately to the open popup and subsequent requests. Instruct the AI on every request to respond in the current UI language; do not retranslate existing responses. Preserve original provider errors and tool operation titles as externally generated content, and translate Mew's error guidance and approval buttons.

New Documents documents generated by the assistant use the UI language. Preserve the default English templates in the existing initialization GUI and CLI. Include the template language in the generation preview revision.

### Implementation and verification

Server: `mewcat-assistant.ts` (permissions, MCP, tools, and round trips to the UI), `mewcat-mcp-stdio.ts` (stdio), existing `agentWs.ts`, `agentHost.ts`, and `agentAcp.ts` (independent supervision, injection,
and conversation). UI: `use-mewcat-assistant.ts` (sessions), `mewcat-assistant.tsx` (conversation), `Mewcat.tsx` and `mewcat-resources.tsx` (existing popup integration), `App.tsx` and `AgentPanel.tsx` (actual UI behavior and runtime connections).

Use isolated MCP/ACP tests to check automatic injection on session creation, new conversations, and restoration; project creation, document preservation, and language-specific generation; permission revocation, account isolation, and waiting for browser responses. Exercise the round trip from an authenticated isolated WebSocket → independent supervisor → actual stdio MCP → project creation and document setup → browser navigation response. Also check project switching, Documents tabs, work conversation drafts, and navigation failures in the actual App using isolated Chromium. Use Chromium fixtures to verify desktop and mobile, both themes, all four languages, Enter/IME, session persistence after reopening the popup or switching projects, runtime changes, conversation restoration, and error guidance. Do not make requests with actual provider accounts, build the app, or restart the server.

<!-- mew:implementation:start -->
## Implementation details

- Integrated assistant conversations, input, sending, and the gear selection list into the Mewpet popup, and connected runtime selection and authentication from the existing agent panel.
- Removed internal scrolling from conversations and notifications, and follow streaming responses only when at the bottom of the popup. Connected Clear Conversation History in the header to the existing new conversation action.
- Reuse independent supervisors and ACP conversations, and automatically inject the built-in stdio MCP during session creation and restoration.
- Check the original account's permissions on each local socket call, and request and respond to screen navigation using operation IDs.
- Provide UI, AI response language instructions, and document templates in four languages, and preserve existing documents and conversations.
<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-17: In isolated Chromium at 390/1100px, verified 80% background opacity for the Mewpet body and tail in Midnight, Rose, and Ocean, a 6px backdrop blur on the body, solid colors for inner bubbles and the input field, and restoration when switching between dark and light modes. Existing checks for all four languages, input, IME, conversation persistence, and runtime switching also passed.

- 2026-10-02: In desktop and mobile Chromium, verified a single popup scroll area for long conversations, disabled clearing while requests are in progress, and history reset. Type, lint, and document link checks passed (existing lint warnings remain). The workspace document placement check reported 3 unregistered documents in `todo/docs` outside this change.

- 2026-09-30: Checked isolated stdio MCP, ACP, authenticated WebSocket/independent supervisor round trips, and project initialization regressions. Chromium fixtures verified desktop and mobile in both themes and all four languages, IME, session persistence, runtime changes, and error handling. Checked project switching, Documents tabs, work request drafts, and navigation failures in the actual App; type, lint, and document checks also passed (existing lint warnings remain).
- The project tab, Documents, and work conversation draft must be checked by requesting “I want to build a note-taking app” through an actual connected provider. The status remains `changed` until user verification.
<!-- mew:validation:end -->

## Built-in help resources

The start, projects, documents, agents, git, and mewcat topics in `mew_get_help` read the product tool usage instructions in `resources/help/`. They do not read project implementation specifications or public guides as runtime payloads. Help explains tools, control locations, permissions, and the difference between drafts and sending; successful execution of actual screen operations is verified through result responses.
