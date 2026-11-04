---
title: "Real-time account tabs"
description: "Defines authoritative account editor, agent, and terminal tabs across devices, live presence signals, migration, concurrent saves, draft protection, and recovery. Separates shared tab selection from device-local panel geometry."
created: "2026-11-04"
updated: "2026-11-04"
---

Open editor, agent, and terminal tabs and active selection belong to the authenticated account and logical project on one Mew instance. Changes propagate through the existing presence connection. Different accounts and projects keep independent lists. Dock positions, panel sizes, visibility, mobile foreground, and popup geometry retain their [device-local ownership](ui-workspace-layout.md#workspace-panel-layout). See [ADR 0133](../decisions/0133-realtime-account-tabs.md).

## Editor tabs

`GET /api/user-ui/editor-tabs?workspace=<logical project path>` returns `{state, revision}`. `state` is a map from editor API scope to its `StoredTabs`, or `null` before initialization. Stored metadata contains paths, preview and view modes, pane membership, pane layout, active paths, and focused pane. It contains no document bodies, drafts, or permission grants. External filesystem and transient Git tabs remain local.

`PUT /api/user-ui/editor-tabs` accepts `{workspacePath, project, state, initialize?}` and returns the full map and revision. The server derives the account from authentication, validates path/object/size limits, and updates only the requested scope. Revisions increase per workspace. Concurrent saves to the same editor scope use the last accepted snapshot; saves to sibling scopes preserve one another.

The separate `editorTabs` ledger in `user-ui-state.json` prevents stale whole-workspace layout writes from restoring old tabs. The first read freezes legacy server `workspaceUi.tabs` into that ledger. A browser cache can initialize a missing scope only after a successful authoritative read. `initialize: true` preserves a scope already saved by another device, including an explicitly empty tab list. Device-layout restoration ignores legacy `tabs` fields.

The client serializes saves and coalesces queued changes. Pending local edits take precedence over older reads and acknowledgements until saved; a trailing read reconciles newer server changes. Older revisions and responses for a disposed account or project cannot replace the current screen. Applying remote metadata preserves loaded bodies, save baselines, tab identity, and navigation history for retained files. Newly active files use the existing permission-checked loading path. A remote removal waits for dirty or saving documents to finish autosaving; a save failure retains the local tab and draft rather than removing it.

## Agent and terminal tabs

The existing `/api/user-ui/agent-tabs` ledger shares both types, names, order, runtime, session pointers, and active selection. A save may include `base`, its last accepted account snapshot. The server applies only changes since that base by tab ID, including individual session-pointer slots. Concurrent additions and unrelated field changes survive. A stale edit cannot resurrect a tab already closed on another device. Legacy clients without `base` retain full-snapshot behavior.

Clients serialize saves, rebase pending local changes over returned state, and suppress remote echo writes. Remote updates retain mounted sessions for surviving IDs and update selection in the device's existing dock group. Closing a shared tab retains the existing session termination contract; merely receiving state or hiding a panel does not terminate its retained sessions. Runtime and transcript ownership remains in [agent sessions](agent-sessions.md) and [conversation storage](conversation-storage.md).

## Delivery and recovery

Successful writes send content-free `{type: 'editor-tabs' | 'agent-tabs', workspacePath}` signals only to presence connections authenticated as the same account. Clients re-read the matching ledger rather than trusting tab payloads from the socket. Reconnection, online recovery, foreground return, and bfcache restoration also re-read state. Read failures do not initialize empty local state over the server. Save failures retain pending state for retry while the controller remains mounted. Scope disposal ignores late results; it does not guarantee transmission of queued unsaved edits after leaving that scope.

The demo implements the editor API in its visitor-local memory store. It does not synchronize different visitors. Automated verification and remaining runtime limits are recorded in the [work record](../work/realtime-account-tabs.md).
