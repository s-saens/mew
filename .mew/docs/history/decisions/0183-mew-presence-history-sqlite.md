---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: store mew connection session history in SQLite. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0183 — Store mew connection session history in SQLite"
created: 2026-09-30
updated: 2026-09-30
---

- Date: 2026-09-30
- Status: Adopted
- Decision makers: user (requested connection history, date/person/time filters, and Excel export), agent (storage and retrieval design)

## Background

Previously, presence kept only current connections in memory. The user requested connection history by day, user, and time, along with Excel downloads.

## Options

1. JSON ledger — Simple, but searching by interval and applying cumulative updates requires rewriting the entire file.
2. External PostgreSQL — Suitable for centralized queries, but requires separate DB configuration for a basic mew installation.
3. Server-internal SQLite — Reuses the existing Node SQLite usage pattern and provides transactions, time/user indexes, and installation independence.

## Decision

Persist presence connections and state intervals for each browser tab in SQLite in the server data directory. Follow the existing Node SQLite usage pattern without requiring external DB configuration. Do not store authentication cookies, tokens, IP addresses, or raw User-Agent strings. Record guests anonymously.

Reports with the same state update only the last observed timestamp; changes to user identity, file, project, foreground status, or agent count start a new interval. Close the interval on termination. On server restart, close unfinished intervals at their last observed timestamp so downtime is not counted as connected time. Do not automatically delete history. Do not overwrite a corrupted DB with an empty DB.

As with the current session list, only logged-in users can query history, and file and project information is masked based on permissions at the time of retrieval or export. Location information is also masked if the root of a historical path differs from the current project root. Dates use the querying browser's local date and time boundaries, and filters and Excel exports use the same range. Connection time is observed time per browser tab, so parallel tabs are counted more than once. Do not interpret it as actual working time.

The canonical source for UI, API, validation, and backup scope is maintained in the [mew collaboration development contract](../../development/collaboration.md#active-mew-sessions-presence) and [collaboration guide](../../../../docs/guides/collaboration.md#active-mew-sessions).

## Rationale

Choose option 3 because this is a local connection ledger for a single server. Keep the existing WebSocket state for the current list and separate history queries into a dedicated ledger. Follow the embedded DB and prepared query approach in the [Node SQLite documentation](https://nodejs.org/api/sqlite.html).
