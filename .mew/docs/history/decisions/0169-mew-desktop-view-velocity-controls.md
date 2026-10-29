---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Wheel, pan, and zoom use velocity controls proportional to displacement from the center. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0169 — Wheel, pan, and zoom use velocity controls proportional to displacement from the center"
created: 2026-09-23
updated: 2026-09-23
---

- Status: Adopted
- Decision maker: User (requested joystick-style velocity controls for wheel, pan, and zoom)
- Partially supersedes: [0154](0154-mew-desktop-touchpad-motion.md) — displacement-based controls for regular wheel, pan, and zoom

## Background

The user requested continuous remote desktop wheel, pan, and zoom control by holding in a direction instead of repeatedly pushing.

## Decision

Regular wheel, pan, and zoom interpret displacement from the control's center as velocity. They stop near the center, move faster the farther the control is pushed, and continue operating while it is held away from the center. They stop immediately on release or input cancellation. Wheel and zoom use only the vertical axis.

Cursor movement, left/right button dragging, and middle-button dragging after a wheel hold retain the existing touchpad displacement and velocity acceleration behavior. Retain tap/hold distinctions, arrow-key controls, and input release and transmission contracts. Permission to reintroduce velocity controls is limited to the three requested operations.

## Rationale

Preserve the existing method for precise pointer positioning while allowing continuous scrolling and view navigation without repeatedly swiping a finger.

Values and verification are defined in the [Development contract](../../development/remote-desktop.md), and operating instructions in the [Usage guide](../../../../docs/guides/remote-desktop.md).
