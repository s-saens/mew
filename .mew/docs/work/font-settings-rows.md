---
title: "Single-line font settings layout"
description: "Records the 2026-10-27 removal of font guidance text, single-line alignment of interface/document/code labels and selectors, regression checks for narrow screens, four languages, focus, and saving, and the scope that has not been deployed."
created: "2026-10-27"
updated: "2026-10-27"
---

Removed unnecessary font guidance text and reorganized selectors stacked below their labels. [Appearance settings](../../../docs/configuration/appearance.md#appearance-settings) owns current usage instructions, and [Appearance settings features](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) owns the implementation contract.

Each row now consists of a label, selector, and reset button, with a shared grid aligning the start of each selector. Labels are associated with their corresponding inputs. Recommended selections, font name entry, individual resets, and browser storage are retained.

Passed 9 checks in `node --test server/theme-color-ui.test.ts src/i18n.test.ts src/utils/fontPreferences.test.ts`. In isolated Chromium, checked the single-line layout, selector alignment, screen boundaries, absence of guidance text, label focus, and existing font entry/reset behavior at 320/390/1100px in light/dark mode and four languages, and reviewed desktop and mobile captures. Adjusted tests to close open popups with Esc first when they cover other controls.

`npx tsc -b` and linting of the changed code and tests completed without errors. Existing Fast Refresh warnings remained in lint output, and the layout check had no findings. The full documentation check failed due to missing links outside the scope of this work; descriptions and direct links in the changed documents were checked separately.

No app build, deployment, server launch, or restart was performed. The user applies the changes to the actual instance.
