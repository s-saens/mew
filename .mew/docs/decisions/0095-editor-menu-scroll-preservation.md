---
title: "0095 — Preserve editor selection menus while scrolling"
description: "Decision to distinguish outside clicks from scroll and drag gestures for editor body menus, with an opt-in shared ActionMenu dismissal mode and unchanged defaults for other menus."
created: "2026-10-30"
updated: "2026-10-30"
---

# 0095 — Preserve editor selection menus while scrolling

Status: Approved

## Background

An automatic text-selection menu closed as soon as a mobile user touched the screen to scroll. Both the selection hook and the shared menu treated a pointer start as dismissal, and the selection hook also dismissed on scroll. This prevented users from keeping the selected-text actions available while reading surrounding content.

## Decision

- Editor body menus remain visible while the editor or surrounding app scrolls or is dragged. Only an actual click or tap outside the menu dismisses it; existing action, keyboard, focus-loss, selection-change, and scope lifecycle rules still apply.
- Add `outsideDismiss="click"` as an optional shared `ActionMenu` mode. Track pointer movement, scrolls, and cancellation without blocking the pointer start. Keep `pointerdown` as the default for other menu callers.
- Keep native selection gestures inside the body under the selection hook's ownership. Preserve the visible menu and prepared target during scrolling, and rebuild the target only when the selected range changes. The shared menu owns and consumes real clicks outside the body wrapper.

## Alternatives and rationale

Removing only the scroll listener would still dismiss the menu on the initial touch. Moving all menus to click dismissal would change unrelated app interactions. An opt-in mode fixes editor gestures while retaining other callers' current behavior and sharing the outside-click consumption logic.

## Consequences

The menu remains at its viewport-constrained position when the original selected text scrolls out of view. Its actions still apply to the prepared selection. Selecting a different range updates that target; real outside clicks, Esc, Back, and editor scope changes close the menu. Actual OS selection-handle behavior still requires physical-device verification.

The [editor menu contract](../development/ui-contracts.md#editor-body-context-menu) and [shared menu contract](../development/ui-contracts.md#shared-action-menus) own the current implementation and verification details.
