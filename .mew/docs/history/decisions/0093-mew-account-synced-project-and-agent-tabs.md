---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0093 — Project and agent tab state belongs to the account"
created: 2026-08-27
updated: 2026-10-07
description: "Decision to store project and agent tab lists in the account ledger and restore them on devices. Follow-up ADR 0200 defines active root switch notifications."
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0200](0200-mew-account-active-workspace.md) — Separate the active root, request paths, and switch notifications by account
- Follow-up decision: [0177](0177-mew-project-owned-icons.md) — Move icons to project files; retain per-account tab lists and groups
- Follow-up decision: [0094](0094-mew-account-synced-workspace-ui-state.md) — The scope of keeping document tabs, sidebar state, and scroll positions local to each device
- Partially supersedes: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — The scope of browser-local storage for open root project tabs
- Partially supersedes: [0087](0087-mew-agent-tabs-per-root-project.md) — The scope of browser-local storage for agent tabs and the active tab
- Partially supersedes: [0046](0046-mew-agent-panel-tabs-one-session-per-tab.md) — The scope of browser-only storage for the agent tab list and names
- Decision maker: Song Sanghoon (directive)

## Background

Root project tabs and their icons, agent tabs, and ACP session pointers existed only in the browser's `localStorage`. As a result, signing
in with the same account on mobile, in an incognito window, or on another device lost the open projects, icons, and
agent work context. This is inconsistent with tmux sessions, which are owned by the server and visible from any browser.

## Options

1. Keep browser-local state — simple to implement, but the account's work context differs across devices.
2. Move all UI state to account storage — even temporary window layouts and input drafts are shared, losing each device's distinct screen setup.
3. Move only project and agent tabs, which represent work context, to account storage—allowing users to resume the same work wherever they sign in while
   keeping device-specific state such as screen width, drafts, and scroll position local.

## Decision

Adopt option 3.

- The per-account UI state file in the server's `DATA_DIR` owns the list of absolute paths of open root projects and their icons, as well as the agent tab list
  and last active tab for each root path. Server responses return values only for the authenticated user's **own account**.
- Root project absolute paths and icons, visible only to the owner, are read and written only through owner routes. Agent
  tabs use the existing owner/manager gate.
- Perform a one-time migration by uploading existing browser values only when no server values have been saved yet. If server values exist, local
  values from an empty incognito window do not overwrite them.
- Tab changes are saved to the server, and new logins and new devices first fetch those values to restore them. If both are operated simultaneously, the
  last save wins. Real-time updates to remote screens are outside the scope of this decision.
- Device-local state such as the agent event cache, input being composed, panel width, and scroll position is not moved. ACP sessions
  themselves and tmux remain owned by the server supervisor process.

## Rationale

Open projects and agent tabs are a list of work the user will resume next, rather than window appearance. Keeping a small state ledger on
the server, which already has account authentication, lets all browsers for the same account reconstruct this list without a separate synchronization
service. Drafts and screen layouts, meanwhile, are closely tied to the keyboard and screen size, so there is no reason to share them.
