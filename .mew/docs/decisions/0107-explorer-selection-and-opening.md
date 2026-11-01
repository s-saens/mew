---
title: "Explorer selection and explicit opening"
description: "Separates project explorer selection from opening with single-click selection, double-click or Enter opening, modifier multiselection, and menus bound to explicit selection. Supersedes the single-click Documents navigation in migrated decision 0191 while preserving its storage model. ADR 0113 supersedes plain-click Files folder expansion."
created: "2026-11-01"
updated: "2026-11-02"
---

## Status

Accepted. [ADR 0113](0113-explicit-folder-expansion.md) supersedes plain-click Files folder expansion; the other selection and opening rules remain. Supersedes the click and Ctrl/Cmd+click opening behavior in [0191](../history/decisions/0191-mew-documents-parent-and-child-pages.md). Its representative-file structure, link preservation, and editor data protection remain.

## Context

Opening a file on every click makes selecting files for operations change the editor first. The user requested single-click selection, double-click opening, modifier multiselection, and item menus only for explicitly selected files. Right-clicking an unselected row must behave like right-clicking root space.

## Decision

Use one selection model in the project's Files and Documents trees, independent of editor tabs. A plain click selects, double-click or Enter opens, Ctrl/Cmd+Enter opens in a separate tab, and Space selects without opening. Ctrl/Cmd toggles one item, Shift selects a range in the visible hierarchy, and Ctrl/Cmd+Shift adds that range. Derive item order from the complete displayed hierarchy so virtualization does not limit selection. Remove collapsed and filtered-out rows from selection.

Bind item menus to existing selection. Right-click a selected row to retain the group; right-click an unselected row to clear selection and open the root menu. Touch long press explicitly selects its target before opening its menu. Copy, Cut, Delete, and dragging support the selection while actions requiring one item remain single-item actions. Deduplicate selected descendants under selected ancestors. Reject invalid and read-only drop destinations without falling through to a different parent.

Keep Files folder expansion available on plain folder clicks and preserve separate Documents chevrons. A Documents name click selects even when no representative exists; double-click or Enter attempts to open the representative and otherwise expands children without changing the editor. Modifier clicks change selection without opening documents or toggling folders. Keep the shared server file browser's own navigation contract.

The [explorer feature contract](../features/projects-files-search/file-folder-exploration-and-operations.md#selection-opening-and-context-menus) owns detailed behavior and recovery. The [Documents contract](../development/document-pages.md#navigation-and-editing) owns page and representative handling.

## Alternatives and rationale

- Retaining single-click opening would make selecting items continue to disturb the current editor and compete with multiselection.
- Automatically selecting right-clicked rows would violate the requested distinction between selected item menus and root menus.
- Selecting only rendered DOM rows would omit offscreen items and make range selection depend on scroll position.
- Touch long press needs an explicit selection step so a touch user can reach item actions without desktop modifier keys.

## Consequences

Explorer Ctrl/Cmd+click changes selection instead of opening another tab. Internal editor links retain their existing navigation rules. A selected folder and its selected descendants produce one operation on the folder, and root menu destinations never come from an unselected row. Existing file permissions, confirmations, drafts, tree expansion, and server file browsing boundaries remain in place. Verification and runtime application are recorded in the [work record](../work/explorer-selection.md).
