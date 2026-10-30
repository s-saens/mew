---
id: "mew-settings-layout-mobile"
parent: "mew-settings"
title: "Panel Layout, Mobile, and State Restoration"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "018bca32e486b43c386b29de3e2087d6d1447fae6a33abc99d745367947a9382"
files: ["src/components/tool-presentation-toggle.tsx", "src/components/SettingsModal.tsx", "src/hooks/use-refresh-tasks.ts", "src/hooks/usePresence.ts", "src/components/project-loading-overlay.tsx", "src/App.tsx", "src/components/DockWorkspace.tsx", "src/components/EditorPane.tsx", "src/components/TabBar.tsx", "src/components/AgentPanel.tsx", "src/components/mobile-dock.tsx", "src/components/layout-presets.tsx", "src/utils/layout-presets.ts", "server/layout-icon-cli.ts", "src/utils/mobile-dock.ts", "src/hooks/use-mobile-keyboard.ts", "src/hooks/use-mobile-panel-swipe.ts", "src/hooks/useTabs.ts", "server/userUiState.ts"]
commits: []
description: "Feature contract covering automatic scrolling to active and focused tabs in all horizontal tab bars, chevron buttons with theme-background-colored shadows in directions with remaining scroll space, constant-speed movement while held, normal wheel scrolling, returning to the most recently active tab when closing an editor tab, per-tab document navigation, maximizing panels by double-clicking their handles, renaming agent and terminal tabs by double-clicking, hiding and restoring surrounding panels and the side dock while maximized, and docking and splitting work panels. Explains panel switching through the independently positioned desktop and mobile docks, content-area tab switching that preserves internal horizontal scrolling, the Plain modifier key bar, panel visit history, layout presets shared by the header and account settings, per-device layout storage, loading and focus on session return, the restored task panel, and migration of removed browser storage nodes."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- Restore the task panel to the dock, docking layouts, mobile foreground, per-account layouts, and layout presets. Restore saved task groups, tab assignments, and open states; for saved layouts without tasks, add the panel next to its default neighbor when opened. Retain the DB Gantt; their data storage is independent. Follow [0052](../../decisions/0052-restore-task-panel.md).
- Switch notes and tasks between desktop popup and panel modes using the icon button in each tab header, and remove the selection from appearance settings. Preserve the mode, coordinates, and content, and switch each tool independently. On mobile, hide the button and display the panel.
- Display settings in the topmost app layer above popups, other work windows, and Mewcat. Language and font dropdowns within settings must remain usable, and Esc must close their lists first. Verification covers high popup layers, desktop and mobile, preservation of reading and input content, and restoration after refresh.

- Display the top bar containing the project selector at 44px on desktop and 36px on mobile. Use borderless square buttons sized 32px on desktop and 28px on mobile for fullscreen, active sessions, notifications, the hamburger menu, layout, and resources. Standard icons are 16px; layout and resource previews follow separate sizes. All buttons share the same neutral colors, hover behavior, and accent focus rules. Button spacing and detailed dimensions follow the [Shared UI Contract](../../development/ui-contracts.md), and the work area directly below follows the header height.
- Display buttons on the right side of desktop and mobile headers in the order Fullscreen → Notifications → Hamburger Menu, and remove the fullscreen item from the menu. Retain existing display conditions, toggles, and shortcuts. Hamburger and layout buttons display icons only, with translated accessible names and tooltips. The active sessions button displays the total session count inside a square outline the same size as the fullscreen icon. Aggregation and the dialog follow [Participants and Active Sessions](../collaboration-comments-chat/participants-and-active-sessions.md).

- When switching mobile panels, retain up to 20 previous panels, including the editor, and restore them in reverse order with Back.

- Arrange document and tool panels to suit the screen size and workflow.
- On desktops without a saved layout, start with the editor above the terminal and Git above agents on the right. Place task tabs in the rightmost column.
- Swiping left or right on the dock moves to the previous or next panel in display order. In mobile panel content, it moves to the previous or next tab; for regular files and Markdown Plain, only swipes starting on the modifier key bar switch tabs.

### Scope

- In editor panes with no open files, display only the Open File Explorer, Search Documents, and Search Document Files shortcuts vertically.

