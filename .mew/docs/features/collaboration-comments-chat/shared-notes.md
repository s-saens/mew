---
id: "mew-shared-memo"
parent: "mew-collaboration"
title: "Shared memo"
status: "changed"
created: "2026-09-26"
updated: "2026-10-28"
files: ["src/components/shared-memo.tsx", "src/hooks/use-shared-memo.ts", "src/components/DockWorkspace.tsx", "src/components/mobile-dock.tsx", "src/App.tsx", "server/shared-memo.ts", "server/collab.ts"]
commits: []
description: "A feature contract covering real-time editing and Hotview/Plain views of a server-wide shared Markdown memo across projects. Explains the DockPanel shared with tasks, including popup/panel switching, movement across the entire workspace, 50% opacity and disabled blur when focus is outside, mobile behavior, shortcuts, participants, and preservation of unsent changes."
상위파일:
  - "MOC.md"
  - "_collaboration-comments-chat.md"
---

## Requirements

- On desktop, use the icon in the memo title bar to switch between popup and panel while preserving content, the collaboration session, and browser-saved display mode. Remove the display selection option from screen settings. On mobile, display it as a shared panel without a switch button. When settings are opened over a popup, the settings window and its internal dropdowns appear in front.
- In popup mode, drag the non-button area of the title bar containing the Close button to move it, without a separate top drag handle. It can also be moved with arrow keys after focusing the memo tab in the title bar. The view toggle, popup/panel toggle, and Close button do not initiate movement; body editing and bottom-right resizing remain available. The docking drag grip appears only in panel mode.
- The popup can be moved and resized across the entire workspace, including the document explorer, file explorer, and side dock. It remains unclipped and operable beyond the left edge of the central docking area, and saved positions are restored within the same bounds.
- When focus leaves the popup, reduce its overall opacity, including text, buttons, and background, to 50% and disable background blur on the popup and its internal elements. Clicking it again or moving keyboard focus inside restores the previous opacity and the theme's blur. Pressing the title bar to move it also displays its active appearance. This does not apply to panel mode or mobile.

- Collaboratively edit a single server-wide shared Markdown memo in real time.
- Open the docked panel using the memo icon in the desktop or mobile dock, following existing dock reordering and permission display behavior.
- Provide a 36px title bar matching the feature and Git panels, a memo icon, participant color dots, a Close button, a Hotview/Markdown source (Plain) view toggle, and an input field. Do not display a character count.
- Keep the space above the first line of the body at 16px on both desktop and mobile, and remove extra top spacing for the first heading or list.
- On desktop, move the panel using the shared DockGrip, resize it using split boundaries, and maximize or restore it by double-clicking the title tab. Save the layout and open state in the per-project account UI ledger.
- On mobile, follow the shared foreground panel stack, dock switching, and Esc/Back paths.
- Do not automatically focus the body when opening the panel, switching docks, completing the collaboration connection, or switching views. Open the mobile keyboard when the user directly taps the body to edit.
- `Ctrl/Cmd+M` opens the memo if closed, brings it to the front and focuses the body if focus is outside, and closes it if focus is inside.
- Closing the panel preserves the collaboration document and unsent changes and removes the user from the participant display. The same server-wide shared memo is used across project switches.
- Show mobile modifier keys only while the software keyboard is open, and turn off the Ctrl and Shift toggles when the keyboard closes.

### Detailed contracts

- [Usage](../../../../docs/guides/collaboration.md#shared-memo) · [Implementation, storage, and permissions](../../development/collaboration.md#shared-memo)
## Implementation details

- The shared `DockPanel` and `overlay-layers.css` own popup movement by title, hiding the docking grip, entire workspace bounds, and inactive opacity and blur without memo-specific branches. Follow the [shared UI contract](../../development/ui-contracts.md).

- Memo opening and dock focus signals focus the non-editable panel root. Connection completion and Hotview/Plain switching do not request editor focus. Explicit keyboard shortcuts that navigate to an already open memo retain body focus.

- Retain Hotview, Yjs, PresenceDots, the server-reserved room, and the atomically saved file. Login and collaboration permissions are required.
- App-owned `useSharedMemo` maintains the collaboration session, focus, and shortcuts outside the per-project DockWorkspace, while SharedMemo renders the docking header and body.
- On 2026-10-01, at the user's request, the task panel and API were removed and the memo popup was replaced with a panel. Existing task storage files are preserved, and the feature must not be reintroduced without a separate request. [Removed task history](../../history/project-tasks.md).
- On 2026-10-03, at the user's request, a new [task panel](../projects-files-search/task-panel-list-calendar-and-gantt.md) is provided separately from the memo. The memo has no task switch button.
- Dock behavior, docking, mobile foreground state, Esc/Back, and layout restoration were integrated into the shared panel path. Existing popup movement, 8-direction resizing, and viewport position correction were removed.

## Verification

- 2026-10-03: Isolated desktop and mobile Chromium verified that the editor does not receive focus on initial opening, connection completion, switching to Plain, or reopening, and verified direct-click editing and focus through explicit shortcuts that navigate to an open memo. Collaborative editing and docking regression UI tests, type checking, targeted lint, UI checks, and documentation link checks passed. Actual mobile OS keyboards are unverified, and no build or server restart was performed.

- 2026-10-03: Passed UI checks for Hotview/Plain switching, source/rendered collaborative editing across two browsers, reopening the source view, and focus. Full type checking, changed-code lint, and documentation link checks passed, and desktop dark and mobile light headers were reviewed.

- 2026-10-01: Passed 23 checks for the memo panel, collaborative editing/storage/permissions, dock, docking, and mobile stack, along with full type checking. Verified memo remounting after project switching, desktop docking movement, boundary resizing, maximize/restore, mobile screens, and keyboard modifier keys.

- `server/shared-memo.test.ts`: Concurrent edit merging, deletion, persistence, save failures, corruption preservation, and authentication/permission boundaries.
- `server/shared-memo-ui.test.ts`: Hotview collaborative editing across two browsers, focus, participants, shared docking movement/resizing/maximization, project remounting, keyboard, mobile, closing, and reconnection.
- 2026-09-27: Fixed a server type-checking error in the UI tests and passed `npx tsc -b` and the corresponding Chromium tests.
- 2026-09-28: Passed Chromium UI tests including 8-direction resizing, app type checking, changed-code lint, and documentation boundary/link checks. Full type checking did not pass due to a TS2349 error in `server/git-panel-ui.test.ts:262` outside the scope of the changes.
- 2026-09-29: Reverified the existing resizing implementation, passed Chromium UI tests, full type checking (`npx tsc -b`), and changed-code lint, and reviewed desktop dark and mobile light screens.
- The existing popup position and 8-direction resizing verification records reflect results as of the dates above and are not the current panel's behavior contract.
- Verify the actual deployed screen after the user builds and restarts.

- `server/shared-memo-ui.test.ts`: Checks modifier key display in the initial state without a keyboard, closing the keyboard while retaining focus, reopening it, Ctrl/Shift reset, and environments where only the visual viewport shrinks or the window height also shrinks.
