---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Restore scroll positions on mew refresh and browser restart (partially supersedes ADR 0029). Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0038 — Restore scroll positions on mew refresh and browser restart (partially supersedes ADR 0029)"
created: 2026-08-07
updated: 2026-08-20
---

- Date: 2026-08-07
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0029](0029-mew-drop-scroll-position-restore.md) removed per-document scroll restoration entirely. The core problem was that restoration followed every switch through rAF, making the scrolling visible — in a tool where users frequently switch tabs and windows, this felt like a delay on every switch.

But removing it entirely also sends users to the top on refresh or browser restart. Open tabs, the active tab, and pane layout are restored, but the reading position is lost.

## Decision

Reintroduce restoration, limited to "once per document after page load."

- Saving: Batch scroll updates and write them to localStorage `mew:scroll:{프로젝트}` (a path-to-scrollTop map). Flush remaining updates on `pagehide` so the position immediately before refresh is not lost (`src/utils/scrollMemory.ts`)
- Restoration: When a pane mounts, attempt restoration only for its active document. Since `takeScroll` returns a value only once per document after load, subsequent tab switches have no value to restore. Content (collab synchronization and images) must populate before scroll height becomes available, so retry through rAF for up to ~10 seconds (`EditorPane.tsx`)
- The wiring lives in one place in the mew app — without passing a prop through `packages/editor`, a capture-phase scroll listener on the pane wrapper handles both hotview (`.editor-root`) and plain (`.cm-scroller`)

Restoration on tab and window switches remains prohibited (0029 remains in effect). This ADR supersedes 0029's "do not reintroduce" rule only for restoration on refresh and restart. → [ADR 0039](0039-mew-scroll-restore-on-tab-switch.md) also lifted the prohibition on switch restoration (2026-08-08).

## Rationale

- The rationale for 0029 was "visible delay on every switch," not that restoration itself had no value. One rAF catch-up per load overlaps with app startup (tab restoration and collab connection), so it does not feel like a separate delay
- 0029's diagnosis that "there is no cheap, immediate restoration" remains valid — so the approach stays the same, with the frequency limited to 1 time per load
- The old key `mew:scroll-offsets…` is not reused because its format differs, including the `h:`/`p:` prefixes — the new key is `mew:scroll:{프로젝트}`
