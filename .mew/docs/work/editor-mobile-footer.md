---
title: "Always-visible Mobile Editor Keys and Footer Order"
description: "Records the 2026-10-31 mobile auxiliary-key visibility and status-below-keys implementation, measured footer reservations, isolated browser verification, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Hotview previously showed auxiliary keys only while focused, and the file-size/selection status row appeared above the fixed keys. Mobile Hotview, Markdown Plain, and code now retain auxiliary keys before focus and after blur or keyboard dismissal. Footer order is document, auxiliary keys, status, then Dock or keyboard. Embedded hosts retain their explicit visibility option; desktop editors and terminal flow keys keep their existing display rules.

The editor viewport observer measures keys and status within the owning host. It reserves the key height before status and provides the status height as the fixed keys' bottom inset. Resize observation handles changing heights; disappearing controls and observer cleanup reset reservations. Pinch zoom keeps the reservations while retaining the existing exclusion from editor height constraints. The current contract is [Mobile auxiliary key bar](../development/ui-contracts.md#mobile-auxiliary-key-bar), with feature scope in [code/text editing](../features/document-code-media-editing/code-text-editing-and-document-search.md) and [Markdown editing](../features/document-code-media-editing/markdown-hotview-source-and-properties.md).

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
