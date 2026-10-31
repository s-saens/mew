---
title: "0102 — Mobile project panel"
description: "Replaces the mobile project dropdown retained by decisions 0019 and 0082 with full-screen selection using the shared dialog, while preserving desktop sidebars, project actions, sorting, and storage."
created: "2026-10-31"
updated: "2026-10-31"
---

- Status: Adopted
- Partially supersedes: the mobile dropdown in [0019](0019-project-selector.md) and [0082](0082-desktop-project-sidebar.md).

## Context

The user requested that tapping the current project on mobile open a panel covering the screen. The anchored dropdown constrained the space available for project selection on a phone.

## Decision

Below 768px, open a full-screen project panel from the existing header button or Alt+P. Reuse `DialogFrame` for focus containment and Esc/Back dismissal. Give the panel a title, close icon, safe-area padding, and an internally scrolling list. Keep project icons, active highlighting, reordering, shortcut numbers, nested Edit/Delete actions, and Add Project.

Selecting a project or pressing Close dismisses the panel and restores focus to the header button. Nested action menus portal into the dialog and dismiss before the parent panel. Desktop project sidebars and their saved width and open state remain unchanged.

## Alternatives and rationale

- Retaining the anchored dropdown preserves its existing dimensions but does not satisfy the requested screen coverage.
- A partial-height sheet leaves less room for the list. Full-screen selection uses the available mobile workspace consistently.
- A separate overlay implementation would duplicate dismissal and focus behavior. The shared dialog already provides those controls.

## Consequences

The mobile panel covers the header and Dock, so users close it before accessing other header controls. Its list uses inline panel styling and touch-sized rows. No project data, account permissions, path ordering, or storage format changes.

Current behavior belongs to the [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md) and [shared UI contract](../development/ui-contracts.md#header-project-switcher). Verification and application limits are recorded in the [work record](../work/mobile-project-panel.md).
