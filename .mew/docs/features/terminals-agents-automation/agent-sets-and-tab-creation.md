---
id: "mew-agents-presets"
parent: "mew-agents"
title: "Agent Sets and Tab Creation"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "3e9a3293848b77d07af2e0bbeb65a930bb54c18ce2da6a1b7543c145fb06a0b9"
files: ["src/components/AgentPanel.tsx", "src/components/AgentSetPicker.tsx", "server/agentSets.ts", "server/agentCwd.ts"]
commits: []
description: "A feature contract covering new-tab runtime selection with number keys 1–9, automatic focus on new conversation input, numbering duplicate tab names, number display between the install button and settings icon, handle-based drag reordering, per-browser order storage, creation/editing/selection of agent sets containing runtime/model/effort/role presets, and per-project tab creation. Provides tab renaming by double-click, a context menu, and panel maximization/restoration by double-clicking the panel handle. Describes creating new tabs and restoring closed tabs based on panel focus, bidirectional swipe cycling through conversation tabs and the final + picker, retaining the Ctrl/Cmd+W close target immediately after keyboard tab switching, saving exact models, direct entry, restoring existing tabs, and dedicated AI Commit execution."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Save frequently used runtimes, models, effort levels, and roles as presets to open tabs.
- Select the model and supported effort level separately, as in the panel. Codex stores the exact model/effort pair in the model ID; other runtimes store the ACP effort setting separately.
- Search by model name or ID and select from a runtime-specific candidate dropdown, or directly enter an ID that is not listed.

### Scope

- Provide agent set creation, editing, and selection, along with per-project tab and tab name management.
- Switching with `Ctrl/Cmd+1…9` or the previous/next tab shortcuts also moves keyboard focus to the selected tab. Pressing `Ctrl/Cmd+W` afterward closes the active tab in the same agent group. Closing uses the same last pointerdown/focusin target as new-tab creation and restoration, so selecting an empty agent area does not close an editor tab even if actual focus remains in the editor or moves to body. Do not close tabs for hidden, inert, or removed targets, or during a modal, IME composition, or repeated input.
- Pressing `Ctrl/Cmd+N`, `Ctrl/Cmd+T`, or `Alt+N` in an agent panel, including a new-file shortcut reassigned in settings, opens the same runtime/agent set selection screen as that group's `+`. This also works in conversation input, the tab bar, detached panels, and CLI TUIs; in the editor and file explorer, it opens the existing new-file name input. Do not open a new tab during a modal, IME composition, or key repeat. Fullscreen conditions for browser-reserved keys follow the [Common Shortcut Contract](../../development/ui-contracts.md#focus-based-tab-shortcuts).
- `Ctrl/Cmd+Shift+T` reopens tabs in the current root's agent panel, starting with the most recently closed. It preserves the name, runtime, working directory, agent set, tab order, and ACP conversation ID, and continues a saved conversation through the existing restoration flow if one exists. A TUI opens a new process with the same settings. This also works in empty panels, detached panels, conversation input, and the tab bar.
- Do not restore if there is no closed-tab history or during a modal, IME composition, or key repeat. Do not record entries when closing an active task is canceled in the confirmation dialog or when only the panel is hidden. Keep up to 50 entries in memory for the current screen, selecting recent entries separately from terminal history. Clear the history on refresh or root/account switching.
- If there are no agent tabs, start directly with the `+` selection screen.
- Mobile body swipes cycle through the focused agent group's conversation tabs and then its `+` runtime/agent set picker. Moving forward from the last conversation opens `+`, then wraps to the first conversation; moving backward from the first conversation opens `+`, then returns to the last conversation. This also works with a single conversation. Visiting `+` preserves existing sessions and creates no tab until a runtime or set is selected. Regular terminal groups continue cycling only through existing shell tabs.
- When selecting a runtime or agent set to open a new conversation, automatically focus the input in environments allowed by the shared `canAutoFocusInput()` check: screen width of at least 768px, hover support, and a fine pointer. Users can enter a draft immediately, even before the runtime connects. Do not automatically open the onscreen keyboard in touch-only environments, and do not apply this autofocus when restoring saved tabs or switching existing tabs.
- Restore existing tabs, and create a new tab only after a runtime or set is selected.
- When creating a new conversation from a runtime or agent set, check the default name against all open tabs in the same root. If it conflicts, append `-숫자` as in `Codex` → `Codex-1` → `Codex-2` and choose the first unused name. Include manually assigned names in duplicate detection. Reuse names freed by closing or renaming tabs, and do not rename existing or restored tabs. Keep the naming rules for regular shell tabs.
- In the `+` runtime list, open an installed item by clicking the item itself. On the right side of each row, show the install button, number-key number, and settings icon in that order. Omit the install button for installed items.
- The default runtime list order is Codex → Claude Agent → Kimi Code, followed by the remaining registered runtimes. When the picker has focus, use `1`–`9` to open installed runtimes in their visible order. Do not execute for uninstalled or installing items, the agent set view, input fields, modals, IME composition, repeated input, or input with modifier keys.
- Dragging the left handle of each row with a mouse or touch immediately changes the order and shows the same movement animation as tabs. Reordering also works with the up/down arrow keys when the handle has focus. Numbers follow the current order, which is saved in browser storage at `mew:agent-runtime-order`, scoped by account and instance. Ignore unknown IDs and duplicates, and add missing runtimes. If saving fails, the current picker remains usable.
- In Git's AI Commit, users can also select an existing set or create a new one for automatic commits by unit of work.

