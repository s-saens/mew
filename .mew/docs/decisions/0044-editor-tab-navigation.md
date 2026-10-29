---
title: "Per-Editor-Tab Document Navigation and Return to the Most Recently Active Tab"
description: "Changes the default behavior of internal document links to navigation in the same tab, separating per-tab back and forward navigation from opening new tabs with Ctrl/Cmd+click. Records the decision to return to the most recently active tab in the same editor pane when closing the active tab."
created: "2026-10-22"
updated: "2026-10-22"
---

## Status

Adopted.

## Background

Internal document links in the editor opened new tabs, and closing the active tab selected a visually adjacent tab. Among tabs 1, 2, and 3, opening document 4 from 1 and then closing it still moved to 3, making it difficult to continue reading. The user requested navigating in the same tab with a regular link click, opening new tabs only when needed, and moving backward and forward through documents visited within a tab.

## Decision

A regular click on an internal document link, including links to child documents, changes the document in the current tab and adds it to that tab's visit history. Ctrl/Cmd+click opens a new tab whose history starts with only the first document. Same-tab navigation and back and forward navigation stay in the originating tab even if another tab displays the same document, and each tab maintains its own document visit history.

Place matching Back and Forward buttons at the far left of the floating file history toolbar. Enable each direction only when it has visit history. Opening a new document after going back clears forward history.

Closing the active editor tab selects the most recently used remaining tab in the same editor pane. Manage this tab selection order separately from document visit history within tabs. Keep document visit history in tab session memory and preserve it when moving tabs. When restoring saved tabs, merge duplicate tabs for the same document under the existing restoration policy and reset each history to the current document alone.

## Rationale and Impact

The click method lets users choose between continuing to read in the same tab and keeping multiple documents open in parallel. Closing a new tab returns to the previously viewed tab. Preserve the existing boundaries for file saving, collaboration, access permissions, and mobile panel visit history.

[Editor Tab Visits and Document Navigation](../development/ui-contracts.md#editor-tab-visits-and-document-navigation) owns the current status and UI contract, [Link Features](../features/document-code-media-editing/links-file-references-and-attachments.md) owns link behavior, and the [Editing Guide](../../../docs/guides/editor.md#links-and-attachments) owns usage instructions.
