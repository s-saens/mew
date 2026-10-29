---
title: "0069 — Shared Coordinate Correction for Popups Inside Modals"
description: "Resolve misaligned or clipped dropdowns in modals with blur, transforms, or scrolling through shared coordinate conversion and visible-area calculation. Record why the modal focus scope and local placement in rotated panels are retained."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Adopted.

## Background

A modal's `backdrop-filter` changes the coordinate reference point of internal `position: fixed` elements. Favorites, action menus, and mention lists that applied screen coordinates directly were offset by the modal's position. Select fields, account popups, and tooltips had individual corrections, but differed in their handling of borders, scrolling, and parent clipping.

Correcting only the origin still leaves menus outside a modal with `overflow: hidden` clipped. Moving all menus to body would place them outside the existing modal focus restrictions and fullscreen boundary.

## Decision

`getFixedPopupLayout` in `@mew/ui` calculates the fixed-position reference element, the area actually visible on screen, and CSS coordinate conversion together. Each popup uses this shared calculation while retaining its existing portal, opening direction, selection, and closing behavior. Account for the reference element's borders, scrolling, and axis-aligned scaling, and constrain menu size within the clipping area so items remain accessible through internal scrolling.

Select fields in rotating containers, such as remote screens, retain their existing local placement using an inverse matrix. Follow the [Popup Coordinate Contract](../development/ui-contracts.md#popup-coordinates-inside-modals) for specific targets and verification.

## Rationale and Impact

Use the same shared calculation to align positions even when a theme enables blur. New dropdowns need no separate origin correction, and focus, Esc, and back navigation handling inside modals can be retained. Reduce menu height when display space is limited, and verify that displayed items can actually be clicked as well as checking coordinates.
