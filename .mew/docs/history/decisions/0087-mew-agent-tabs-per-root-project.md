---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate mew agent tabs by root project. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0087 — Separate mew agent tabs by root project"
created: 2026-08-27
updated: 2026-09-11
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — Store the tab registry locally in the browser; retain per-root separation
- Partially supersedes: 0046·0079 — Storage scope for the browser-wide tab list and active tab
- Decision maker: Song Sanghoon (directive)

## Background

The agent pane's tab list was stored in a single browser-global `mew:agent-tabs` entry. The same tabs appeared even when switching between different
root projects, mixing project-specific work contexts and tabs. Root switching also closed the agent pane, so on mobile,
the sidebar and editor appeared first instead of the auxiliary pane the user had been viewing.

## Decision

- Separate the agent tab list, last active tab, and per-tab ACP session pointers by root project absolute path.
  Tabs created in project A appear only when A is reopened, while B shows only B's tabs.
- Switching root projects does not change whether auxiliary panes are open. If the agent pane was open, keep showing the
  same pane and replace only its tab state with that of the new root project. The sidebar, editor, terminal, and local
  browser follow the same principle.
- Migrate the existing global stored values only once, to the first current root project that is fully identified. Remove the global
  key so that legacy tabs do not appear as duplicates in other projects.

## Rationale

Switching root projects replaces state caches within the SPA ([ADR 0086](0086-mew-root-project-spa-handoff-and-cache.md)). Document tabs and content caches are already separated by root absolute path, so
agent tabs must use the same boundary to restore the correct work context when users reopen
a project. Whether a pane is open is part of the current display, not project data, so it
remains unchanged during switching.

## Results

- Opening a project's agent tabs for the first time starts with an empty tab.
- When switching projects, the previous tabs' UI connections are cleaned up, and only the new project's tabs are attached. The lifetime of running ACP tasks
  continues to follow the existing supervisor and idle shutdown rules.
