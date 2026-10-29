---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Remember workspace layouts per device. Preserves the choices, rationale, and subsequent changes at the time; consult Mew's owning documents for current contracts."
title: "0197 — Remember workspace layouts per device"
created: 2026-10-06
updated: 2026-10-06
---

- Date: 2026-10-06
- Status: Adopted
- Partially supersedes: [0094](0094-mew-account-synced-workspace-ui-state.md) — Restoration priority for docking, document tabs, and auxiliary panel open/closed states
- Partially supersedes: [0134](0134-mew-dockable-workspace-panels.md) — Storage ownership of the shared workspace panel layout
- Decision makers: User (requested remembering position and size per device), Codex (implementation)

## Background

When the same account's layout on desktop and mobile or on different PCs is overwritten by the last saved value, positions and sizes adjusted for the screen size and workflow are lost. The user requested remembering layouts per device and displaying notes and tasks as popups on PCs.

## Options

1. Restore only the account's last layout — makes it easy to resume on a new device, but device-specific layouts overwrite one another.
2. Restore the browser-specific layout first and use the account ledger as the initial value — preserves per-device layouts and lets new devices start from existing work.

## Decision

Adopt option 2.

- Store the docking tree, ratios, and tab assignments; document tabs, splits, and active document; and auxiliary panel open/closed states locally in the browser under an account and root project key, and prioritize them during restoration.
- Devices without a local record use the existing account ledger as the initial value. Keep saving the server ledger for compatibility and initialization of new devices; it does not overwrite local layouts on existing devices.
- Preserve existing ownership of agent and terminal execution sessions, account tab lists, and file tree, feature, and Git state. Moving a panel or switching it to a popup does not terminate execution sessions.
- Remember the PC display mode and popup size and position for notes and tasks in the browser. Mobile retains the full-screen panel contract and does not overwrite PC popup coordinates.
- Do not collect a separate hardware identifier. The browser profile/site storage defines the device boundary; clearing it also resets the remembered state. Do not use IP addresses as layout storage keys.

## Rationale

Layouts depend on the screen and input method. Applying local priority while retaining initial restoration from the existing account ledger provides the requested independent layout memory without introducing device registration or additional personal information on the server.

Current implementation and validation follow the [Mew UI contracts](../../development/ui-contracts.md#workspace-panel-layout).
