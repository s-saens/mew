---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: store conversations using SQLite, IndexedDB, and sequence-based segment synchronization. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0182 — Store conversations using SQLite, IndexedDB, and sequence-based segment synchronization"
created: 2026-09-30
updated: 2026-09-30
---

- Date: 2026-09-30
- Status: Adopted
- Partially supersedes: 0133 — Move the agent transcript cache from the shared localStorage budget to a separate IndexedDB budget; preserve draft and settings protection
- Decision makers: user (approved the design direction and implementation), Codex (implementation)

## Background

The cost of rewriting the entire JSON after every completed turn and sending the entire transcript on every connection grows with conversation length. Preserve the roles of the server restoration transcript and provider ACP history while reducing the units of storage, retrieval, and transfer.

## Decision

- Store per-session sequence numbers and events in SQLite WAL in the server-local DATA_DIR. Normal saves append only new events; if ACP restoration changes the content, replace it in a transaction. Retain small configuration JSON files.
- Validate existing v2 JSON and migrate it on first retrieval without deleting it. Do not overwrite SQLite errors with empty history. Preserve provider history and existing protection against restoration failures.
- Identify recent segments, earlier segments, and changes since reconnection using sequence numbers and a generation for each supervisor lifetime or transcript replacement. Resynchronize generation mismatches and incomplete caches with the recent segment. Preserve question/answer boundaries, and use the full question offset for CLI placement.
- After checking the account's server-side tab ledger, display IndexedDB history for the same session as actual bubbles even before connecting. Retain the old localStorage plain-text preview and the prohibition on connecting before querying the ledger.
- New supervisors negotiate segment transfers while remaining compatible with the full replay path of existing supervisors and clients. Retrieval is available only within an existing authenticated tab connection.
- The browser asynchronously stores recent history in IndexedDB, isolated by account, tab, runtime, and cwd. Storage size and retention are limited, and storage failures do not block live conversations. Drafts and settings retain their existing storage contracts.
- Building, deployment, and migration of actual history occur after the user applies the changes. Implementation work uses only isolated test data.

## Rationale

This provides partial retrieval and atomic updates without installing a separate DB service. Storing the entire JSON in a single DB row does not address retrieval and serialization costs. SQLite WAL provides concurrent reads and writes on the same host, but writes are serialized, so use short transactions and a busy timeout.

For the current contract and validation, follow [conversation storage](../../development/conversation-storage.md); for progress records, follow the [implementation plan](../../work/conversation-storage.md).