### Boundaries and limitations

- A set is a runtime/model/effort/role preset; it does not own the automated task ledger or feature classification rules.
- Create new tabs after cwd validation and user selection are complete.
- AI Commit runs a snapshot of the set as a separate task and does not send requests to existing conversations or tabs.

### Detailed contracts

- [Terminal and agent usage](../../../../docs/guides/terminal-agents.md)

<!-- mew:implementation:start -->
## Implementation details

- When closing completes, retain the tab snapshot, docking group, and order. Restoration inserts and activates the tab in its original group if that group still exists, or in the current group of the same type otherwise. Use a new host ID so that termination of the existing session and asynchronous cache deletion do not affect the restored tab.

- Double-clicking the title, icon, or tab padding in the shared `AgentTabBar` (double-tapping on mobile) edits that tab's name. F2 opens the same input, while double-clicking the close button or name input does not reopen editing. On desktop, double-clicking the panel drag handle maximizes or restores the panel.

- Right-clicking the shared `AgentTabBar` or pressing Shift+F10 opens a menu with Rename, Close Tab, and, on desktop, Maximize Tab/Restore Original Size. Maximizing selects the target tab and expands its panel; closing uses the existing session termination and confirmation flow. The maximize item is not shown on mobile. Menu appearance, positioning, and dismissal use `ActionMenu`, shared with the file explorer, and each item displays an Iconoir icon and translated text.

- `nextAgentTabLabel` checks current tab names for duplicates. After asynchronously checking the working directory, `AgentPanel` determines the new conversation name using the latest list in `setTabs`, rather than the old list from when the request started.
- `AgentPanel` requests autofocus only for tab IDs newly created through runtime/agent set selection and passes it to `MentionTextarea` in the active `AgentSessionView`. The input reuses the existing shared environment check. This is not a contract in which the browser directly reports whether a physical keyboard is connected.
- `RuntimePicker` provides click, Enter, and Space selection through a native button spanning the entire row, without a separate Use button. Install and settings buttons are independent sibling elements so their actions do not overlap with tab selection.
- Runtime selection uses the shared custom dropdown, and closing the list preserves the creation/editing form.
- Search for and select models using the shared `SelectField` in edit mode. Changing the runtime clears the model ID and fetches a new list; late responses from the previous runtime are ignored. Lookup failures provide a translated error and retry option while preserving existing values and direct input. An empty model uses the runtime default.

