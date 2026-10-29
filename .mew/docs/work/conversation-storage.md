---
title: "Conversation Storage and Segment Synchronization Implementation Plan"
created: 2026-09-30
updated: 2026-09-30
description: "Records the implementation plan for incremental conversation storage in SQLite and IndexedDB and segment-based transfer, isolated validation results, production rollout restrictions, and synthetic performance measurements."
상위파일: "_work.md"
---

[Decision](../history/decisions/0182-mew-incremental-conversation-storage.md) · [Current Contract](../development/conversation-storage.md)

## Plan

1. Server storage: SQLite WAL session/event tables, incremental storage, nondestructive migration of existing v2 JSON, and error protection.
2. Transfer: recent segments, older segments, and changes on reconnection, including generation and sequence numbers. Preserve compatibility with legacy supervisor replay and authentication boundaries.
3. Device storage: asynchronous event storage in IndexedDB, bounded recent history, cleanup on expiration and tab closure, and fallback when storage is unavailable.
4. UI: start with recent segments, load older conversations when scrolling up, preserve scroll position, and maintain the global CLI question order.
5. Validation: migration, restoration, changes, duplicates, disconnections, concurrent access, IndexedDB and scrolling in real browsers, and type, lint, and documentation checks. Compare write and transfer volumes for synthetic long conversations.

## Application Restrictions

Do not modify actual data, build, restart servers, or commit. Provider ACP session restoration itself and response generation time are outside the scope of this optimization.

## Progress

- Implementation and isolated validation of stages 1–5 are complete. The changes have not yet been applied to production.
- 101 related automated tests passed. Type checks, targeted linting, and documentation allowlist/link checks passed. Existing rendering was checked in both themes on desktop and mobile.
- Initial transfer volume decreased by approximately 96% for a synthetic 500-turn conversation. Average recent-segment read time decreased from 6.37 ms to 0.38 ms. SQLite writes using FULL commit increased from 1.80 seconds to 2.61 seconds in the same measurement. Conditions and limitations are recorded in the [current contract](../development/conversation-storage.md#validation-and-measurement).
- No build, production server restart, bulk migration of actual JSON, or commit was performed. After the new code is applied, sessions are migrated when first read, and existing JSON is preserved. Existing supervisors can use the legacy replay path until they are stopped or replaced.
- The supervisor's full in-memory event buffer and full provider ACP restoration are retained. This must not be considered a solution to all memory issues as history grows.
