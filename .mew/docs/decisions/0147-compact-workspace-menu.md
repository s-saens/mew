---
title: "0147 — Group the workspace menu and retire the Android gateway"
description: "Defines compact account/notification/tool/Mew menu groups, independent account settings, database workspace actions, and Alt+E/Alt+S shortcuts. Retires the optional Android emulator gateway while preserving Android browser support and historical records."
created: "2026-11-05"
updated: "2026-11-05"
status: "accepted"
---

## Context

The flat hamburger menu duplicates Dock and header actions, hides account identity inside Settings, and requires a separate notification trigger. The requested redesign groups related actions, exposes database access near document work, adds tool shortcuts, and removes the Android emulator feature. `Alt+E` previously advanced the focused panel's tab.

## Decision

Use User & Account, Notifications, Tools, and Mew groups with compact rows. A profile card opens a standalone account dialog; general Settings starts at Appearance. Show the unread count on the menu trigger, preview at most four notices, and retain the complete queue in View all. Shared `ActionMenu` retains keyboard navigation, focus restoration, dismissal, and viewport handling. Scoped workspace styles preserve the existing project/command menu sizing.

Expose databases as a Dock dialog action, a floating action inside the explorer file area, and a floating editor action beside the agent button. A database Dock action leaves Remote Desktop before opening the modal and does not enter panel-swipe navigation.

Assign `Alt+E` to Server File Explorer and `Alt+S` to Scheduled Tasks, gated by the same permissions as menu actions. Move the next-panel-tab alias to `Alt+Shift+E`; standard browser-style tab aliases and `Alt+Q` remain. Remote keyboard capture keeps precedence. Show the existing `Ctrl+U` update shortcut in the menu. Move chat access to the permission-gated Dock so touch users retain a direct entry after its menu item is removed.

Remove the Android emulator panel, capabilities, environment setup/actions API, gateway proxy, demo surfaces, and restoration state. Retain Android mobile-browser support, unrelated host platform handling, and historical sources. This supersedes the Android feature decisions in [historical ADR 0058](../history/decisions/0058-mew-android-panel-optional-gateway.md) and [historical ADR 0067](../history/decisions/0067-mew-android-guided-tmux-actions.md).

## Alternatives and rationale

Keeping one flat list or a separate notification button preserves duplication and loses the requested hierarchy. Reusing general Settings for account details preserves unnecessary navigation. Hiding only the Android menu item leaves an unsupported callable feature. Keeping `Alt+E` for tab navigation would conflict with the requested explorer shortcut. The selected changes keep common actions near their work area and bound menu height without reducing readable text or usable targets.

## Consequences

Saved Android panel/layout values are ignored and do not reopen the removed feature; retired API routes are unavailable. Existing notification storage and channel preferences remain compatible. Database order/visibility participates in existing Dock preferences while remaining a dialog action. Users of the previous next-tab alias must use `Alt+Shift+E` or an existing standard alias.

Current behavior belongs to the [workspace menu](../development/ui-overlays.md#header-hamburger-menu), [notifications](../development/ui-recovery-feedback.md#header-notifications), [account settings](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md), and [database](../features/document-databases/document-databases-and-catalog.md) contracts. Actual verification and remaining limits are recorded in the [work record](../work/compact-workspace-menu.md).
