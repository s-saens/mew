---
id: "mew-agents-terminal"
parent: "mew-agents"
title: "tmux shell terminal"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-27"
status_hash: "b19a2771f0bfb2f727bc14539350c69b524d222b67a2322b322f359fefd6a804"
files: ["src/components/AgentPanel.tsx", "src/components/TermButtonBar.tsx", "src/components/CommandButtonMenu.tsx", "server/termButtons.ts", "server/command-ports.ts", "packages/tmux-term/src/TmuxTerminal.tsx", "packages/tmux-term/src/server/tmuxWs.ts"]
commits: []
description: "Covers creation, input, reconnection, and termination of per-project shell tabs; command buttons and automatic detection of listening ports opened by executed commands; wide, compact preview menus; focus-dependent new tabs, closed-tab restoration, renaming, context menus, and panel maximization/restoration. Defines Linux/macOS tmux and Windows psmux/PowerShell behavior, transparent backgrounds, shared input areas, accessible names, and actual verification boundaries."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Open a shell for project work and maintain its connection.

### Scope

- The terminal's default background is transparent, allowing the panel background to show through. Text, cursors, the ANSI palette, and the selection-mode screen follow mew's light and dark themes.

- Provides regular shell tab creation, reconnection, input, session termination, and terminal command buttons.
- Detects localhost TCP listening ports opened by project commands and opens the app from the same command row.
- Unifies the input area's background, input field, and send button design with the agent panel.

### Boundaries and limitations

- Regular shells and official agent TUIs belong to different panels.
- Closing a panel differs from terminating a session; execution uses the server's OS permissions.

### Detailed contracts

- [Terminal and agent usage](../../../../docs/guides/terminal-agents.md) · [Commands and scheduled tasks](../../../../docs/guides/commands.md)

<!-- mew:implementation:start -->
## Implementation details

- Linux/macOS uses the existing tmux, while native Windows uses psmux and PowerShell. The backend owns the executables and argv for creation, commands, attach, input, capture, and clipboard control, while retaining the existing tmux API and session IDs. Namespaces per Windows state path separate them from user sessions. Implementation, Windows CI, and public support gates follow the [OS execution contract](../../development/windows-native.md).

