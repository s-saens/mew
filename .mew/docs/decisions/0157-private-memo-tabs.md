---
title: "Permanent shared memo and account-private tabs"
description: "Extends the server-wide memo with account-private persistent tabs, retaining the original shared CRDT. Records account authorization, deletion revocation, independent document lifetimes, and alternatives."
created: "2026-11-07"
updated: "2026-11-07"
status: accepted
---

## Context

The existing memo is one server-wide Yjs document. Users need a permanent shared tab and personal tabs with the same tab styling and add control as agent and terminal panels. Personal notes must survive device and project changes without exposing them to another account.

## Decision

Retain the original shared room and storage file as the first, nondeletable tab. Add account-owned UUID tabs, authenticated metadata APIs, and reserved private memo rooms. Require the current account and a live tab index entry for private-room access, in addition to collaboration permission. Private tabs do not inherit project file permissions or administrative access through another account's owner role.

Reuse the durable CRDT adapter for private content. Save the private index and document files under the server data directory, outside workspace file APIs. Remove authorization before deleting content; evict the room and reject stale updates so clients cannot recreate deleted tabs.

Keep visited connections outside project-keyed docking. Keep their editors mounted across tab selection to preserve undo and project inactive remote edits into the source view. Publish viewer presence only for the selected open document, preserving cursor state. Reuse `TabScrollArea` and the existing compact tab geometry.

## Alternatives and rationale

| Alternative | Reason for the choice |
| --- | --- |
| Browser-only private notes | Cannot restore the same account's notes on another device. |
| Private documents in the shared memo room | Would expose private data to all shared-room subscribers. |
| Project files for private notes | Changes the existing project-independent scope and ties privacy to file permissions. |
| Destroy connections/editors on every selection | Risks losing offline changes and undo, and leaves source projection stale. |

## Consequences

The server stores account-private notes and performs authorization on every connection and message. This is application account isolation, not encryption against the server operator. Deletion is permanent and requires UI confirmation. Visited tabs consume a document, editor, and connection until account exit or deletion. Metadata refresh is eventual within five seconds in visible open panels; concurrent content remains CRDT-synchronized.

The [collaboration contract](../development/collaboration.md#shared-memo) owns routes, storage, and lifecycle details; the [memo feature](../features/collaboration-comments-chat/shared-notes.md) owns behavior. The [work record](../work/shared-memo-tabs.md) distinguishes local checks from user-owned runtime application.
