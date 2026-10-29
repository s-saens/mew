---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0086 — Root project switching swaps caches within the SPA"
created: 2026-08-27
updated: 2026-10-07
description: "Decision to switch root projects within the SPA and retain per-root client caches. The original single-server-root constraint is separated by account in follow-up ADR 0200."
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0200](0200-mew-account-active-workspace.md) — Separate the active root, request paths, and switch notifications by account
- Follow-up decision: [0092](0092-mew-agent-survives-root-project-switch.md) — Agent cleanup when switching roots
- Partially supersedes: 0081 — Client behavior that refreshed the entire screen after switching roots
- Decision maker: Song Sanghoon (directive)

## Background

When switching root projects, the server cleaned up watchers, collaboration rooms, and agent sessions, then refreshed the entire browser. The constraint
that the server has a single process-wide active root remains, but refreshing also discards the UI shell and recent tab and content caches
already in the browser, increasing the perceived switching time.

## Options

1. Keep a full refresh on every switch — State boundaries are simple, but the screen and caches are rebuilt each time.
2. Swap per-root state in the SPA after the server switches — This removes restart costs while retaining the current server constraints, but requires cache keys to be separated by root.
3. Maintain multiple root server contexts simultaneously — Actual background loading is possible, but requires a substantial redesign of watcher, collaboration, and agent boundaries.

## Decision

- The server activates only one root project at a time and retains the existing watcher, collaboration room, and agent cleanup procedures.
- When the client receives a `workspace` presence signal, it rereads the current root information and tree and replaces the screen without refreshing.
- Retain the API identifiers `.workspace` and `docs`, but separate the open tab list and file content cache using keys that include the root's absolute path.
- When switching roots, close the UI for agents discarded by the server and restore the new root's tab state. Tab contents continue to follow the existing small-text LRU limit.
- Do not read actual server trees or files from other roots in the background. Doing so without changing the global active root requires the separate server contexts in option 3.

## Rationale

Keeping small tab lists and text content caches in limited browser storage costs little. By contrast, switching the global server root in advance is unsafe because it interrupts the watcher, collaboration, and agent state the current user is viewing.
