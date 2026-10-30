---
title: "0096 — Share horizontal and vertical action menus"
description: "Decision to add a horizontal icon presentation to the existing ActionMenu context and item components, reusing action data, permissions, tooltips, positioning, keyboard navigation, and dismissal."
created: "2026-10-30"
updated: "2026-10-30"
---

# 0096 — Share horizontal and vertical action menus

Status: Approved

## Background

The editor selection menu needs a horizontal row of icons with mouse-hover names while retaining its existing surface and action data. The presentation should also be reusable outside the editor. Copying the item list or the popup behavior would create competing sources for permissions, execution, positioning, and dismissal.

## Decision

- Extend the shared `ActionMenu` with `orientation`, defaulting to `vertical`. The editor uses `horizontal`.
- Keep one set of `ActionMenuItem` and separator children. The existing context carries orientation alongside closing behavior; item actions and permission checks do not branch by presentation.
- Horizontal items show their icons, preserve hidden label and hint content, and derive accessible names and hover tooltips from existing string labels. Complex labels provide `aria-label`; explicit tooltip descriptions remain supported. Text-only items retain a readable fallback.
- Keep one scrollable row and reveal focused actions during keyboard navigation. Share the same surface styles, popup geometry, overlay lifetime, selection preservation, and click-dismissal rules from [0095](0095-editor-menu-scroll-preservation.md).
- Reuse `HoverTipLayer` in the popup's host. Its shared tooltip layer and placement handle menus, screen edges, and modal bounds.

## Alternatives and rationale

A separate horizontal menu with its own action data would duplicate execution and permission logic. A separate component delegating to the same primitives could work, but an orientation option needs less public API and lets inline table actions inherit the presentation automatically. Styling a vertical menu sideways without changing item accessibility or tooltips would leave unlabeled icon actions.

## Consequences

Other callers retain vertical menus by default. Horizontal callers supply icons for icon-only actions and accessible text for complex labels. Narrow screens scroll one row instead of wrapping. Table actions use distinct row, column, database, and code icons where previously repeated icons relied on visible labels.

The [shared menu contract](../development/ui-contracts.md#shared-action-menus) and [package responsibilities](../development/packages.md) own current implementation and verification details.
