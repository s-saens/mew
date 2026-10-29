---
title: "Shared panel popup behavior"
description: "Decision to move memo-specific popup movement, inactive opacity, and blur rules into DockPanel and shared CSS, applying them to tasks and future panels that support switching to popups."
created: "2026-10-26"
updated: "2026-10-26"
status: "accepted"
---

## Background

Memos and tasks display popups using the same `DockPanel`, but title-based dragging, full workspace bounds, inactive opacity, and blur removal were implemented in memo-specific branches and CSS. Despite using the same display mode, tasks retained a separate drag bar and behaved differently.

## Decision

Move memo popup behavior into the shared contract of `DockPanel` and `overlay-layers.css`. Remove panel-type exceptions; future panels that support switching to popups also use this component. The [shared UI contract](../development/ui-contracts.md) owns detailed behavior.

## Rationale and Impact

Extend the existing shared implementation without adding a separate popup component to prevent behavior from diverging across features again. Leave only body editing styles in memo-specific CSS. The inactive appearance and movement bounds of tasks become the same as those of memos, while panel mode, mobile behavior, content preservation, and existing position storage keys remain in place.
