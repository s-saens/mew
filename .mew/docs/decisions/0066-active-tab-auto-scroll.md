---
title: "Shared Horizontal Auto-Scrolling for the Active Tab"
description: "Adopt shared behavior that smoothly brings active and focused tabs into view in all horizontal tab bars while preserving outer scrolling, input focus, immediate drag responses, and reduced motion settings."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Adopted.

## Background

When there were more tabs than fit in the visible area, opening a new tab or selecting another tab with a shortcut left the tab bar's horizontal position unchanged, making the current tab hard to find. Agents, terminals, and other tabs need the same behavior as the editor.

## Decision

All horizontal tab bars use the shared `useTabAutoScroll` to scroll smoothly by the minimum distance needed to bring the active or focused tab into view. Tabs already in view stay in place, and scrolling is immediate when reduced motion is enabled. Scrolling is handled within each tab bar and does not change outer scrolling or input focus.

## Rationale and Impact

Users can locate the current tab consistently when creating tabs, selecting them with shortcuts, or using standard keyboard navigation. The shared behavior also handles restoration, resizing, and virtual new tabs. Automatic reveal yields during dragging, while panning and edge scrolling continue to respond immediately to the pointer.

The [Active Tab Auto-Scroll Contract](../development/ui-contracts.md#active-tab-auto-scrolling) owns the specific targets, state markers, and verification. [ADR 0044](0044-editor-tab-navigation.md) on tab selection order and document visit history remains in effect.
