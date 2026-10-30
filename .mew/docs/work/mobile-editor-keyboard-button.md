---
title: "Floating mobile editor keyboard button"
description: "Records the initial mobile keyboard button and the follow-up explicit-only activation and outside-tap dismissal policy, automated verification, and pending physical-device and runtime application checks."
created: "2026-10-30"
updated: "2026-10-30"
---

## Initial addition: purpose and result

Added a translucent circular keyboard button at the bottom center of editable mobile Hotview, Markdown Plain, and code bodies. It opens input at the current selection, hides when the keyboard is detected, and returns after dismissal. Activation releases the touch-selection suppression hint and uses the keyboard API when available, restoring its policy afterward. Unsupported or rejected API calls use native focus. Desktop, read-only, loading, revalidating, partial-preview, and media views exclude the button.

Current behavior is owned by [Mobile editor and keyboard](../development/ui-contracts.md#mobile-editor-and-keyboard), the [Markdown feature](../features/document-code-media-editing/markdown-hotview-source-and-properties.md), and the [code editing feature](../features/document-code-media-editing/code-text-editing-and-document-search.md). The [editing guide](../../../docs/guides/editor.md#basic-editing) describes the control for users.

## Initial addition: verification

- `node --test server/mobile-editor-keyboard-ui.test.ts` passed. Isolated Chromium exercised 390px dark and 320px light mobile layouts and desktop exclusion at 1280px. Checks covered the circular translucent 44px target, bottom-center placement, translated labels, current selection and content preservation, typing, keyboard API user activation and temporary manual policy, API rejection fallback, native focus without the API, release of the input suppression hint, visibility after viewport changes, and excluded views. Mobile screenshots were also inspected.
- `node --test server/editor-keyboard-ui.test.ts server/mobile-keyboard-ui.test.ts server/editor-context-menu-ui.test.ts` passed all 7 tests, covering editor viewport geometry, keyboard dismissal, and touch-selection menus.
- `npx tsc -b` passed. Targeted oxlint checks passed with the existing warnings in `EditorPane.tsx`; no warnings were reported for the new component or test. Impeccable's detector reported no findings for the new component.
- `npm run check:docs` passed description and local-link checks. `git diff --check` passed.

## Application and limitations

Headless Chromium verifies focus, user activation, API calls, and simulated viewport changes; it cannot open a physical OS keyboard. Android and iOS keyboard opening and dismissal still require device verification after the user applies the change. No application build, deployment, launcher, or server start, stop, or restart was performed.


## Follow-up: explicit activation and outside-tap dismissal

The follow-up request replaces delayed keyboard opening from ordinary body taps with button-only activation. `useMobileEditorKeyboard` now owns persistent suppression for each mobile editor pane. It applies manual keyboard policy and an input-suppression hint before native body focus, including asynchronously mounted bodies. The button restores input and requests the keyboard in the user gesture. Pressing the body, auxiliary keys, or another app control dismisses that pane's authorized keyboard session before the same press is handled. Input can transfer to another pane through its own keyboard button. `useEditorTouchSelection` retains native selection and menu timing and no longer owns keyboard activation or attribute restoration.

This supersedes the initial addition's temporary-policy behavior above. The current contracts are linked above; [0094](../decisions/0094-explicit-mobile-editor-keyboard.md) records the interaction decision.

### Follow-up verification

- `node --test server/mobile-editor-keyboard-ui.test.ts` passed in actual Hotview, Markdown Plain, and code at 390px dark and 320px light, with desktop exclusion at 1280px. It checks suppression before the first body tap and beyond the previous delay, button-only API calls, selection and typing, native-focus and rejected-API fallback, persistent manual policy, API-compatible hide ordering, body-tap dismissal, outside-control actions, and keyboard visibility after simulated viewport changes.
- `node --test server/mobile-editor-keyboard-policy-ui.test.ts` passed. The React StrictMode fixture checks pane ownership, transfer through a second keyboard button, outside presses, original attribute restoration on editor replacement, disable, desktop resize, and unmount, and keyboard dismissal during unmount.
- `node --test server/editor-context-menu-ui.test.ts` passed all 5 tests with the revised single-tap policy. Touch selection, Copy, range adjustment, cancellation, and desktop menu behavior remain covered.
- `node --test server/editor-keyboard-ui.test.ts server/mobile-keyboard-ui.test.ts` passed both viewport and dock regression tests.
- `npx tsc -b` and targeted oxlint checks for the new hook, modified selection hook, button, and browser tests passed. The separate `EditorPane.tsx` lint check passed with its existing warnings.
- `npm run check:docs` passed with 574 descriptions and no metadata or local-link errors. `git diff --check` passed.

Physical OS keyboard opening and dismissal remain unverified. This follow-up did not build the application, deploy, run the launcher, or start, stop, or restart servers.
