---
title: "DOM browser scroll synchronization"
description: "Records the 2026-10-31 fix for delayed host scroll echoes reversing native viewer scrolling, per-container revisions, instant synchronization, regression verification, and physical-device and runtime application limits."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and result

The reported mobile recording showed a localhost app repeatedly moving backward during scrolling in Mew's internal DOM browser. The viewer relayed native scroll coordinates to the host, then rrweb replayed the returning coordinates with smooth scrolling. Replay-generated movement was captured as more viewer input. Delayed coordinates could therefore overwrite a newer gesture and continue the feedback loop.

The viewer now tracks revisions independently for the document and each nested scroll container, sends updates during movement with a 60 ms throttle, and ignores host events older than its latest local revision. Host scroll events retain their order relative to DOM mutations, use instant coordinates, and do not generate outbound input. Matching coordinates leave native momentum undisturbed. The host also applies input instantly despite app CSS requesting smooth scrolling. Replay rebuilds restore offsets without relaying fresh input, cancel pending viewer timers, and reset revision state. Host revisions reset when navigation changes the generation, including Back/Forward within an existing SPA document. The [current DOM browser contract](../development/port-preview.md#internal-dom-browser) owns these implementation details.

## Verification and application boundary

The final combined run passed all 11 tests with no skips:

- `server/dom-browser.test.ts`: Five host tests, including immediate scroll application under smooth CSS, revision validation, independent node revisions, legacy commands, and revision reset after document and SPA history navigation. The SPA regression failed before the reset fix because revision 1000 survived Back navigation.
- `src/components/dom-browser-panel.browser.test.ts`: Actual Chromium replay checks for delayed echoes, matching coordinates, host scrolling without input feedback, independent document and nested scrolling, and instant snapshot offset restoration without fresh input.
- `src/utils/dom-browser-scroll.test.ts`: Four unit tests for continuous 60 ms throttling, timer/listener disposal, clamped coordinate suppression, and snapshot restoration. Clamping uses a stub because happy-dom has no browser layout.
- `server/dom-browser-flow.browser.test.ts`: The existing real host/viewer integration test with editing, assets, navigation, and desktop/mobile layout.

`npm run build` passed, including TypeScript checks and the production UI build, with the existing large-chunk warning. Targeted `oxlint` passed with the viewer's existing state-in-effect warnings. Documentation metadata and local links passed (604 descriptions, zero errors), and `git diff --check` passed. The build updated local UI assets; it did not reload running server-side code.

Physical Android/Brave touch momentum and the app in the supplied recording still require user verification. Automated browser checks use isolated fixtures. No deployment, launcher execution, or Mew server start, stop, or restart was performed; the user applies server-side changes.
