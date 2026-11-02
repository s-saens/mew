---
title: "Editor Navigation at the Left Edge"
description: "Records the 2026-11-01 move of editor Back/Forward buttons from the right-hand file toolbar to the upper-left body edge, explorer-button separation, regression checks, and runtime verification limits."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and behavior

Back and Forward previously sat immediately before the upper-right file tools. They now stay at the upper-left edge of each editor body, with the existing 12px inset and button styling. When shown, Open File Explorer follows Forward without moving the navigation buttons. File tools keep their right inset.

The current contracts are [editor document navigation](../development/ui-editor-input.md#editor-tab-visits-and-document-navigation) and [links and references](../features/document-code-media-editing/links-file-references-and-attachments.md). The [editing guide](../../../docs/guides/editor.md#links-and-attachments) describes the new location.

## Verification

- The updated `server/editor-tab-navigation-ui.test.ts` first failed against the prior implementation because navigation remained inside the right toolbar. It then passed with the new layout at 1280px in dark mode and 390px in light mode. Checks cover the left and right insets, alignment, separation when the explorer button appears, disabled states, tab-local history, branching, modified clicks, duplicate document tabs, and horizontal overflow. Both viewport captures were inspected.
- Scoped lint passed with existing React ref, effect, and memoization warnings. The Impeccable detector reported no findings for `EditorPane.tsx`.
- `npm run build` passed, including TypeScript compilation; Vite reported its large-chunk warning. `npm run check:docs` passed description and local-link checks, and `git diff --check` passed.

## Application boundary

Browser verification used isolated fixtures with mocked file APIs. No deployment, launcher execution, or server lifecycle operation was performed. Physical-device verification remains outside this task.
