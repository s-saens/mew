---
title: "0071 — Reorder the Project List with Handles"
description: "Decision to add mouse and touch handles on the left and keyboard reordering to the header project dropdown, reusing existing per-account path order storage. The removal of the tab and group UI remains in effect."
created: 2026-10-26
updated: 2026-10-26
---

- Status: Adopted
- Partially supersedes: the portion of the reordering UI removal in [0019](0019-project-selector.md) that covers changing dropdown list order.

## Background

Drag handles were requested so users could set the order of the project list themselves. The name area must remain available for project selection and touch scrolling.

## Decision

Place a dedicated handle on the left of each project row and reuse the shared vertical drag hook. Also support `Shift+↑/↓` on the row and `↑/↓` on the focused handle. Exclude the Add Project item from reordering.

Save the changed order in the existing per-account path list and browser copy. `Alt+1…9` follows the same list order. Preserve the active project and open menu during reordering. Do not add project tabs or a group UI.

## Rationale and Impact

Separate input areas for selection and reordering while retaining the shared hook's pointer capture, scrolling, and movement animations. No new storage format or API is needed. Follow the [Project Feature Contract](../features/projects-files-search/opening-projects-tabs-and-groups.md) for usage and verification scope and the [UI Contract](../development/ui-contracts.md#header-project-switcher) for the shared implementation.
