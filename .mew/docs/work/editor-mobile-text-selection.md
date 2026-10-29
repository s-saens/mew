---
title: "Body text selection colors and automatic mobile menus"
description: "Records the 2026-10-29 application of the theme primary color to Hotview, Plain, and code selections; preservation of native mobile text selection and automatic menus after selection; selection adjustment, focus, and lifecycle handling; isolated validation; and the scope of physical-device verification and production application."
created: "2026-10-29"
updated: "2026-10-29"
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
