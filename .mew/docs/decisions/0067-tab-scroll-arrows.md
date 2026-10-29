---
title: "Shared Scroll Arrows for Horizontal Tab Bars"
description: "Adopt a shared TabScrollArea that overlays chevron buttons only in directions with remaining scroll space in all horizontal tab bars, scrolls at a constant speed while held, and maps ordinary wheel input to horizontal scrolling."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Adopted.

## Background

Active tab auto-scrolling makes the selected tab easy to find, but viewing other hidden tabs required manually scrolling the tab bar. A shared control is needed to indicate which direction has more tabs and allow scrolling by clicking.

## Decision

All horizontal tab bars use the shared `TabScrollArea`. It retains the existing `useTabAutoScroll` internally and overlays chevron buttons over the tabs at ends with remaining scroll space. The buttons use a strong shadow without a background or border, scroll at 320px per second while held, and stop immediately on release. Ordinary vertical wheel input also maps to horizontal movement.

At an additional request on 2026-10-26, changed the initially adopted movement of 50% of the visible width to constant-speed scrolling while held and strengthened the shadow. Users can adjust the scrolling distance by how long they hold the button.

## Rationale and Impact

Reveal the direction of hidden tabs while retaining the display width of existing tabs. The shared component observes scrolling, size, and tab changes to update directional indicators consistently. Scrolling does not change the active tab and preserves the existing automatic reveal, input focus, keyboard, drag, and reduced motion contracts.

Extends the active tab auto-scroll decision in [ADR 0066](0066-active-tab-auto-scroll.md). The [Shared Tab Scrolling Contract](../development/ui-contracts.md#active-tab-auto-scrolling) owns the detailed conditions of the current behavior.