- Codex model candidates are grouped using the same shared splitting function as the panel, and only effort levels supported by the selected model are shown. If the existing effort level cannot be retained after a model change, select medium or the first candidate. Other runtimes pass ACP thought_level choices and setting IDs along with the model lookup and apply them before tab, scheduled, feature task, or AI Commit execution. Changing runtimes resets both the model and effort level.
- Provide agent set creation, editing, and selection, along with per-project tab and tab name management.
- AI Commit reuses the same picker and creation form and selects a new set immediately after saving it.
- For operation, follow [Using Git](../../../../docs/guides/projects.md#git-operations-panel).
- Creation and editing forms use the shared modal's focus and closing behavior and display save errors within the form.
- Prevent duplicate submissions while saving, and generate set IDs over plain HTTP as well.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-26: In isolated Chromium in `server/agent-new-tab-ui.test.ts`, verified the default order at 1100px and 390px in both themes, mouse/touch handle dragging and in-progress animation/reduced motion, arrow-key reordering, order restoration and number changes when reopening the picker, blocking uninstalled items/repeats/IME/modifier keys, and number-key selection after reordering. The existing `server/tab-reorder-ui.test.ts` also passed. No actual provider execution, build, or application to the server was performed.

- 2026-10-20: Verified 10 shared shortcut/focus unit tests and, in isolated Chromium in `server/agent-new-tab-ui.test.ts`, conversation input → Ctrl+2/1 → Ctrl+W closing and the active-task confirmation dialog on desktop and mobile in both themes. Focus remained on the agent without clicking the tab bar, and no editor close call occurred. Type, lint, and document checks also passed, including existing lint warnings. In the additional remote keyboard tests, 1 check for new-file creation after selecting a tool button failed identically on the pre-change HEAD. The changes were not applied to the actual server.

- 2026-10-14: In `server/agent-new-tab-ui.test.ts`, verified the Ctrl/Cmd+T agent picker, close cancellation, recency order, empty panels, and ACP conversation ID restoration on desktop and mobile in both themes. Also verified terminal creation from the tab bar and body and empty-panel restoration on desktop in both themes. A total of 8 tests, including shared shortcut and focus regressions, passed, along with frontend type, targeted lint, and documentation checks. PTY/ACP used test doubles; actual OS-reserved keys, runtime restoration, builds, and application to the server were not verified.

- 2026-10-07 reserved-key aliases: In `agent-new-tab-ui.test.ts`, sent Ctrl/Cmd+N, Ctrl+T, and the existing Alt+N to actual conversations and tab bars at 1100px and 390px in both themes, verifying agent picker ownership, file-creation fallback, reassignment, and modal/repeat/IME blocking. Also verified that Ctrl+N in the desktop regular shell tab bar and body created a terminal tab without falling through to file creation. These checks used keys delivered to the browser; actual OS-reserved key verification is separate.

- 2026-10-07: In `server/dock-maximize-ui.test.ts`, verified icons, renaming, maximizing/restoring, and tab closing in agent and terminal context menus; Shift+F10, arrow keys, and Esc; and omission of the maximize item and viewport boundaries on mobile. File explorer touch-menu regression checks in `server/sidebar-touch-ui.test.ts` also passed, along with type, targeted lint, and documentation checks.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that clicking an installed runtime row or pressing Enter or Space opens a tab, and that the install and settings buttons execute only their respective actions.
  - Verify separate Codex model/effort selection, restrictions to supported effort levels, re-editing after saving, and saving/applying effort levels for other runtimes.
  - Verify model name/ID search, keyboard/touch selection, the default model and direct input, runtime changes, and retries after lookup failures.
  - Verify that editing a set does not change snapshots of already accepted feature requests and that the desired settings apply only to new tabs.

- 2026-09-28: In isolated Chromium at 1100px in dark theme and 390px in light theme, verified model name/ID search, keyboard/click selection, the default model, resetting on runtime changes, input preservation during lookup failure/retry, and saving exact model IDs. Model lookup permissions, rejection of invalid runtimes, process termination and cache reuse after mock ACP list lookup, and type, translation, and document checks also passed. No list lookup using an actual provider account was performed.

- 2026-09-30: In isolated Chromium at 1100px in dark theme and 390px in light theme, verified separate Codex model/effort selection, changes to supported effort levels when changing models, saving and re-editing exact pairs, and saving Claude ACP effort levels. Added tests for set normalization and the order of model/effort application before scheduled execution. No actual provider account connection was performed.

- 2026-10-07: In isolated Chromium in `server/agent-new-tab-ui.test.ts` at 1100px and 390px in light and dark themes, verified new-tab shortcuts in conversation input, the tab bar, and the picker; reassignment; tab creation after runtime selection; modal/key-repeat/IME blocking; and file-creation fallback in the editor and file explorer. Existing tab-closing UI and nested shortcut surface tests, along with type, lint, and document checks, also passed, including existing lint warnings.

<!-- mew:validation:end -->
