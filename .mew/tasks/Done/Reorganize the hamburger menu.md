---
title: "Reorganize the hamburger menu"
description: "Completed grouped workspace menu with compact notification
  previews, independent account settings, database actions, tool shortcuts, and
  Android emulator removal. Links implementation and verification records."
done: "true"
tags:
  - 기능
date: "2026-11-01"
startDate: "2026-11-01"
assignees:
  - songsh5775@gmail.com
---

## Requested behavior

- Remove the Android emulator feature, redundant Commit entry, and system resources entry from the hamburger menu. Keep system resources in the top bar.
- Open databases from the Dock, a floating button at the upper right inside the explorer file area, and a floating editor button immediately left of the agent action.
- Add Server File Explorer (`Alt+E`) and Scheduled Tasks (`Alt+S`) shortcuts. Display the existing update shortcut (`Ctrl+U`).
- Order menu groups as User & Account, Notifications, Tools, and Mew. Keep item heights compact and polish the visual hierarchy.
- Combine the avatar, name, and email in one profile card opening independent account settings. Show account management only to administrators.
- Move the unread count onto the hamburger trigger, preview up to four short notices, and provide View all for the complete list.
- List Remote Desktop, Remote Browser, Server File Explorer, and Scheduled Tasks under Tools; Updates, Mewlink, and Settings under Mew.

## Completion

Implemented on 2026-11-05. Chat remains directly accessible through the Dock. The former next-tab `Alt+E` alias moves to `Alt+Shift+E` to avoid the new explorer shortcut. Local verification and remaining check limitations are recorded in the [work record](../../docs/work/compact-workspace-menu.md); current menu behavior belongs to the [UI contract](../../docs/development/ui-overlays.md#header-hamburger-menu).
