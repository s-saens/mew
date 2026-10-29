---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: remove per-document scroll position saving and restoration in mew; switch tabs and windows immediately. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0029 — Remove per-document scroll position saving and restoration in mew; switch tabs and windows immediately"
created: 2026-07-31
updated: 2026-08-21
---

- Date: 2026-07-31
- Status: Superseded by: 0039
- Supersession sequence: [0038](0038-mew-scroll-restore-on-reload.md) restored restoration on reload and restart; [0039](0039-mew-scroll-restore-on-tab-switch.md) restored restoration when switching tabs and windows
- Decision maker: Song Sanghoon (directive)

## Background

mew saved per-document scroll positions in localStorage (`mew:scroll-offsets[:{프로젝트}]`) and returned to the last viewed position when switching tabs and windows. hotview (tiptap) and plain (CodeMirror) used separate key prefixes, `'h:'` and `'p:'`, respectively.

Restoration is not immediate. Content must load to establish the scroll height (ySync is asynchronous for collab, and images take even longer), so it retried with `requestAnimationFrame` for up to 30 frames. As a result, every switch visibly opened at the top and then scrolled to the saved position, making it feel like you had to wait for the switch to finish.

## Decision

Remove scroll position saving and restoration entirely. Switching tabs or windows opens immediately at the top without delay.

Removed: `src/utils/viewState.ts`, the `ScrollStore` type in `packages/editor` and the `scrollStore` prop on `Editor`, the restoration and saving blocks in `CodePane`, and the wiring in `App.tsx`. Leave the remaining localStorage keys (`mew:scroll-offsets…`) as they are, since nothing reads them.

Do not re-add it. Reintroducing it requires a new ADR that supersedes this one. → [ADR 0038](0038-mew-scroll-restore-on-reload.md) superseded restoration on reload and browser restart (2026-08-07), and [ADR 0039](0039-mew-scroll-restore-on-tab-switch.md) superseded restoration when switching tabs and windows (2026-08-08), lifting the prohibition entirely.

## Rationale

- Switching speed matters more than the convenience of restoration. mew is a tool for frequently switching tabs and windows. Visible scrolling on every switch feels like a delay rather than a convenience
- There is no cheap solution to "adjust after all content has loaded." Immediate restoration requires knowing the document height in advance, but collab synchronization, images, and tables determine the height only after rendering. The remaining alternative to rAF retries is hiding the screen until restoration finishes, which makes switching even slower
- This is separate from restoring open tabs and the active tab. Those values are settled at the moment of switching, so there is no delay — do not remove them along with it
