---
title: "Double-Clicking Panel Handles to Maximize and Tabs to Rename"
description: "Records the decision to move double-click maximization from tabs to the shared panel drag handle, use double-clicking agent and terminal tabs to rename them, and retain existing keyboard and menu operations within the specified scope."
created: "2026-10-22"
updated: "2026-10-22"
---

## Status

Adopted.

## Background

Double-clicking a tab maximized the panel, making it difficult to rename agent and terminal tabs directly. The user requested double-clicking tabs to rename them and double-clicking panel handles to maximize panels.

## Decision

Double-clicking the shared `DockGrip` toggles the corresponding panel between maximized and restored states. Double-clicking an agent or terminal tab opens the existing name input. Retain F2, the context menu, and Shift+Enter to maximize or restore when a tab has focus.

## Rationale and Impact

Assign each action to its corresponding area: the handle that operates the entire panel and the area that operates tabs. Keep saved layouts, session lifetimes, and hidden handles on mobile. The [Shared UI Contract](../development/ui-contracts.md#workspace-panel-layout) and [Panel Layout Feature](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md) own detailed behavior and verification scope.
