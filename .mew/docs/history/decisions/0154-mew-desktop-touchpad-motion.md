---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Remote controls follow movement distance like a touchpad. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0154 — Remote controls follow movement distance like a touchpad"
created: 2026-09-16
updated: 2026-09-23
---

- Status: Adopted
- Follow-up decision: [0169](0169-mew-desktop-view-velocity-controls.md) — Regular wheel, panning, and zoom use velocity controls based on displacement from the center; retain cursor and button dragging
- Decision maker: User (requested pointer movement only by the distance moved, instead of a velocity joystick)
- Partially supersedes: Mobile joystick velocity gain in [0136](0136-mew-native-remote-desktop-webrtc.md)

## Decision

Mobile controls use the difference from the previous input position as movement distance, rather than interpreting displacement from the initial press point as velocity. When the finger stops, cursor movement, dragging, scrolling, panning, and zooming also stop. Lifting and touching again establishes a new input reference point without moving the cursor back. The visual handle's movement radius does not limit the actual input distance.

Retain the mouse-shaped layout, tap-to-click, immediate left/right button dragging, wheel hold dragging, arrow-key controls, and input release contract from [0145](0145-mew-desktop-mouse-controls.md). Do not change the input protocol, transport, or capture.

## Rationale

Continuous movement while holding the control displaced makes precise positioning difficult. Switch to distance-based movement so that stopping the finger also stops remote control. Do not reintroduce the previous velocity-based behavior without a user request.

Keep sensitivity, thresholds, and verification in the [development contract](../../development/remote-desktop.md), and user controls in the [usage guide](../../../../docs/guides/remote-desktop.md#controls).
