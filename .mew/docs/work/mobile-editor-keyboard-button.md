---
title: "Floating mobile editor keyboard button"
description: "Records the bottom-center mobile keyboard button, selection-preserving activation, visibility rules, isolated browser verification, and pending physical-device and runtime application checks."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Added a translucent circular keyboard button at the bottom center of editable mobile Hotview, Markdown Plain, and code bodies. It opens input at the current selection, hides when the keyboard is detected, and returns after dismissal. Activation releases the touch-selection suppression hint and uses the keyboard API when available, restoring its policy afterward. Unsupported or rejected API calls use native focus. Desktop, read-only, loading, revalidating, partial-preview, and media views exclude the button.

Current behavior is owned by [Mobile editor and keyboard](../development/ui-contracts.md#mobile-editor-and-keyboard), the [Markdown feature](../features/document-code-media-editing/markdown-hotview-source-and-properties.md), and the [code editing feature](../features/document-code-media-editing/code-text-editing-and-document-search.md). The [editing guide](../../../docs/guides/editor.md#basic-editing) describes the control for users.

## Verification

- `node --test server/mobile-editor-keyboard-ui.test.ts` passed. Isolated Chromium exercised 390px dark and 320px light mobile layouts and desktop exclusion at 1280px. Checks covered the circular translucent 44px target, bottom-center placement, translated labels, current selection and content preservation, typing, keyboard API user activation and temporary manual policy, API rejection fallback, native focus without the API, release of the input suppression hint, visibility after viewport changes, and excluded views. Mobile screenshots were also inspected.
- `node --test server/editor-keyboard-ui.test.ts server/mobile-keyboard-ui.test.ts server/editor-context-menu-ui.test.ts` passed all 7 tests, covering editor viewport geometry, keyboard dismissal, and touch-selection menus.
- `npx tsc -b` passed. Targeted oxlint checks passed with the existing warnings in `EditorPane.tsx`; no warnings were reported for the new component or test. Impeccable's detector reported no findings for the new component.
- `npm run check:docs` passed description and local-link checks. `git diff --check` passed.

## Application and limitations

Headless Chromium verifies focus, user activation, API calls, and simulated viewport changes; it cannot open a physical OS keyboard. Android and iOS keyboard opening and dismissal still require device verification after the user applies the change. No application build, deployment, launcher, or server start, stop, or restart was performed.
