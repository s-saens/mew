---
title: "Real-time account tabs"
description: "Defines authoritative account-and-project editor, agent, and terminal tabs across devices, single-use fresh editor-tab preparation during project switching, live presence signals, migration, concurrent saves, draft protection, and recovery. Separates shared tab metadata from account-wide desktop editor slots, preferred slot focus, and panel geometry on each browser device."
created: "2026-11-04"
updated: "2026-11-05"
---

Open editor, agent, and terminal tabs and active selection belong to the authenticated account and logical project on one Mew instance. Changes propagate through the existing presence connection. Different accounts and projects keep independent lists. Dock positions, panel sizes, visibility, mobile foreground, and popup geometry retain their [device-local ownership](ui-workspace-layout.md#workspace-panel-layout). See [ADR 0133](../decisions/0133-realtime-account-tabs.md).

On desktop, that device's layout and last focused panel belong to the account across projects under [ADR 0134](../decisions/0134-account-desktop-layout.md). Selecting another project replaces its content inside the existing desktop arrangement. It does not reuse the outgoing project's open files, active document, agent tabs, or terminal tabs. Mobile retains project-specific layout and foreground restoration.

## Editor tabs

`GET /api/user-ui/editor-tabs?workspace=<logical project path>` returns `{state, revision}`. `state` is a map from editor API scope to its `StoredTabs`, or `null` before initialization. Stored metadata contains paths, preview and view modes, pane membership, pane layout, active paths, and focused pane. It contains no document bodies, drafts, or permission grants. External filesystem and transient Git tabs remain local.

During explicit project selection, `useAccountEditorTabs.prepare(path, signal)` starts the authoritative GET alongside the workspace POST. Only the matching account and logical project consume that preparation, once. Preparation does not activate the project or fetch file bodies; root-relative file and tree requests still wait for server confirmation. A return to a project starts a fresh query rather than restoring an older authoritative tab snapshot. Subsequent synchronization reads and post-save reconciliation remain fresh.

Abort or replacement cancels unused preparation. Account changes, a different activated project, permission changes, matching editor-tab signals, and recovery events discard it before consumption. A signal received while the controller consumes a preparation requests a fresh read before applying its result. Scope disposal aborts its consumed preparation without canceling a newly prepared destination. Failed preparation falls back to the normal activation read; an active read failure retains the existing recovery behavior.

Saved pane metadata describes the project's tabs; it does not replace the current desktop slot geometry on a project switch. Align incoming panes with the account's device-local editor slots while preserving that project's tabs and active selections, including when saved pane IDs differ. Preserve the tab/content scope and file-read boundaries during alignment. Device-local panel focus names a work surface, such as editor or terminal; it is separate from the shared active document or execution tab.

The account's desktop chrome also remembers its last focused editor slot as `focusedEditorPaneId`. Desktop hydration prefers that valid slot over the incoming project's mapped focus while retaining the destination panes' active paths. `focusedPaneId` remains in project tab metadata for compatibility and mobile restoration. If the preferred desktop slot no longer exists, use the incoming mapped focus or the first slot. This restores selection without taking DOM focus.

`PUT /api/user-ui/editor-tabs` accepts `{workspacePath, project, state, initialize?}` and returns the full map and revision. The server derives the account from authentication, validates path/object/size limits, and updates only the requested scope. Revisions increase per workspace. Concurrent saves to the same editor scope use the last accepted snapshot; saves to sibling scopes preserve one another.

The separate `editorTabs` ledger in `user-ui-state.json` prevents stale whole-workspace layout writes from restoring old tabs. The first read freezes legacy server `workspaceUi.tabs` into that ledger. A browser cache can initialize a missing scope only after a successful authoritative read. `initialize: true` preserves a scope already saved by another device, including an explicitly empty tab list. Device-layout restoration ignores legacy `tabs` fields.

The client serializes saves and coalesces queued changes. Pending local edits take precedence over older reads and acknowledgements until saved; a trailing read reconciles newer server changes. Older revisions and responses for a disposed account or project cannot replace the current screen. Applying remote metadata preserves loaded bodies, save baselines, tab identity, and navigation history for retained files. Newly active files use the existing permission-checked loading path. A remote removal waits for dirty or saving documents to finish autosaving; a save failure retains the local tab and draft rather than removing it.

## Agent and terminal tabs

The existing `/api/user-ui/agent-tabs` ledger shares both types, names, order, runtime, session pointers, and active selection. A save may include `base`, its last accepted account snapshot. The server applies only changes since that base by tab ID, including individual session-pointer slots. Concurrent additions and unrelated field changes survive. A stale edit cannot resurrect a tab already closed on another device. Legacy clients without `base` retain full-snapshot behavior.

Clients serialize saves, rebase pending local changes over returned state, and suppress remote echo writes. Remote updates retain mounted sessions for surviving IDs and update selection in the device's existing dock group. Closing a shared tab retains the existing session termination contract; merely receiving state or hiding a panel does not terminate its retained sessions. Runtime and transcript ownership remains in [agent sessions](agent-sessions.md) and [conversation storage](conversation-storage.md).

## Delivery and recovery

Successful writes send content-free `{type: 'editor-tabs' | 'agent-tabs', workspacePath}` signals only to presence connections authenticated as the same account. Clients re-read the matching ledger rather than trusting tab payloads from the socket. Reconnection, online recovery, foreground return, and bfcache restoration also re-read state. Read failures do not initialize empty local state over the server. Save failures retain pending state for retry while the controller remains mounted. Scope disposal ignores late results; it does not guarantee transmission of queued unsaved edits after leaving that scope.

The demo implements the editor API in its visitor-local memory store. It does not synchronize different visitors. Automated verification and remaining runtime limits are recorded in the [work record](../work/realtime-account-tabs.md).
