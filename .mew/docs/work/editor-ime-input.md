---
title: "Preserve IME input at file-link boundaries"
description: "Records the 2026-10-30 investigation of mobile typing loss, reproduction and debugger evidence for ignored composition inside file-link caret widgets, the native composition fix, and local verification and physical-device limits."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and findings

Investigated a report that the mobile editor intermittently accepted voice input and Backspace while ordinary keyboard input inserted nothing. Isolated Chromium tests reproduced composition loss in Hotview at the start of a paragraph containing only a file link and at adjacent link boundaries. Ordinary prose, Plain, code, menu copying, and keyboard reopening passed the baseline composition checks. These results identify a reproducible input-loss path without establishing that it explains every reported occurrence.

A CDP function breakpoint in ProseMirror's widget mutation handler showed a `characterData` mutation containing the first Korean preedit character inside `.mew-file-link-caret`. Composition was active and `inputmode` allowed input, but the widget handler ignored the mutation and the model remained unchanged. The stack ran through mutation registration and DOM observer flushing. Existing non-composition text insertion and link deletion used separate model transactions, which explains why dictation and Backspace could work at the same boundary. The breakpoint, debugger connection, and temporary instrumentation were removed.

## Resulting behavior

`EditorLink` now prepares explicit stored marks when composition starts at a collapsed, matching file-link caret. It preserves other formatting and removes the link mark so ProseMirror starts composition outside the ignored widget. Cursor alignment pauses during composition startup and ongoing composition. The native editor handles preedit, commit, and cancellation; the application does not reconstruct the composition string or insert placeholder text into Markdown.

The [Hotview input contract](../development/hotview-rendering.md#input-and-serialization) owns the current behavior. The [mobile keyboard policy](../development/ui-contracts.md#mobile-editor-and-keyboard) and [selection-menu contract](../development/ui-contracts.md#editor-body-context-menu) retain their existing responsibilities.

## Verification and limits

The new `server/editor-ime-ui.test.ts` uses trusted CDP composition updates and commits in Hotview, Markdown Plain, and code. It covers initial input, selection-menu copying and keyboard reopening, both sides of file links on mobile and desktop, adjacent links, surrounding bold formatting, cancellation and reentry, and Hotview code blocks. Unit regressions cover explicit composition marks, formatting, unchanged document and cursor position at startup, mismatched selections, and read-only boundaries. The unit fixture's decoration and input-event types were made explicit so it can also pass type checking.

`node --test packages/editor/src/editor/file-link.test.ts server/editor-ime-ui.test.ts server/editor-file-link-caret-ui.test.ts server/editor-context-menu-ui.test.ts server/mobile-editor-keyboard-ui.test.ts server/mobile-editor-keyboard-policy-ui.test.ts` passed all 48 tests without skips. The six file-link unit tests also passed separately after test typing changes. Targeted oxlint, inherited-config type checks for the changed editor source/unit test and the new browser test, and the UI detector passed. Temporary type-check configurations were removed automatically.

The full `npx tsc -b` failed in concurrently changed public-share sources: missing `TreeNode.publicShare` properties in `FileTree.tsx`, an unresolved public-share page import in `main.tsx`, non-erasable syntax in `public-share-document.ts`, and an unused type in `public-shares.ts`. Those files are outside this fix. Documentation checks passed with 578 descriptions and no metadata or link errors; the changed-file whitespace check passed.

The reported physical keyboard and device were not available. Chromium emulation verifies browser composition and editor persistence, while actual Android/iOS keyboard behavior remains a physical-device check. No app build, deployment, launcher, or server start, stop, or restart was performed. The user builds and applies the change to the running instance.