- On mobile, opening dropdowns, windows, or search panels must not automatically focus input fields and bring up the keyboard.

- Provide document tabs, splitting, docking, resizing, per-account restoration, and a mobile dock with configurable edge placement, fullscreen, and Back navigation.
- Preserve the same tab list, editor panes, and docking layout when switching between Documents and regular files.
- When the active editor tab closes, open the remaining tab most recently used in the same editor pane. Manage same-tab navigation through internal document links using per-tab document visit history.
- All horizontal tab bars scroll smoothly to reveal the target tab when opening a new tab, selecting one with a shortcut, or moving focus within tabs. Keep the position if the tab is already visible, and scroll instantly when reduced motion is enabled.
- At each end with remaining scroll space, overlay a chevron button with a shadow colored by the selected theme background (`--color-surface-deep`) on the tabs, preserving its opacity and geometry in solid and gradient themes. Scroll at 320px per second while held, stop immediately on release, and hide the button upon reaching that end. Normal wheel input also scrolls horizontally without Shift.
- Provide a Close (X) button on the right side of the desktop editor tab bar, matching other panels.
- Use the dock and top menu to operate panels on desktop and mobile. The general browser menu item and dock icon have been removed. Use the relevant task's screen to log in, and open localhost apps through `/포트번호` in the address. Keep the desktop file explorer fixed on the left, with a button centered on its right boundary to collapse and expand it. Provide move and resize handles for note and task popups.
- On desktop, double-clicking a shared panel move handle maximizes its content; double-clicking again restores the original layout.
- Do not cover project or panel tab bars or the dock; Esc also restores the layout.

### Boundaries and limitations

- The browser panel supports only left and right placement.
- Distinguish closing a panel from terminating a work session, and retain ownership boundaries between per-device settings and per-account screen state.

### Detailed contracts

- [Editor Panes and Mobile](../../../../docs/guides/editor.md) · [Panel and Overlay Contract](../../development/ui-contracts.md)

- Mobile Back handles popups, screens within panels, panel visit history, and remaining foreground panels first, and navigates to the browser's previous page only when the internal stack is empty.

<!-- mew:implementation:start -->
## Implementation details

