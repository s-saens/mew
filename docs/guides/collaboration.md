---
title: "Collaborative Editing, Comments, Chat, and Guest Sharing"
description: "Covers preparing accounts and file permissions for collaboration; adding comments with Ctrl+Shift+C or the body context menu; threads, lists, and retaining drafts on failure; collaborative editing; shared notes; active sessions and history; chat; and DMs. Includes revocable public file/folder links and distinguishes them from guest path permissions."
updated: "2026-10-30"
상위파일:
  - "../../.mew/docs/MOC.md"
  - "MOC.md"
---
This guide explains user actions for collaborative editing, comments, chat, and sharing. Review [Security and Roles](../operations/security.md) before inviting others.

[Collaborative Editing](#collaborative-editing-and-participants) · [Shared Notes](#shared-memo) · [Active Sessions](#active-mew-sessions) · [Comments](#comments-and-replies) · [Chat](#group-chat-and-dms) · [Public Links](#public-file-and-folder-links) · [Guest Sharing](#guest-sharing)

## Before Working Together

1. The owner registers each participant's email and role under **Menu → Account Management** and provides a temporary password. Each participant logs in to the same Mew server with their own account and changes their password.
2. The owner checks the account's **Feature Permissions** and **File and Folder Permissions**. Editing requires file modification permission; collaborative editing and comments also require their respective feature permissions.
3. Open the same file in the same project and check participant color dots and cursors to confirm the connection. For access from outside the server, first set up [external access](getting-started-ko.md#connect-remotely).

To let others only view files, you can use [Guest Sharing](#guest-sharing) below. Collaborative editing and chat require a logged-in account.

## Collaborative Editing and Participants

When logged-in users open the same file in the same project, they edit its contents together in real time. Collaborate on Markdown in Hotview and other text files in Plain. Color dots in the document and file explorers show who is working, and the editor displays other users' cursors.

Even if you open files in multiple panes, only the file in the last editor pane you clicked is reported to others as the file you are viewing. Markdown changes made on disk by a terminal or agent are also reflected in open collaborative documents. Real-time collaborative editing is not available to guests or for files outside projects in the server file explorer. Synchronization details follow the [collaboration contract](../../.mew/docs/development/collaboration.md).

## Shared memo

Open the **Notes Panel** using the **Notes** icon in the left dock on desktop or bottom dock on mobile, or with `Ctrl+M` or `Cmd+M`. The icon appears by default when you are logged in and have collaboration permission; you can hide or show it under **Settings → Dock**. On desktop, clicking the dock icon again closes notes if they have focus, or switches to notes if another panel has focus. On mobile, it brings notes to the front, and your content remains when you switch to another dock item. If notes are already open and focus is outside them, the shortcut moves focus to the notes body; if focus is inside notes, it closes them. You can change the key combination in shortcut settings.

Opening notes or changing the view mode does not automatically focus the input. On mobile, tap the body directly to open the keyboard. A Markdown input appears below the title, participant color dots, and close button. Use the eye (Hotview) and code brackets (Plain) buttons to the right of the title to switch between rendered view and source editing. The selected view persists when closing and reopening notes and when switching projects. On desktop, move the panel with the docking handle to the left of the title and resize it by dragging its boundary with another panel. Double-click the title tab to maximize it, and press Esc to restore it. Panel layout and open state are saved per project, but note contents are shared across the entire server. Separate popup repositioning and edge resizing are not provided. On mobile, notes use the same screen as other work panels and close with Esc, Back, or the close button. Closing the software keyboard also hides the mobile auxiliary keys.

Notes are a single shared space for logged-in users on the same Mew server. They support real-time collaborative editing regardless of project or root project changes and are saved automatically on the server, persisting after everyone closes them or the server restarts. Color dots beside the title indicate the number of users who currently have notes open; multiple windows for the same account count as one. Notes are not available to accounts without collaboration permission or to guests. While connecting, a status is shown and editing is temporarily blocked. Even if you close the panel, unsent changes within the current page are merged on reconnection.

## Active mew Sessions

After logging in, click the **Active Sessions button** on the right side of the header to open the list of connected sessions. The button shows the total session count inside a square icon. For each user, you can see their browser and device, the project and file they are viewing, and their connection time. The tab you are using is labeled **Current Session**, and tabs behind other screens are labeled **Background**.

The number in the header and the total in the dialog count sessions per browser tab or window. If one person opens two tabs, the count is 2; it also includes other devices using your account and guest connections. At 100 or more, the icon displays **99+**, and the tooltip shows the actual count.

The list updates automatically as sessions connect and disconnect. If no list is available yet or the connection is lost, the header shows 1 and the open dialog shows a connecting status. If the list received from the server is empty, it shows 0. This button and list are not exposed to guests.

**N Agents Working** below each session is the number of working agent tabs connected in that browser's current project. Idle tabs and regular terminals are excluded; CLI commands running in agent tabs count as work. The count updates immediately when work status changes and is reported again every 30 seconds. Values from older clients or values not updated for more than 90 seconds appear as `—` on the next list update.

If the same agent is viewed in multiple browsers, it may appear in each session, so do not add the counts together. This is not the total number of tasks that continue running on the server independently of browser connections. The previous JS memory display, measurement, and transmission were removed in response to the request to show work status. Do not reintroduce them unless the user requests it.

### Connection History by Date

In the same window's **History** tab, select a date and narrow the range with **Person**, **Start**, and **End**. Click a bar in the hourly graph to select only that hour, and use **Full Day** to reset it. Dates and times use your browser's time zone shown on the screen. Connections that cross midnight are also shown as segments within the selected date.

The top shows connection count, people count, and total observed time, with a per-person device timeline below. Purple indicates an active screen and gray indicates background activity. Expand **Detailed History** to see times, projects/files, and observed agent counts. Observed time comes from per-tab connection records, so simultaneous connections by the same person overlap. The hourly graph shows the number of tabs that connected during that hour, not working hours or peak concurrent connections. Today's history updates every 30 seconds, and you can fetch it immediately with **Refresh**.

**Download Excel** saves the selected date, person, and time range as `.xlsx`. Excel timestamps use UTC, as indicated in the column names. Project and file locations you do not have permission to access are hidden both on screen and in Excel. Records are stored in the server DB from the time the feature is applied and persist after server restarts. Past connections that were not collected are not reconstructed. The timeline draws up to 100 tabs per person, but the detailed list and download include all segments in the query range. If a query exceeds 50,000 segments, narrow the time or person filter.

## Comments and Replies

1. Select the passage you want to comment on in the document and press `Ctrl+Shift+C` (`Cmd+Shift+C` on macOS). On mobile, select the passage and tap the comment icon in the keyboard auxiliary bar. This shortcut does not open the composer if no text is selected.
2. Write in the input below the quoted passage and send with the submit icon or Enter. Shift+Enter inserts a line break, and `@` lets you select a member. If mention suggestions are open, Enter selects a suggestion first.
3. Click a highlight in the body or select a thread from the editor's **Comment List**. Send replies using the input below the thread. The list also includes comments whose highlights can no longer be found because the source text changed.
4. You can edit and delete your own comments, and the owner can also manage other people's comments.

If you choose **Add Comment** from the body context menu without a selection, the corresponding Hotview paragraph or Plain/code line is selected automatically. See the [body context menu](editor.md#body-context-menu).

If sending a new comment, reply, or edit fails, the error and entered content remain so you can send it again. The number above the comment list is the thread count for the current file. Close the popup with the close icon, Esc, or Back.

Comments are managed separately rather than inserted as text in the body. They are available for Markdown in Hotview and Plain, and for code and text, and require login and collaboration feature permission. Viewing the list requires file viewing permission; adding, editing, and deleting also require file modification permission. Comments on read-only or archived files can only be viewed. Comments cannot be started by guests, on media, diffs, files outside projects, or anchor previews, or while a file is being revalidated. You can change the default comment shortcut in [Settings](../configuration/appearance.md).

## Group Chat and DMs

Open chat through Header Menu → **Chat** or `Alt+C`. In the conversation list, select the group room to talk with all members, or select a person for a 1:1 conversation. The unread conversation count and the number of recipients who have not read each message are displayed.

If you insert a file reference in the input and send it, recipients can click the reference to open it in the mew editor. After opening chat, press `Ctrl+L` in the editor to insert a file mention into the input according to the [reference forwarding rules](editor.md#ctrll-references-경로줄). If you opened another auxiliary panel most recently, that panel may receive the reference.

Chat is only available to logged-in users with chat permission. The app delivers DMs only to the participants, but they are stored in server files, so they are not secret conversations hidden from the server administrator. Storage and read-status handling follow the [chat contract](../../.mew/docs/development/collaboration.md); permission policies follow [Security](../operations/security.md).

## Public file and folder links

1. As an owner or manager, right-click a file or folder in the explorer and choose **Publish**. On touch screens, long-press the item.
2. Choose **Public viewing** or **Allow editing**. Copy the displayed link and send it to visitors. Anyone with the link can use that selected access level without an account.
3. To stop access, reopen **Publish** and choose **Not public**. The old link stops working. Publishing again creates a different link.

An eye on the right of an explorer item indicates a viewing link; a pencil indicates an editing link. File links open only the document editor or media view. Folder links include an explorer limited to the published folder. Editing saves changes automatically; a save conflict keeps your draft so a newer version is not overwritten. Creation, deletion, renaming, comments, databases, and real-time collaboration are unavailable through these links.

A file link does not publish sibling images or attachments. To include local resources, publish a folder that contains both the document and those resources. Secret files, server data, symbolic links, and paths outside the published folder remain unavailable.

Links work at the localhost or custom-domain address used to copy them, subject to that address being reachable by the visitor. Through Mewlink, the link uses the public device address. The host must remain online, and both the host app and central Mewlink launcher must have the sharing update applied. See the [connection contract](../../.mew/docs/development/remote-access.md#public-file-and-folder-links) for application and verification boundaries.

## Guest Sharing

Visitors who are not logged in are guests. The owner selects a path under **Account Management → File and Folder Permissions** and sets Inherit, Block, View, or Modify in the guest row. Modify includes View. After configuring permissions, share the mew access URL so visitors can browse allowed paths.

This permission is a **path rule that applies to all visitors who are not logged in**, rather than an invitation issued only to a specific recipient. Allowing a folder also applies to its subpaths, and more specific path rules take precedence. To stop sharing, remove the rule and check for separate allowances on child items.

Guests can only view allowed files and edit their body contents; they cannot create, delete, rename, or use terminals, agents, DB, or collaborative editing. [Guest Boundaries](../operations/security.md#guest-boundaries) is the canonical source for blocked paths, secret files, and known exceptions.

Collaborative editing and comments check both the relevant feature permission and the target file permissions. The active sessions popup also hides project and file paths that the viewing account cannot access. Feature defaults and per-account changes follow [Permission Settings](../configuration/accounts.md#my-account-and-account-management).
