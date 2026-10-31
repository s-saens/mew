---
title: "Always-visible Mobile Editor Keys and Footer Order"
description: "Records the 2026-10-31 mobile auxiliary-key visibility and status-below-keys implementation, the subsequent floating-overlay correction, measured trailing scroll space, isolated browser verification, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Hotview previously showed auxiliary keys only while focused, and the file-size/selection status row appeared above the fixed keys. Mobile Hotview, Markdown Plain, and code now retain auxiliary keys before focus and after blur or keyboard dismissal. Footer order is document, auxiliary keys, status, then Dock or keyboard. Embedded hosts retain their explicit visibility option; desktop editors and terminal flow keys keep their existing display rules.

The original implementation described below reserved a separate key strip; the floating-overlay correction later on 2026-10-31 supersedes that reservation. The editor viewport observer measures keys and status within the owning host. It reserves the key height before status and provides the status height as the fixed keys' bottom inset. Resize observation handles changing heights; disappearing controls and observer cleanup reset reservations. Pinch zoom keeps the reservations while retaining the existing exclusion from editor height constraints. The current contract is [Mobile auxiliary key bar](../development/ui-contracts.md#mobile-auxiliary-key-bar), with feature scope in [code/text editing](../features/document-code-media-editing/code-text-editing-and-document-search.md) and [Markdown editing](../features/document-code-media-editing/markdown-hotview-source-and-properties.md).

## Local verification

- The updated `server/editor-keyboard-ui.test.ts` failed before implementation because the mobile Hotview key bar was absent before focus. It passes after implementation, covering initial/blur visibility, footer order, cursor retention, viewport resizing, keyboard dismissal, dynamic status height, Dock/safe-area restoration, and desktop exclusion.
- `server/editor-status-bar-ui.test.ts` passes with actual EditorPane Hotview/Plain footer geometry, typing, deferred size measurement, and retained keys after blur. Desktop and mobile captures confirm ordering and desktop exclusion.
- `server/fullscreen-keyboard-ui.test.ts` passes with the status row below keys and above the keyboard in narrow and wide touch layouts, including keyboard geometry and Dock restoration.
- `node --test server/fullscreen-keyboard-ui.test.ts server/mobile-key-bar-ui.test.ts server/mobile-panel-swipe-ui.test.ts server/mobile-editor-keyboard-ui.test.ts server/editor-status-bar-ui.test.ts server/terminal-keybar-ui.test.ts`: all six passed. The final three changed viewport/status/fullscreen tests were rerun together and passed.
- Scoped oxlint completed without errors; existing editor ref, effect, memoization, and dependency warnings remain. The Impeccable detector reported no findings for the changed UI components.
- `npx tsc -b` passed after replacing a test callback's unavailable DOM type with Playwright's locator blur method. The status regression passed again after that correction.
- `npm run check:docs` passed metadata and local-link checks. `git diff --check` passed.

## Application boundary

Checks use isolated browser fixtures and simulated keyboard geometry. No app build, deployment, launcher execution, or running server startup/restart was performed. The user must build and apply the changes; physical-device keyboard behavior remains unverified.

## Floating-overlay correction

The separate key-height margin before status clipped the document above an otherwise transparent key wrapper. Removed that margin so Hotview, Markdown Plain, and code render down to status behind the floating keys. Only the status row occupies footer space. The wrapper passes pointer input through empty areas while each button remains interactive. Terminal flow keys retain their layout.

Viewport measurement now resolves each editor body's own keys, including CodeMirror's sibling key bar. Hotview adds their measured height to trailing document padding; Plain/code retain existing trailing space. Cursor visibility continues to use the keys' top edge with its existing margin, keeping the final line reachable without shrinking the reading viewport.

Local verification for the correction:

- The revised status geometry regression failed against the old implementation, which ended the body above the keys. The final `server/editor-keyboard-ui.test.ts` and `server/editor-status-bar-ui.test.ts` pass for Hotview and Plain, including document hit testing through gaps, end-of-document caret visibility, repeated keyboard/viewport changes, dynamic status height, Dock/safe-area restoration, typing, and desktop exclusion. Mobile keyboard and desktop status captures were inspected.
- `server/mobile-key-bar-ui.test.ts` and `server/fullscreen-keyboard-ui.test.ts` pass, covering touch-through gaps, individual key actions and focus, both themes and narrow widths, terminal flow layout, and editor bounds during fullscreen keyboard transitions.
- `server/mobile-editor-keyboard-ui.test.ts`, `server/terminal-keybar-ui.test.ts`, and `server/mobile-panel-swipe-ui.test.ts` pass. The swipe fixture now starts key-bar swipes on an actual Ctrl button because the wrapper's empty area intentionally belongs to the document underneath.
- `npx tsc -b` and scoped oxlint passed without errors; existing React hook/ref warnings remain. `npm run check:docs` passed with no metadata or local-link errors. `git diff --check` passed.

All seven browser regressions ran in isolated fixtures. No app build, deployment, launcher, or running-server operation was performed. Runtime application and physical-device checks remain with the user.
