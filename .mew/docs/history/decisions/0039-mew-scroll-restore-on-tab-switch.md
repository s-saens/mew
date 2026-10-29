---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Restore scroll positions on mew tab and window switches (lifts the remaining prohibition from ADR 0029). Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0039 — Restore scroll positions on mew tab and window switches (lifts the remaining prohibition from ADR 0029)"
created: 2026-08-08
updated: 2026-08-20
---

- Date: 2026-08-08
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0029](0029-mew-drop-scroll-position-restore.md) removed scroll restoration entirely and prohibited reintroducing it; [ADR 0038](0038-mew-scroll-restore-on-reload.md) partially superseded it for
reloads and browser restarts only. As a result, reloading returns to the previous position, but switching tabs goes to
the top — the divergent behaviors made things more awkward, and the user instructed us to apply
the same restoration to tab switches.

## Decision

Restore scroll positions on tab and window switches as well. Lift 0029's remaining prohibition (switch restoration).

- Saving remains as defined in 0038 (`src/utils/scrollMemory.ts`, `mew:scroll:{프로젝트}`)
- Remove `takeScroll`'s consumption limit of "once per document after loading" and replace it with `getScroll` — pending values that have not yet been flushed take priority,
  so the position immediately before switching is available right away
- The restoration effect in `EditorPane` runs whenever the active document changes. Height still depends on content being populated, so rAF retries remain
  (up to ~10 seconds) — if another switch changes the document again, cleanup stops the previous restoration attempts

## Rationale

- The user judged preserving the previous position preferable to the "visible scrolling on every switch" that motivated 0029.
  Plain (CodeMirror) and local documents have height immediately and restore on the first frame; only collab documents are delayed by synchronization
- 0038 already established the saving and restoration infrastructure, so the only change is removing the consumption limit — no separate mechanism is created