- The command menu is wider to show more of each name, with smaller text, spacing, and control widths. Port numbers are distinguished by small containers with themed backgrounds and borders, laid out within 90% of the screen width. Specific dimensions follow the [shared UI contract](../../development/ui-contracts.md#dropdowns-and-selection-components).

- The project command menu displays the running session's `ports` as numbered buttons to the left of the stop and terminal icons. Multiple ports are listed in ascending order, and only that area scrolls horizontally. Shared tooltips and accessible names in four languages are provided, and the existing left/right arrow keys also reach the port buttons. Clicking opens only a new tab and does not invoke execution, stopping, or the terminal popup.
- `GET/PUT /api/cmd-buttons` associates actual listening ports of the pane PID and descendant processes only with running buttons. If port preview permission is unavailable or detection fails, it returns `ports: []` while preserving the command list and execution status. Polling every 3 seconds while the menu is open reflects ports opening and closing. Existing command operations remain available even when older servers omit `ports`. OS-specific detection, URLs, and preview boundaries follow the [port preview contract](../../development/port-preview.md#command-button-port-detection).

- `Ctrl/Cmd+N/T` and `Alt+N` use the same new-terminal flow as the group's `+` through focus registration for the regular shell tab bar and body. The shared `TmuxTerminalPanel` opens the same name input. The keys are not sent to the PTY or used to create a new file, and key repeats, IME input, and modals do not trigger creation. Browser-reserved key conditions, tab closing, and cycling follow the [Shared Keyboard Shortcut Contract](../../development/ui-contracts.md#focus-based-tab-shortcuts).

- `Ctrl/Cmd+Shift+T` reopens tabs in the current root's terminal panel, starting with the most recently closed. It preserves tab names, working directories, and order, and starts terminated shells as new sessions. It does nothing if there is no closed-tab history. Actions that only hide the panel are not recorded, and the history is cleared on refresh or root/account changes. Up to 50 closed agent and terminal tabs combined are kept in memory, with the most recent entry selected by panel type.

- Double-clicking the title, icon, or tab padding in the shared `AgentTabBar` (double-tapping on mobile) edits that tab's name. F2 opens the same input, while double-clicking the close button or name input does not reopen editing. On desktop, double-clicking the panel drag handle maximizes or restores the panel.

- Right-clicking the shared `AgentTabBar` or pressing Shift+F10 opens a menu with Rename, Close Tab, and, on desktop, Maximize Tab/Restore Original Size. Maximizing selects the target tab and expands its panel; closing uses the existing session termination and confirmation flow. The maximize item is not shown on mobile. Menu appearance, positioning, and dismissal use `ActionMenu`, shared with the file explorer, and each item displays an Iconoir icon and translated text.

- Connection and reconnection status and terminal opening failures appear as small, translucent floating notifications at the top of the body. They do not shift the command button bar or resize the body.

- xterm enables `allowTransparency` and sets the default background to fully transparent (`#00000000`). The body container and padding also have no background color, and `terminal.css` removes the xterm viewport's default black background. Text snapshots in selection mode retain the existing theme background for readability and to obscure the output beneath them. Initial text and cursor colors read app tokens, and root theme changes update only the colors of existing terminals. Light mode uses an ANSI palette for light backgrounds. Global tmux settings and explicit RGB/256-color settings in programs running inside it are not changed.

- Like the agent composer, the input area exposes the panel background and uses a top divider, 8px padding, and an 8px gap between the input and send button. The input uses a borderless `surface` background, slightly rounded corners, 14px text, 8px horizontal and 6px vertical padding, and retains a monospace font for shell commands. The send button is a 32px upward-arrow button in the same accent color. The command input has an accessible name and retains its single-line initial height, automatic expansion up to 160px, drafts, history, and Ctrl/Cmd+Enter submission.

- The mobile auxiliary keys were placed above the text input, and Home, End, and Ctrl+C were added so that 11 keys fill the horizontal width in a single row.
- The auxiliary key bar grows to fit its buttons, padding, and borders, preventing vertical scrolling and clipped buttons.
- Existing drafts, focus, keyboard locking, and arrow-key history navigation are preserved.
- Detailed contracts and verification follow [Shared Packages](../../development/packages.md).

- Provides regular shell tab creation, reconnection, input, session termination, and terminal command buttons.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-27: Verified IPv4/IPv6, multiple listening ports, termination, and isolation from other sessions for actual Linux descendant processes; permissions and retrieval failures for command list GET/PUT; and port button placement, keyboard operation, horizontal scrolling, new-tab URLs, and prevention of command reruns at 1100/390px in both themes. The checks performed and OS and production application limitations are recorded in the [work record](../../work/command-port-previews.md).

- 2026-10-26: Added the missing shared translation key for the command input's default accessible name, resolving the type error.

- 2026-10-26: Matched the input area's background and spacing to the agent composer. Auxiliary key, draft, and focus regression checks in `server/terminal-keybar-ui.test.ts` at 320/390/767px in both themes passed, along with TypeScript and documentation checks. Targeted linting left only 1 existing ref access warning. Isolated screenshots were reviewed; the app was not built and the changes were not applied to the server.

- 2026-10-20: In `server/terminal-keybar-ui.test.ts`, verified transparent backgrounds for xterm, the viewport, scroll area, and body padding at 320/390/767px after light/dark theme switches, along with auxiliary key input and preservation of drafts and focus. In `server/dockWorkspaceUi.test.ts`, checked regressions for solid-color split boundaries, resizing, and tab movement. TypeScript, lint, and documentation checks passed, with existing lint warnings remaining. Actual tmux program output, builds, and application to the server were not verified.

- 2026-10-14: In `server/agent-new-tab-ui.test.ts`, verified the Ctrl/Cmd+T agent picker, close cancellation, recency order, empty panels, and ACP conversation ID restoration on desktop and mobile in both themes. Also verified terminal creation from the tab bar and body and empty-panel restoration on desktop in both themes. A total of 8 tests, including shared shortcut and focus regressions, passed, along with frontend type, targeted lint, and documentation checks. PTY/ACP used test doubles; actual OS-reserved keys, runtime restoration, builds, and application to the server were not verified.

- 2026-10-07: In `agent-new-tab-ui.test.ts`, sent Ctrl+N with focus on the tab bar and body of an actual regular shell group and verified that a terminal tab was added without falling back to file creation. The PTY was replaced with test input; actual OS key interception was not checked.

- 2026-10-07: In `server/dock-maximize-ui.test.ts`, verified icons, renaming, maximizing/restoring, and tab closing in agent and terminal context menus; Shift+F10, arrow keys, and Esc; and omission of the maximize item and viewport boundaries on mobile. File explorer touch-menu regression checks in `server/sidebar-touch-ui.test.ts` also passed, along with type, targeted lint, and documentation checks.

- 2026-10-06: 2 connection and command UI regression checks passed, along with type, targeted lint, documentation boundary, and link checks. For shared notifications, verified the translucent background, maximum width and height, scrolling of long errors, and body clicks outside notifications in isolated Chromium at 1100/390px in both themes. No build or server restart was performed.

- Verify that terminals first opened in light mode and selection mode appear light, and that switching between light and dark immediately updates colors while preserving sessions, input, and scrollback.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the shell persists when the connection is reopened and that command buttons send input only to the current tab.

<!-- mew:validation:end -->
