---
title: "Body text selection colors and automatic mobile menus"
description: "Records the 2026-10-29 application of the theme primary color to Hotview, Plain, and code selections; preservation of native mobile text selection and automatic menus after selection; selection adjustment, focus, and lifecycle handling; the 2026-10-30 suppression of native context menus for existing body selections and keyboard activation during touch selection; scroll and drag preservation with click-only outside dismissal; isolated validation; and the scope of physical-device verification and production application."
created: "2026-10-29"
updated: "2026-10-30"
---

Fixed an issue where the context menu blocked native text selection when long-pressing or double-tapping body text on mobile. Current behavior is owned by the [editor menu contract](../development/ui-contracts.md#editor-body-context-menu), and user actions are owned by the [body text menu guide](../../../docs/guides/editor.md#body-context-menu).

Allowed the default behavior of touch `contextmenu` and stopped propagation to the internal table menu. After text is selected within the same body and the finger is lifted, the existing menu opens once the range remains stable for 250ms. The menu maintains body focus and does not block selection handle adjustments. Changing the selection closes the previous menu and prepares it again for the new range. Pressing menu items and scrolling within the menu are excluded from early dismissal. Mouse right-click behavior and the existing command path that applies read-only permissions and selection ranges are preserved.

During repeated-touch checks in isolated Chromium, CDP breakpoints identified the path where native selection disappeared and the menu reopened. Even `contextmenu` immediately after a touch was delivered with `pointerType: "mouse"`, and the call stack followed the right-click path in `openEditorMenu`. Updated handling to also check the preceding input. Actual mouse presses and keyboard input reset the touch state. Temporary debugging code and connections were removed.

All 3 tests in `MEW_CONTEXT_MENU_SCREENSHOT_DIR=/tmp/mew-mobile-selection-captures node --test server/editor-context-menu-ui.test.ts` passed. At 390px, checked default long-press behavior in Hotview, Plain, and code; no menu before or during selection; automatic display after repeated touches; selection and focus preservation; exact copy and deletion ranges; read-only copying; table menu integration; file, mode, and workspace changes; cancellation; and Esc. Checks for no automatic menu on normal selection at 1280px and existing right-click regressions at 1280/390px in light/dark themes also passed. Mobile automatic-menu captures confirmed selection highlighting and menu placement below the selection. OS selection handle results were validated by injecting DOM Ranges.

The 2 existing shared-menu and table-menu tests in `node --test server/action-menu-ui.test.ts server/editor-table-menu-ui.test.ts` also passed. `npx tsc -b` and `npx oxlint` for the changed code and tests passed, while existing component React warnings remained. `git diff --check` also passed for the changed scope.

`npm run check:docs` failed because frontmatter was missing from the existing `docs/지원서.md`. A separate run of `node server/document-links.ts --all` failed with 19 issues involving absolute asset URLs in the existing README and links to deleted feature and task documents. Descriptions and local links in the 3 changed documents passed separate checks using the existing validation functions.

No app build, deployment, server start, stop, or restart was performed. Actual Android and iOS native toolbar and selection handle behavior and production application are outside this isolated validation; the user applies the changes to the actual instance.

## Display selections in the theme primary color

Following a subsequent request, applied the theme primary color at 30% opacity to Hotview's native browser selection background while preserving text colors. Set the same color for native browser selections in Plain and code. Also fixed an issue in CodeMirror's directly rendered selection path where the higher specificity of the focused default style overrode the theme color. The current standard is owned by the [text selection contract](../development/ui-contracts.md#text-selection).

All 4 tests in `MEW_CONTEXT_MENU_SCREENSHOT_DIR=/tmp/mew-theme-selection-captures node --test server/editor-context-menu-ui.test.ts` passed. Checked Hotview, Plain, and code; editing and read-only modes; and CodeMirror's directly rendered and native browser selection branches at 1280/390px in light/dark themes. Switched between two different primary colors and verified the selection background's actual RGBA values, 30% opacity, existing syntax color tokens, preservation of selected content, and transparency of the native selection background in the directly rendered path. The iOS branch was tested by stubbing platform detection in Chromium. Captures of Hotview in mobile light mode and code in desktop dark mode confirmed the theme selection background and readable text.

`npx tsc -b`, `npx oxlint` for the changed code and tests, and `git diff --check` for the changed scope passed. Existing CodePane React warnings remained. `npm run check:docs` failed with 1 existing frontmatter error, and the separate link validation function returned 19 existing link errors. Descriptions and local links in the 2 documents changed this time passed separate checks. Temporary CDP diagnostic connections and test code were cleaned up.

No app build or application to the server was performed. Colors of OS selection handles and native toolbars, and actual iOS rendering, are outside the validation scope of this CSS change.

## Suppress the native menu for selected body text

On 2026-10-30, narrowed the earlier default-event allowance so the browser selection menu does not accompany Mew's automatic menu for selected body text. `EditorPane` now cancels touch-generated `contextmenu` events only when a nonempty native range is contained within the current Hotview, Plain, or code body. Mouse-compatible context events after touch input follow the same rule. Without a body selection, the handler retains browser defaults so the initial word-selection gesture remains available. The existing delayed Mew menu, native range, body focus, selection adjustment, read-only actions, and table actions retain their current paths. See the [current menu contract](../development/ui-contracts.md#editor-body-context-menu).

Extended `server/editor-context-menu-ui.test.ts` to check cancellation for touch and mouse-compatible context events after selecting text, preserving the selected range and body focus. The checks cover Hotview, Plain, code, adjusted selections, read-only copying, and table cells; the existing no-selection checks still require uncanceled defaults. The new regression failed against the previous implementation because the selected-text event was not canceled.

All 4 tests in `node --test server/editor-context-menu-ui.test.ts` passed after the change. The table-menu and shared text-selection tests also passed in `node --test server/editor-context-menu-ui.test.ts server/editor-table-menu-ui.test.ts server/text-selection-ui.test.ts`; that earlier run exposed a new assertion that incorrectly required read-only bodies to receive focus, which was corrected to compare focus before and after the event. `npx tsc -b`, `npx oxlint src/components/EditorPane.tsx server/editor-context-menu-ui.test.ts`, and `git diff --check` passed. Lint retained existing React warnings. `npm run check:docs` passed with 553 descriptions and no document link errors.

No app build, deployment, or server lifecycle command was run. The tests use isolated Chromium, synthetic context events, and injected DOM ranges; actual Android Brave/Chrome and iOS Safari toolbar and handle behavior still require physical-device verification. The user applies changes to the running instance.

## Keep touch selection from opening the keyboard

A follow-up on 2026-10-30 reported that the mobile keyboard opened along with selection. Menu preparation does not itself focus the editor, and the automatic menu already disables autofocus. Added a temporary keyboard policy in `useEditorTouchSelection` before the browser handles a touch press. Supported browsers retain native focus and selection under a manual policy; only a settled single editing tap requests the keyboard after 250ms. Double-tap selection and copying retain suppression. The hook restores original attributes on scope changes, cancellation, mouse/keyboard input, and outside interaction. It preserves the policy when native pointer cancellation already has a selection range.

Browsers without the show API receive an input-mode hint after a range exists. Their next body press restores the original hint synchronously. This fallback does not blur/refocus the body and cannot guarantee that the initial native keyboard stays closed; it may dismiss an existing keyboard. The current behavior and platform limits are owned by the [editor menu contract](../development/ui-contracts.md#editor-body-context-menu).

Extended the isolated editor regression with a controllable keyboard API to check early manual policy, no keyboard request for selection/copy, delayed single-tap activation under the correct policy, double-tap suppression, original attribute restoration on file changes and cancellation, no forced API hide, and the unsupported-browser input hint lifecycle in Hotview, Plain, and code. These checks inspect policy and API calls, not a physical OS keyboard.

All 5 tests in `node --test server/editor-context-menu-ui.test.ts` passed. `npx tsc -b`, `npx tsc -p tsconfig.app.json --incremental false`, `npx oxlint src/hooks/useEditorTouchSelection.ts server/editor-context-menu-ui.test.ts`, `git diff --check`, and `npm run check:docs` passed; the documentation check reported 555 descriptions and no link errors.

No app build, deployment, or server start, stop, or restart was performed. Physical Android Brave/Chrome and iOS keyboard/selection-handle checks and application to the running instance remain pending.


## Preserve selection menus during scrolling

On 2026-10-30, changed editor body menus to remain visible while the user scrolls or drags within the editor or elsewhere in the app. Previously, both the selection hook and the shared menu closed on pointer start, and the hook also closed on scroll. `ActionMenu` now offers an optional click-dismissal mode that preserves native gesture initiation and distinguishes clicks from pointer movement, scroll, and cancellation. Editor menus opt in; other menus retain pointerdown dismissal.

The selection hook keeps its prepared range across scrolling, dismisses on actual body clicks, and rebuilds the menu when the selection changes. Clicks outside the editor body are closed and consumed by the shared menu. Gestures starting within the editor and ending outside are tracked too. Pending menu display is canceled on an actual body click even for mixed mouse/touch input, preventing immediate reopening after dismissal. Menu actions after dragging also leave the menu closed.

Current behavior is owned by the [editor menu contract](../development/ui-contracts.md#editor-body-context-menu), [shared menu contract](../development/ui-contracts.md#shared-action-menus), and [0095](../decisions/0095-editor-menu-scroll-preservation.md). Earlier temporary keyboard-policy handling recorded above was replaced by the dedicated explicit-activation owner in [0094](../decisions/0094-explicit-mobile-editor-keyboard.md) and the [keyboard-button work record](mobile-editor-keyboard-button.md).

### Verification

- `server/editor-context-menu-ui.test.ts` adds actual Chromium touch scrolling through CDP in 390px Hotview, Plain, and code, and wheel scrolling at 1280px. The regression covers scrolling inside and outside the editor, canceled drags and their compatibility clicks, crossing from the editor to an outside target, copying the original selection after scrolling, outside-click consumption, and actual body-click dismissal without reopening. Existing selection-handle range changes, read-only copying, keyboard policy, and desktop action tests remain in the suite.
- Initial regression runs exposed a pending selection timer canceled by a subsequent scroll event and a menu reopening after a mixed mouse/touch body click. Keeping pending stable-selection timers during scroll and tracking whether any editor menu is open resolved those cases. Review also identified drags starting in the ignored editor wrapper; click-mode tracking now starts before the containment check.

- `node --test server/editor-context-menu-ui.test.ts` passed all 6 tests without skips, including the scroll/drag regression.
- `node --test server/action-menu-ui.test.ts` passed, preserving shared menu defaults, header behavior, keyboard navigation, focus, and click consumption.
- `node --test server/mobile-editor-keyboard-ui.test.ts server/mobile-editor-keyboard-policy-ui.test.ts` passed both keyboard regressions.
- `npx tsc -b` and targeted oxlint checks passed; the shared `ActionMenu` retained its 2 existing React ref warnings. `npm run check:docs` passed with 575 descriptions and no metadata or local-link errors. `git diff --check` passed.

Physical-device native selection handles remain outside Chromium emulation. No app build, deployment, launcher, or server start, stop, or restart was performed; applying the change to the running instance remains the user's step.
