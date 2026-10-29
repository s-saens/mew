---
title: "Separate panel switching in the mobile dock from tab switching in panel content"
description: "Change dock swipes to switch to adjacent panels and use mobile content swipes to switch tabs. This decision restricts tab switching for regular files and Markdown Plain to the auxiliary key bar to preserve horizontal scrolling."
created: "2026-10-27"
updated: "2026-10-27"
---

Status: Adopted

## Background

Dock swipes previously switched tabs first if the current panel had tabs. The user requested switching panels in the dock and tabs in panel content. Regular files and Markdown Plain need to distinguish horizontal scrolling of long lines from tab switching, and the existing Plain editor had no auxiliary key bar.

## Decision

Dock swipes select adjacent panels in the displayed dock order. Mobile content swipes select tabs in the current panel. Editors other than Markdown Hotview treat only swipes starting on the auxiliary key bar as tab switches, and Plain also receives the shared auxiliary key bar.

Keep existing handling for separate gesture areas such as tab rows, popups, task deletion, Gantt scrolling, and schedule dragging. Multitouch and canceled touches do not switch tabs. The [shared UI contract](../development/ui-contracts.md#mobile-dock-and-panel-switching) owns specific distance, direction, and cancellation criteria, and [panel layout and mobile](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md) owns feature scope.

## Alternatives and Rationale

Keeping tab-first switching in the dock would make panel and tab gestures differ from the requested distinction. Dividing tab and panel switching areas by screen height would allow horizontal scrolling of long lines only at certain heights. Distinguishing gestures by the element where the touch starts preserves horizontal scrolling throughout the content while allowing tab switching on the auxiliary key bar.

## Impact

Replace dock tab-first switching provided since 2026-10-03. Reuse existing dock order, visibility, permission filters, panel visit history, tab cycling, and selection preservation without changing the storage format. Record verification results and the scope not applied to production in the [work record](../work/mobile-panel-swipes.md).
