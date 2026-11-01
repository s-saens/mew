---
title: "Explicit Files folder expansion"
description: "Replaces plain-click folder expansion from ADR 0107 with double-click or icon-click expansion in the project Files tree, including subprojects and the linked Documents folder."
created: "2026-11-02"
updated: "2026-11-02"
---

## Status

Accepted. Supersedes only the plain-click Files folder expansion rule in [ADR 0107](0107-explorer-selection-and-opening.md).

## Context

Files folder clicks still changed expansion while selecting a row. The user requested opening folders by double-clicking or clicking the folder icon.

## Decision and rationale

Use single-click selection for folder names and row space. Double-click or Enter toggles expansion; a click on the folder or custom project icon provides direct expansion on desktop and touch screens. An icon double-click toggles once. Selection modifiers suppress expansion on both the row and icon.

Apply this behavior to ordinary folders, subprojects, and the linked Documents folder in Files view. Retain Documents page navigation and its separate chevrons, independent project/Documents navigation arrows, and the shared server browser's navigation behavior.

Keeping whole-row single-click expansion would continue changing the hierarchy during selection. Requiring double-click everywhere would remove the direct icon action requested for quick and touch navigation.

## Consequences

Selecting a Files folder no longer expands or collapses children. Keyboard Enter, lazy loading, persistence, menus, drag gestures, and permissions retain their existing contracts. The [feature contract](../features/projects-files-search/file-folder-exploration-and-operations.md#selection-opening-and-context-menus) owns the current behavior; the [work record](../work/explorer-selection.md#explicit-files-folder-expansion-2026-11-02) records verification.
