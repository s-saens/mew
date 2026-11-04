---
title: "0134 — Keep one desktop layout per account and browser device"
description: "Shares desktop panel geometry, popup coordinates, last-panel focus, and preferred editor slot across projects within one account and browser device. Supersedes historical ADR 0197's desktop account/root geometry scope while preserving ADR 0133's account-and-project tab ownership and mobile restoration."
created: "2026-11-04"
updated: "2026-11-04"
---

- Status: Accepted
- Partially supersedes: [Historical ADR 0197](../history/decisions/0197-mew-device-local-workspace-layout.md), desktop account/root geometry scope only.
- Preserves: [ADR 0133](0133-realtime-account-tabs.md), account-and-logical-project ownership of shared tabs and selection.

## Context

Desktop layout restoration used an account and project key. Selecting another project could replace panel positions, visibility, popup coordinates, and the work surface the account had just used. The user requested one desktop arrangement and last focused panel per account across project changes.

## Decision

Store one desktop layout and last focused panel per account on each browser device. Preserve the mounted desktop Dock and its arrangement while switching project content. Desktop memo/task popup coordinates use the same account-wide boundary. Keep mobile layout and foreground restoration project-specific.

Initialize a missing desktop layout once from the first accepted active project's legacy browser record or account fallback. A project preview or prefetch cannot select the initial desktop arrangement. After initialization, incoming project snapshots cannot replace it. Retain the arrangement in memory when browser storage is unavailable. Preserve legacy records for migration rather than deleting unrelated project state.

Keep editor, agent, and terminal tabs scoped to the account and logical project. Align incoming editor panes with the desktop's existing slots while retaining the selected project's files and active selections. Project switching must not carry outgoing document contents or execution tabs into the destination project. Restoring the last-panel indicator does not move DOM focus; account changes clear remembered DOM input references.

Keep the last focused editor slot in the account's device-local desktop chrome. A valid preferred slot takes precedence during desktop hydration without changing the destination panes' active documents. The project ledger retains `focusedPaneId` for compatibility and mobile restoration. If the account's preferred slot is unavailable, fall back to the incoming mapped focus or the first slot. Restoring this selection does not take DOM focus.

## Alternatives and rationale

Keeping account/project layout keys would preserve the reported layout changes. Moving geometry to one account record on the server would make different devices overwrite each other's screen arrangements. Sharing project tab state would also mix independent work. An account-wide browser record preserves the device boundary while making project switching independent of geometry.

## Consequences

Panel moves and visibility changes on desktop apply to every project opened by that account in the same browser profile. Another account or device keeps its own arrangement. Clearing browser storage resets the remembered layout and focus. The first accepted project supplies the migration baseline; later projects retain the shared desktop geometry. Mobile restoration and project content ownership remain independent.

The [layout contract](../development/ui-workspace-layout.md#workspace-panel-layout) owns storage and restoration details; the [account tab contract](../development/account-tabs.md) owns shared tab metadata. Actual checks and remaining limits belong to the [work record](../work/account-desktop-layout.md).
