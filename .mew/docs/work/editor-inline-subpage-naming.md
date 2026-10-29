---
title: "Name editor subpages inline"
description: "Records the 2026-10-30 replacement of the /page name dialog with inline entry, IME and cancellation safeguards, caret restoration, isolated browser and static checks, the additional diagram-test fixture blocker, and the scope not applied to production."
created: "2026-10-30"
updated: "2026-10-30"
---

Replaced the Hotview `/page` name dialog with a focused field at the command position. Enter or the check icon creates the child page; Esc or the cancel icon returns to editing. Empty names and IME confirmation do not submit. Navigation or loss of creation access cancels unfinished entry. Current behavior is owned by the [document page contract](../development/document-pages.md) and [Documents feature](../features/projects-files-search/documents-and-document-map-management.md); user actions are documented in the [editor guide](../../../docs/guides/editor.md#basic-editing).

The field uses a local ProseMirror decoration and React portal, keeping unfinished names outside Markdown, autosave, and collaboration data. Its insertion position follows body edits. The host receives the confirmed name and retains the existing draft saving, parent promotion, link insertion, and tab handling. Slash menu selection prevents default mouse focus changes so the new field retains focus.

Review found that Enter on the focused Cancel button could submit; Enter submission now applies only to the input. Browser checks also exposed lost keystrokes immediately after cancellation beside a file link in collaboration mode. CDP breakpoints in `EditorView.focus` were used to inspect the model selection and focus call stack. Refreshing focus-dependent caret widgets after returning focus fixes immediate typing. Temporary debugger instrumentation and connections were removed.

`node --test server/editor-page-command-ui.test.ts server/editor-file-link-caret-ui.test.ts packages/editor/src/editor/slashMenuPosition.test.ts` passed all six tests. The page command fixture covered 1100px dark and 390px light layouts, with and without collaboration: inline location and focus, no dialog, viewport fit, empty-name rejection, IME Enter handling, body edits while naming, confirmation and cancellation with keyboard and buttons, immediate typing after cancellation, navigation and access-change cancellation, exclusion of unfinished names from autosave, duplicate and nested creation, and preservation of links, drafts, parent tabs, cursor, focus, and scroll during path changes. Desktop and mobile input captures were inspected.

The additional `server/editor-diagram-ui.test.ts` check did not reach its browser assertions because the installed Rolldown rejected CSS imports handled by that test's existing fixture loader. Its companion slash-menu positioning tests passed. That unrelated fixture was left unchanged. The passing file-link fixture emitted dependency `use client` warnings.

`npx tsc -b` passed. Targeted `npx oxlint` completed without errors; existing React warnings in `Editor.tsx` and `EditorPane.tsx` remain. `npm run check:docs` passed with 552 descriptions and no metadata or local-link errors. `git diff --check` passed for the task scope.

No app build, deployment, launcher execution, or server start, stop, or restart was performed. Browser checks used isolated request and collaboration doubles. Physical mobile keyboards and simultaneous remote structural changes remain unverified; the user applies the changes to the running instance.
