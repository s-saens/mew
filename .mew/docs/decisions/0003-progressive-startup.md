---
title: "0003 — Progressive Workspace Startup"
description: "Records the decision to show a lightweight screen first while waiting for authentication and tool downloads, reduce initial dependencies through asynchronous loading per panel, pure package entry points, and separation of the icon list, and define the boundaries of validation and production application."
created: 2026-10-15
updated: 2026-10-15
status: accepted
---

## Background

The authentication screen had already been separated, but the workspace still statically imported closed panels as well as editor, terminal, and browser playback code. Only a blank screen appeared while authentication and module downloads were pending. The workspace's required JS dependency chunks totaled approximately 1.36MB gzipped in an isolated in-memory bundle.

## Decision

Show a startup screen with the saved font and theme applied before waiting for authentication and route modules. Separate the loading boundaries for the workspace's basic structure and its editor and tools, and separate pure search and session functions and the full icon list from the heavy renderer. Defer update checks until after the first screen appears. [App Startup Architecture](../development/architecture.md) owns the current contract and regression checks.

## Rationale and Impact

Required downloads decrease, and delays in one tool do not block header or sidebar interactions. Because tools may need to download on first use, provide per-panel loading states and focus after deferred mounting. Preserve existing background agent restoration, notifications, and per-account state.

Complete P2P storage scope checks and authentication and authorization checks before reading workspace state. Do not change the synchronization or write order of collaborative documents. Distinguish isolated bundle and browser results from startup times on actual installations and remote networks; the user builds and restarts to apply the changes to production.
