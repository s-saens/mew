---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Workspace UI state belongs to the account. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0094 — Workspace UI state belongs to the account"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Adopted
- Follow-up decision: [0197](0197-mew-device-local-workspace-layout.md) — Per-device restoration priorities for docking, document tabs, and panel open/closed states
- Follow-up decision: [0134](0134-mew-dockable-workspace-panels.md) — Add a shared docking layout and independent terminal open state
- Follow-up decision: [0119](0119-mew-unified-terminal-agent-panel.md) — Separate agentOpen and tmuxOpen panel states
- Follow-up decision: [0125](0125-mew-sidebar-center-anchor-and-visible-loading.md) — Restore sidebar scroll position in pixels
- Partially supersedes: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — The scope of keeping editor tabs, sidebar, scroll, and panel state device-local
- Decision maker: Song Sanghoon (directive)

## Background

Documents, expanded subprojects and folders, sidebar scroll position, open documents, and split panes provide context for finding work again. Keeping them only in browser `localStorage` requires users to reconstruct their workspace UI when opening another device or an incognito window with the same account.

## Options

1. Store only work context in the account — the screen suits each device, but the work position differs.
2. Store the entire workspace UI in the account — continue the same work wherever the user logs in, with the last save taking precedence for concurrent changes.

## Decision

Adopt option 2.

- The per-account UI ledger in the server's `DATA_DIR` stores document tabs, split layouts, the active document, expansion states for Documents, subprojects, and folders, tree scroll position, and TOC and auxiliary panel open states for each absolute root path.
- Upload existing `localStorage` values only when no initial account ledger values exist. If a ledger exists, empty local values from a new device do not overwrite it.
- Batch changes briefly before saving them to the server. If multiple devices make changes simultaneously, the last save takes precedence; real-time remote screen updates and conflict merging are out of scope.
- Device-specific or transient state, such as panel widths, mobile layouts dependent on screen size, theme, language, fonts, drafts in progress, menus, and modals, remains local to the browser.
- Users can read and write only their own authenticated account's server ledger, and the root project list containing absolute paths retains the existing owner restriction.

## Rationale

This state represents "which materials the user was viewing and in what context" more than pixel-level window appearance. Extending the same storage used by the existing per-account project and agent tab ledger provides this continuity without a separate synchronization service.
