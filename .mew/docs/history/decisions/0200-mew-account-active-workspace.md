---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0200 — Isolate active projects through per-account request contexts"
description: "Decision to change root project switching from server-wide to per-account ownership and isolate asynchronous requests, caches, collaboration rooms, and switch notifications."
created: 2026-10-07
updated: 2026-10-07
---

- Date: 2026-10-07
- Status: Adopted
- Partially supersedes: [0086](0086-mew-root-project-spa-handoff-and-cache.md) — The server's single active root and cleanup of shared watchers and collaboration rooms on switching
- Partially supersedes: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — Account storage of the active root project and real-time switch notifications
- Decision maker: Agent implementation following user instructions

## Background

One user's project tab switch changed the server-wide root and switched the views of all connected users. Restricting notifications alone would leave other accounts' file requests targeting the changed root, so storage ownership and path resolution must be isolated together.

## Options

1. Restrict only switch notifications to the account — the view stays in place, but the root for file requests changes.
2. Isolate active roots and request paths per account — strengthen asynchronous work, cache, and collaboration boundaries while retaining existing API identifiers.

## Decision

- Adopt option 2. Store the absolute path of the last active root in the account UI ledger. If there is no initial value or the folder no longer exists, use the server startup root.
- HTTP requests and WebSocket connections that use project paths determine the root from the authenticated account and pin it to the request/connection context. Another account's switch does not change paths during asynchronous processing.
- Root switching retains the existing owner permission requirement and sends `workspace` notifications only to connections for the same account. Preserve the active roots of guests and other accounts.
- An account's switch does not change the server startup root or environment settings or terminate shared watchers or collaboration rooms. Isolate file lists, search state, watchers, and collaboration rooms by actual project path. Continue sharing collaborative editing within the same project.
- Preserve SPA switching, per-root browser caches, and existing agents' fixed working paths. Do not add real-time cross-device synchronization of existing open tab lists or groups.
- The default root for CLI use without an account and for server initialization uses the existing configuration.

## Rationale

Resolving the authenticated account's root in an asynchronous context isolates concurrent requests without adding a new path argument to every file API. Using the actual project path as the key for shared state distinguishes identically named files under different roots while preserving collaborative editing of the same file.
