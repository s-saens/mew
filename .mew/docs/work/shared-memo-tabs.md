---
title: "Shared and private memo tabs"
description: "Records the November 7 implementation of a permanent shared memo and account-private tabs, retained CRDT/editor state, account isolation, and local verification versus user-owned server application."
created: "2026-11-07"
updated: "2026-11-07"
---

## Purpose and result

Replace the single memo title with a permanent Shared tab and account-private tabs, using the agent/terminal tab geometry and `+` control. Existing shared content stays in place. Private content and metadata persist on the server; deletion confirms permanent loss and revokes old connections. The same account can edit its notes from multiple windows, while other accounts cannot access them.

Visited editors and CRDT sessions remain alive across tab changes to retain undo, source projection, and unsent edits. Viewer presence follows only the selected open memo and preserves caret fields. The browser demo implements these controls with visitor-local memory. Current behavior and APIs belong to the [memo feature](../features/collaboration-comments-chat/shared-notes.md) and [collaboration contract](../development/collaboration.md#shared-memo); [ADR 0157](../decisions/0157-private-memo-tabs.md) records the storage and lifetime choices.

## Verification and limits

Local verification:

- `npm run build`: passed, including TypeScript project checks and production UI bundling. Vite reported its large-chunk advisory.
- `npm run lint`: completed with exit code 0 and React warnings; no lint errors.
- Focused Node suite: 12 tests passed across `server/private-memo-ui.test.ts`, `server/private-memos.test.ts`, `server/shared-memo.test.ts`, `server/shared-memo-ui.test.ts`, `server/collab.test.ts`, `server/collab-reconnect-ui.test.ts`, `src/components/shared-memo-startup.browser.test.ts`, `src/demo/memo-tabs.test.ts`, and `src/demo/collaboration.test.ts`.
- Actual Chromium checks covered account isolation, same-account content, persistence, confirmation/cancellation, failed deletion and retry, remote metadata deletion, undo/redo, remote clearing of an inactive memo and its Plain projection, caret preservation, existing shared editing/docking/focus, and 390px overflow arrows and add-tab access. Desktop dark and mobile dark/light fixture captures were inspected. These use example accounts and test-owned loopback services.
- A broader 30-test run including `src/demo/transport.test.ts` passed 29 tests; the existing demo-pet sprite test failed on an undefined sprite `width`. Running that test against the unchanged HEAD versions of the transport and test reproduced the same failure. It is outside memo behavior.
- `npm run check:docs`: 760 descriptions passed; link validation reported 37 existing missing targets, including `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. New memo links were inspected; no missing document was recreated or substituted as part of this task.

No deployment, launcher execution, or application server lifecycle operation was performed. The build updates `dist/`; the user must apply server code before the new metadata API and private rooms are available on the running instance. Physical mobile keyboards and cross-device networking remain unverified.