- `ToolPresentationToggle` toggles the existing saved presentation mode from note and task headers. `SettingsModal` uses the topmost layer of the body portal, and language and font selection lists also appear inside the settings portal. Follows the [UI Contract](../../development/ui-contracts.md#settings-window-layer).

- The default docking tree is defined by `defaultDockTree` in `src/utils/dock-layout.ts`. Space for hidden panels collapses in the visible area, and panels mounted later are added next to their designated neighbors through `addDockGroup`. Existing saved layouts, splits within editor panes, and mobile foreground display are preserved. Ratios and restoration priorities follow the [Work Panel Layout Contract](../../development/ui-contracts.md#workspace-panel-layout).
- 2026-10-06 default layout validation: Passed 12 docking unit tests, actual Chromium checks in `dockWorkspaceUi.test.ts` for default positions, dragging, boundary resizing, closing, reopening, and restoration, plus type checking, targeted lint, and documentation allowlist checks. `dock-maximize-ui.test.ts` failed because it could not find the Git commit title input; the same failure was confirmed in `DockWorkspace` before the change. Workspace link checks failed because 3 task documents outside this work were not registered in a MOC. No build or server restart was run.

- Adjust visibility and order in **Settings → Dock**. This shares state with existing dock reordering, and hidden items are also excluded from swipe navigation. Preserve order and visibility settings for items hidden by permissions, as well as open work panels. Details follow [Dock Settings](../../../../docs/configuration/appearance.md#dock-settings).

- Empty editor panes use `useShortcutBindings` to display the three shortcuts from the current settings. The previous document selection, new file, and autosave guidance was removed at the user's request and must not be reintroduced without an explicit follow-up request. Detailed behavior follows [Editing Guidance](../../../../docs/guides/editor.md#basic-editing).

- Shared overlays reinstall the History guard for the remaining stack each time they handle Back. This also protects cases where registration remains unchanged because only the foreground panel changes, and does not record panels closed through Back as new visits.

- Track switching history separately from the foreground order of open panels. Reselecting the same panel is not recorded, and restoration through Back does not add history. History is kept only in app memory and resets when the account or root project changes.

- Display Remote Desktop in the desktop and mobile hamburger menus and exclude it from the Dock. Do not display the removed browser or Remote Desktop in the dock even if they remain in the saved order.

- During drag reordering, surrounding items move to their new positions using the shared 180ms movement animation. The grabbed item follows the pointer immediately; consecutive reordering and reduced motion settings follow the [shared motion contract](../../development/ui-contracts.md#drag-reordering-motion).

- Input autofocus uses the shared `canAutoFocusInput()` condition. On mobile, shared dialogs focus the window itself instead of an input field. Detailed criteria follow [Mobile Input Focus](../../development/ui-contracts.md#mobile-input-focus).

- Documents does not switch to a separate editing screen. It uses the current root's shared tab state so that `DockPanel` registration and panel positions do not reset based on file type.

- Remove work panels available in the dock from desktop and mobile hamburger menus to reduce duplicate entry points. Retain permission conditions for the dock, shortcuts, and remaining menu items.

- The mobile selector for switching between multiple editor panes uses the shared custom dropdown and preserves existing pane and document state.

- Provide document tabs, splitting, docking, resizing, per-account restoration, and a mobile dock with configurable edge placement, fullscreen, and Back navigation.

- Closing the active editor tab prioritizes the most recently active tab in the same editor pane over the visually adjacent tab. For example, with tabs 1, 2, and 3 open, opening an internal document from 1 in a new tab 4 and then closing 4 returns to 1. Closing an inactive tab preserves the current active tab. Per-tab document Back and Forward navigation and detailed state contracts follow [Editor Tab Visits and Document Navigation](../../development/ui-contracts.md#editor-tab-visits-and-document-navigation).

- Horizontal tab bars use the shared `TabScrollArea` and internal `useTabAutoScroll` to reveal active and focused tabs and display scroll arrows in directions with remaining scroll space. This applies to editor, agent, terminal, existing project, sheet, DB, task, account, and session tabs, and visibility is checked after restoration, resizing, and layout changes. Automatic revealing is suppressed during dragging. Arrow display and movement distance, selection indicators, and scroll and focus boundaries follow [Active Tab Auto-Scrolling](../../development/ui-contracts.md#active-tab-auto-scrolling).

- When dragging document, agent, terminal, or browser tabs, the grabbed tab follows the pointer and its original position appears as an empty space.
- The preview remains visible outside the horizontal scroll area, while reordering, edge auto-scrolling, and splitting into or merging with other panes remain available.

- Panel move handles appear only on desktop.
- For panels without actual tabs, display the same icon as the dock and a translated title in the tab bar. This includes when the agent selector is open; hide the title once an actual tab exists. The Git panel retains its existing fixed-title display.
- When agents, terminals, or browsers have no actual tabs, hide `+` and display the agent selector, a Start New Terminal button, or the browser start screen in the content area, respectively. Show `+` again after the first tab is created.
- Note and task panels also support position, width, and height adjustments in the shared docking area and restore layouts per account and project. Their title bars are 36px tall, matching other panels.
- 2026-10-03: At the user's request, the [Text Input–Focused Task Panel](../projects-files-search/task-panel-list-calendar-and-gantt.md) was registered again in the dock, docking layout, and mobile stack. It is an object list separate from notes and does not use the old hierarchical task storage files.
- 2026-10-01: Removed the task panel and replaced the note popup with a shared panel. Exclude old task dock and layout entries during normalization. Notes participate in the mobile foreground stack, Esc/Back handling, and desktop maximization/restoration. Detailed storage and collaboration state follow [Shared Notes](../collaboration-comments-chat/shared-notes.md).
- On mobile, remove the top handles and their spacing from the editor, agent, terminal, browser, Git, note, and task panels.

- On desktop, double-clicking a panel's move handle maximizes that panel; double-clicking the same handle again or pressing Esc restores it. Maximization is a temporary display state and does not change the saved split layout. Git, notes, and tasks use the same shared handle.
- Double-clicking an agent or terminal tab's title, icon, or blank space opens name editing; F2 and right-click Rename remain available. Document tabs retain their existing preview-pinning behavior and do not maximize the panel.
- Expand the selected panel's tab bar and content together across the work area, including the file explorer area, and hide and disable interaction with other panels' tab bars and content and floating note and task popups.
- The selected tab bar spans the full width at the top of the work area, while the project header remains. During maximization, hide the side dock, document/file explorer, file explorer toggle, chat, and Android panel, preventing visibility and pointer and keyboard interaction. On restoration, restore their previous open states, layouts, and input content unchanged.
- Maximizing, restoring, and switching targets do not remount sessions.
- Detailed exit conditions and mobile boundaries follow [Work Panel Layout](../../development/ui-contracts.md#workspace-panel-layout).

- Place the workspace dock at the top, bottom, left, or right below the header, independently for desktop and mobile through Settings → Dock. Defaults remain left on desktop and bottom on mobile. Reserve space at the chosen edge, keep the dock available when the file explorer collapses, and retain the remote viewer toolbar layout. Left/right docks use vertical dragging and Alt+Up/Down; top/bottom docks use horizontal dragging and Alt+Left/Right.
- Display dock icon hover tooltips toward the work area for top/bottom docks and ensure they are not obscured in the remote viewer.
- Clicking an icon opens a closed panel; if the panel is open but unfocused, move focus to it without closing it. Preserve other panels.
- Lightly highlight open panels, and use a stronger highlight for the single work panel that currently has focus.
- Close a panel and remove its highlight only when its focused icon is clicked again.
- When moving to another open panel, preserve focus on the last input element and any draft in progress.
- Update immediately when an open panel's content or tab is clicked, or when focus moves to it through the keyboard.
- Hide and redisplay the editor while preserving its tabs, content, and split layout.
- The editor's close (X) button uses the same action as hiding the editor from the dock and appears even when no tabs are open.
- Remove the free-movement handle and position storage, and ignore previously saved positions. Do not reintroduce a floating layout until the user requests it.
- On both desktop and mobile, pressing and holding an icon makes it follow the mouse or finger to reorder it.
- A placeholder shows the insertion position. Releasing saves the order; Esc or touch cancellation restores the original order.

- Provide a rectangular mobile dock spanning the selected workspace edge, with safe-area insets.
- Icons open panels or bring them to the front. Tapping the same icon again does not close the panel.
- Horizontal mobile docks are 48px high; bottom placement adds the bottom safe-area inset. Vertical mobile docks are 48px wide plus the corresponding side safe-area inset, with 44px-high buttons.
- Use a divider toward the content and the selected icon's brightness and weight for distinction, without rounded outlines or icon backgrounds.
- The default order is file explorer, editor, agent panel, terminal, Git, memo, and tasks, with visibility based on permissions.
- Press and hold to reorder; the browser remembers the order.
- Tasks displays List, Calendar, and Gantt as title bar tabs. Swiping the content on mobile cycles through them, wrapping at either end. Row deletion, horizontal Gantt scrolling, and schedule dragging retain their existing gestures.
- Dock swipes move to adjacent panels in the visible dock order, starting from the frontmost panel on mobile or the focused panel on desktop. Left-to-right moves to the previous panel; right-to-left moves to the next, stopping at either end. Each panel's selected tab is preserved.
- On mobile, swiping the content of the file explorer, editor, agent, terminal, Git, or tasks moves to the current panel's previous or next tab, wrapping at either end. Panels with one or no tabs remain unchanged. Tab strips, popups, and separate drag areas retain their existing controls.
- Touches starting in areas with actual horizontal scrolling, such as tables or code, prioritize internal scrolling and do not switch tabs even at either scroll boundary. Containers without overflow and vertical-only scroll areas retain content swipe tab switching. Detection boundaries and the Plain modifier key bar exception follow the [mobile dock contract](../../development/ui-contracts.md#mobile-dock-and-panel-switching).
- Editor content swipes are allowed in Markdown Hotview. Regular files and Markdown Plain retain horizontal content scrolling and switch tabs only from the modifier key bar. Plain's modifier key bar is available on mobile regardless of keyboard visibility.
- The dock also appears in the remote desktop viewer and is hidden in fullscreen mode.
- Selecting another panel from the dock ends the remote connection and switches panels. Closing the viewer returns to the previous workspace screen.
- The 2026-10-27 [decision to separate dock and content swipes](../../decisions/0079-mobile-panel-swipes.md) replaced the dock's tab-first behavior from 2026-10-03. Gesture thresholds, cancellation, and input preservation follow the [mobile dock contract](../../development/ui-contracts.md#mobile-dock-and-panel-switching).
- Mouse hover shows a tooltip with the icon name. A touch tap shows a name toast beside the selected dock edge, which disappears after 0.5 seconds.
- When the mobile keyboard opens, hide both the dock and its reserved edge space. Maintain keyboard detection while zoomed in and account for fullscreen changes and viewport scrolling.
- Desktop and mobile floating handles and the left-side file explorer button have been replaced by the dock and top menu. Do not reintroduce them until the user requests it.
- 2026-10-05: At the user's request to remove duplicate entry points, deleted the remaining desktop handle component, position/pinning storage logic, directional gestures, dedicated translations, and tests. Editor and file explorer names, also used in the dock, remain as shared panel translations.
- Detailed gesture, layout, and storage contracts follow the linked development documents.

- During initial app restoration, return from the background, and refresh after presence reconnection, show only a loading indicator centered over the existing screen.
- Do not dim the screen or block clicks, touches, or keyboard input. The indicator disappears when all registered restoration queries have succeeded or failed.
- Do not show it for ordinary file changes or autosaves.
- Follow the [session restoration and return contract](../../development/ui-contracts.md#full-screen-loading-during-session-restoration-and-return).

### Desktop Layout Presets

- At widths of 768px or more, display a **Layout** button to the left of the hamburger menu. Do not display it on mobile. It becomes available after panel and document tab restoration finishes. The header preview shows the currently applied layout and updates after preset selection or manual layout changes.
- On first opening, provide **Default**, **Preset 1**, **Preset 2**, and **+**. Default uses mew's default docking layout (editor above/terminal below, Git above/agent below, tasks at the far right). Preset 1 focuses on documents, and Preset 2 uses an editor/terminal arrangement. If permission restrictions produce identical layouts, use different editor pane splits to avoid duplicate initial presets.
- Clicking a preset applies its layout. **+** saves the current layout as a preset with the next number. Duplicate layouts are not allowed when creating or modifying presets; if a duplicate is found, retain the existing value and report the result.
- Right-clicking a preset or pressing `Shift+F10`/the Menu key opens a menu with **Rename**, **mew built-in default**, **Set to current state**, and **Delete preset**. Setting the default or current state replaces only the selected preset. Rename by entering and saving a name inline in the list, with a maximum of 60 characters and leading/trailing whitespace removed. An empty name reverts to Default or the preset number label. Names do not affect layout duplicate detection and are retained when the layout is replaced. Enter saves; Cancel or Esc closes only the name input and returns focus to that preset. The preset's own identical layout is allowed, but duplicates of other presets are blocked. The Default entry can also be modified or deleted. Do not renumber after deletion.
- Operate the menu with the arrow keys, Home/End, and Enter. Esc first closes the context menu and returns focus to the preset; pressing it again closes the list and returns focus to the Layout button. Keep the list and menu within screen boundaries, and scroll within the list when there are many additional presets.
- Save the docking tree, split ratios, editor pane configuration, panel visibility, file explorer/Android widths, memo/tasks tab or popup display modes, and popup positions and sizes. Do not copy file contents, running sessions, or active tabs into presets. Applying a preset preserves current documents and unsaved content and gathers documents from removed editor panes into the first pane. Running sessions are not terminated; current tab assignments are connected to surviving panels of the same type. Clear temporary maximization.
- Duplicate detection collapses hidden docking branches, then compares panel types, normalized rectangle coordinates/sizes (in 1/1000 units), visibility, visible side panel widths, and open popup positions and sizes. It excludes internal group IDs, active tabs, and hidden panel widths, and treats different tree structures that produce the same screen layout as duplicates.
- Presets are remembered under the browser key `mew:layout-presets:<계정>`, with the account identifier URI-encoded. The same account uses the same list and names across projects, and changes in other tabs of the same browser are reflected. Lists are separate across accounts and browsers, with no server synchronization. Existing contracts for storage keys for each project's actual workspace layout, open files, and running sessions remain in effect. When first reading the account-wide list, merge existing per-project keys for the same account, prioritizing the current project. Import duplicate layouts only once, and resolve ID and number collisions with new values. Preserve existing keys, and do not import again if an account-wide list already exists, so deleted presets do not reappear. If only existing empty arrays are present, carry over the empty state as well. Normalize invalid stored values and exclude duplicate entries. Preserve an empty array as the state in which the user has deleted all presets. If saving fails, retain the presets in the current session and report the result.

#### Layout SVG generation

`layoutIconRects` in `src/utils/layout-presets.ts` scales down the header, left dock, side panels, nested splits, and popups within a 64×48 viewBox. Hidden panels are not drawn, and split ratios and popup positions and sizes are reflected. React `LayoutIcon` and `layoutIconSvg` use the same rectangle calculations, so previews update automatically immediately after adding a preset, setting it to the current state, or setting it to the default. The header button, preset list, and output SVG all use `currentColor` fills without outlines, with a gap of 2 viewBox units between adjoining panels and rounded corners with a radius of 2. Fill opacity is 60% for regular panels, the header, and the dock, 90% for the editor, and 100% for overlaid popups.

The standalone script reads version 1 `LayoutSnapshot` JSON from standard input and writes SVG to standard output. For saved preset objects, the `layout` value is the input.

```bash
node server/layout-icon-cli.ts < layout-snapshot.json > layout.svg
```

Input includes `version`, `dock` (existing DockState), `open` (a boolean per panel), `sidebarWidth`, `androidWidth`, `tools` (tab or popup for memo/tasks), and `popups` (x/y/width/height). The generator validates and constrains numbers and does not insert arbitrary input strings into the SVG. Invalid JSON or input without a version or dock exits with an error and produces no output SVG.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Verify that the target tab becomes visible when tabs extend beyond the horizontal area and a new tab is opened, an earlier tab is selected with Ctrl+number, or focus moves into a tab. Already visible tabs, vertical position, outer scrolling, and input focus must be preserved. Also check restoration, resizing, layout switching, dragging, and reduced motion settings.
- For a horizontally overflowing tab bar, check directional arrow visibility at the left end, middle, and right end, along with overlap over tabs, no background, no border, and shadows. Movement must continue at a constant speed while pressed and stop on release, preserving the active tab and input focus. Check horizontal movement with the regular wheel and preservation of Ctrl+wheel zoom. Also check scrolling, resizing, tab addition, deletion, renaming, reduced motion settings, keyboard, touch, and dragging.

- 2026-10-22: Passed 3 isolated Chromium checks across `dock-maximize-ui.test.ts`, `dockWorkspaceUi.test.ts`, and `shared-memo-ui.test.ts`. Verified tab renaming, Esc cancellation, panel handle maximize/restore (including Git and memo), preservation of layout, drafts, and mounts in both desktop themes, and mobile renaming and handle hiding. Type, lint, and documentation checks also passed (including existing lint warnings). `task-panel-ui.test.ts` could not find the initial new-task input, and the same failure was confirmed with HEAD's tests and `DockWorkspace`. No build or server application was performed.

- Previous profile display verification (2026-10-19): Passed 1 test each in `active-sessions-ui.test.ts`, `network-usage-ui.test.ts`, and `layout-presets-ui.test.ts`, plus TypeScript, lint (existing warnings), and documentation checks. At that time, unified header captures at 1100px in dark mode and 390px in light mode confirmed shared button sizes, colors, borderless display, and My Profile. The detailed verification scope follows the [shared UI contract](../../development/ui-contracts.md). No build or server restart was performed.

- 2026-10-06: Checked empty editor panes in isolated Chromium at 1100px and 320px, verifying that the three shortcuts were displayed and vertically aligned, with no horizontal overflow or runtime errors. Type, targeted lint, documentation boundary/link, and diff checks passed. The existing `editor-pane-ui.test.ts` failed on a legacy cache cleanup assertion before the screen check. No build or server restart was performed.

- In `server/overlay-history-ui.test.ts`, use actual mobile Chromium History to verify that navigation leaves for the previous page only after handling popups, Git screen visits, and remaining panels in sequence.

- 2026-10-05: Type checking, lint (no errors, existing warnings), documentation allowlist/link checks, and UI static checks passed. 5 tests across `overlay-layer-ui.test.ts`, `mobile-dock-ui.test.ts`, and `mobile-dock.test.ts` passed. 2 language unit tests also passed. The full App test failed at `Select extra.md`, and the language-switching UI test failed because it could not find the agent input. Failures at the same points were confirmed on HEAD before the changes.

- Verify that desktop and mobile have no floating handles and that existing tasks can still be performed through the dock, top menu, tab bar, and shortcuts.

- 2026-10-04: Used `task-schedule-ui.test.ts` to verify that actual bidirectional touch swipes on the dock switched the tasks title bar's List, Calendar, and Gantt tabs, wrapping at the ends while retaining the panel. Existing dock and tasks UI regression tests, type checks, targeted lint, and documentation link checks also passed.

- 2026-10-03: Passed 21 unit tests for panel dismissal, the mobile stack, and shared overlays. Automatically verified repeat visits, return to the editor, the 20-entry limit, reselecting the same panel, and reset on project changes. Back navigation on physical mobile devices requires separate verification.

- Check repeated panel switching, return to the editor, the 20-entry limit, and closing modals first.

- 2026-10-03: Updated detection to distinguish focus/pinch zoom from keyboard height changes. Passed 2 checks in isolated Chromium covering dock hiding/restoration while zoomed, fullscreenchange/scroll events, and existing mobile agent long-input/position restoration checks, along with type checks and targeted lint. Actual mobile OS fullscreen and keyboard animations are unverified.

- 2026-10-03: Passed checks for opening the new tasks panel from the actual App's desktop/mobile dock, closing with Esc, reopening, preventing mobile autofocus, dock/docking normalization, and mobile stack regressions. Detailed verification follows [tasks features](../projects-files-search/task-panel-list-calendar-and-gantt.md#verification).

- 2026-10-03: Passed 4 tests across `workspace-switch-ui.test.ts` and `mobile-dock.test.ts`, plus type checking. Verified editor tab switching and preservation of the frontmost panel through bidirectional touch swipes on the actual App's mobile dock. Targeted lint reported no errors and 3 existing i18n Fast Refresh warnings.

- Verify that bidirectional dock swipes open adjacent panels while preserving selected tabs, and that bidirectional swipes on mobile content and the Plain modifier key bar select tabs in the current panel. Automated checks and the scope unverified on physical devices follow the [work record](../../work/mobile-panel-swipes.md).
- Check bidirectional movement in nested horizontal scrolling areas in tables and code, and suppression of tab switching at both ends. Also check tab switching in areas without overflow and vertical scrolling areas, along with existing tab switching on the Plain modifier key bar.

- 2026-09-30: Related drag UI regression checks verified reordering animations and existing input and cancel behavior. The scope and limitations follow [shared motion verification](../../development/ui-contracts.md#drag-reordering-motion).

- On mobile, verify that opening model selection, file/content search, or input dialogs does not automatically open the keyboard, and that tapping an input allows typing. Also check desktop autofocus and dialog Tab/Esc behavior.

- Verify that hiding the desktop editor panel with X and reopening it from the dock preserves tabs, content, and split layout. Provide X even on an empty tab bar, and do not show it on mobile.

- Verify that the editor, agent, terminal, and browser show an icon and translated title when they have no tabs, and that the title disappears or returns when a tab is created or the last tab is closed. Also check hiding `+` and showing the start screen in empty panels, restoring `+` after the first tab is created, mobile behavior, and language changes.

- 2026-09-29: In `unified-editor-ui.test.ts`, verified that after moving a panel containing Documents with its handle, opening a regular file preserved the tab list and panel position, and refreshing restored the same layout.

- Verify all four Dock positions independently for desktop and mobile, default left/bottom placement, content boundaries, tooltip placement, the 768px breakpoint, remote viewer, fullscreen transitions, and axis-aware icon reordering.

- On desktop, verify that selecting an open, unfocused panel by clicking or pressing Enter moves focus to it, and that it closes only when selected again.
- Use the linked development contract's isolated Chromium tests to check dock selection, swiping, reordering, cancellation, saved-state restoration, hiding for the keyboard, both themes, all four edges on desktop and mobile, position persistence and reset, tooltip placement, ignoring legacy floating coordinates, and window-shrink boundaries.
- For panel double-click maximize/restore, use `dock-maximize-ui.test.ts` to check panel types with tabs, Esc restoration/popup-first closing, full width of the selected tab bar, hiding other tab bars and blocking their keyboard interaction, hiding/restoring surrounding panels and the side dock, vertical splits, draft/mount preservation, and mobile transitions.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Closing all files displays the three shortcuts vertically without instructional text, and shortcut remapping and language changes reflect the current settings.
  - Verify that tabs and running tasks are correctly preserved after desktop splitting, switching to mobile, closing, and reopening.

- Use `server/workspace-switch-ui.test.ts` to verify initial and cached restoration, visibility/bfcache return and reconnection, dismissal after parallel queries and errors, and desktop/mobile display.

- 2026-09-25: In isolated Chromium running the actual App, verified background intensity for open and focused panels in both themes, closing by click and clearing the background in both states, and mobile selection indicators without backgrounds. Existing checks for dock touch, swiping, reordering, and movement also passed.

- 2026-09-25: When maximizing tabs, verified the selected tab bar's full width, hiding other tab bars and blocking their keyboard interaction, double-click/Esc restoration, and preservation of drafts, mounts, and split layout in both themes. `dock-maximize-ui.test.ts`, `dockWorkspaceUi.test.ts`, `workspace-switch-ui.test.ts`, and type, lint, and documentation checks passed.

- 2026-09-29: In `server/workspace-switch-ui.test.ts`, verified that selecting an open, unfocused panel by click or Enter keeps it open, keyboard focus moves to the file explorer, feature input focus and drafts are restored, reselecting a focused panel closes it, and reselecting on mobile keeps it open.

- 2026-09-29: After fixing the layout in the header, verified tooltips below icons, ignoring saved positions, reordering, mobile transitions, and dock access while maximized in `mobile-dock-ui.test.ts`, `workspace-switch-ui.test.ts`, and `dock-maximize-ui.test.ts`. The mobile video transmission scenarios in `remote-desktop-ui.test.ts` and the desktop toolbar and tooltips in the direct scenario also passed. Type, targeted lint, documentation boundary, and link checks passed.

- 2026-10-06: Moved the desktop dock to a vertical bar to the left of the file explorer. Checked mobile behavior, vertical dragging, and Alt+Up/Down reordering in dock-specific Chromium tests, left-side placement and collapse-button boundaries in the actual App, and TypeScript, targeted lint (existing warnings), and documentation checks. The full `workspace-switch-ui.test.ts` fails at the mobile `Select extra.md` step, just as the App did before the changes, and `dock-maximize-ui.test.ts` stopped because it could not find the Git commit title field. No build or server restart was performed.

- 2026-10-06: Checked layout preset addition, duplicate blocking, replacement with the current layout/default, deletion, browser restoration, project separation, keyboard menus, hiding on mobile, and SVGs in both themes using isolated Chromium. Also verified switching, addition, file explorer restoration, document preservation, and exclusion of mobile controls in the actual App. Checked preservation of open documents and edits while merging editor panes, recreation of saved editor panes, matching SVG CLI output, and rejection of invalid input. No build or server restart was performed.

<!-- mew:validation:end -->

### Device-specific layouts and memo/tasks popups (2026-10-06)

Storage ownership follows [ADR 0197](../../history/decisions/0197-mew-device-local-workspace-layout.md).

On desktop, icons in the memo and tasks headers toggle each between tab and popup display. Popups can be moved and resized over documents, and switching modes preserves the same component and input state. Mobile uses the existing frontmost panel regardless of the selection.

Docking positions, split ratios, document tabs, and panel open/closed states are saved per browser device under account/root-project keys. Account restoration values serve as initial values on devices with no local records. Popup sizes, positions, and display settings are also saved in the browser and do not overwrite those on other devices. Clearing browser storage also resets that device's remembered state.

Validation (2026-10-06): Ran related server and isolated Chromium tests, TypeScript, and targeted lint. No actual update installation, build, or server restart was performed.

- 2026-10-07 account-wide preset verification: Use unit and isolated Chromium UI tests to check merging existing project lists, handling duplicates/ID collisions, preserving empty lists, account isolation, and name saving, cancellation, restart, and sharing across project switches.
