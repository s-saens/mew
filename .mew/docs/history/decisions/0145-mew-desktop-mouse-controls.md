---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Arrange remote joysticks in a mouse layout. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0145 — Arrange remote joysticks in a mouse layout"
created: 2026-09-15
updated: 2026-09-15
---

- Status: Adopted
- Decision maker: User (requested a mouse layout, a cursor-only joystick, and immediate dragging)
- Partially supersedes: The mobile control layout and left/right joystick movement behavior in [0136](0136-mew-native-remote-desktop-webrtc.md)

## Decision

Place Left Click (1), Wheel (2), and Right Click (3) on top, with Move Cursor (0) spanning all three columns below, forming a single mouse layout. Place Pan Screen (4) and Zoom (5) separately beside it, and use the final handle to move the entire control.

0 moves only the cursor without clicking. 1 and 3 click on a short tap; when movement starts, they immediately drag with the corresponding button held down. Release the button when the user lifts their finger or cancels. Retain 2's tap, vertical scrolling, and middle-button dragging after a long press, along with local operations for 4 and 5. Do not change the input protocol, capture, permissions, or session lifetime.

Separate cursor movement into its own area to eliminate the long-press wait for left- and right-button dragging, and align the layout with physical mouse buttons. Keep detailed behavior and verification in the [project development contract](../../development/remote-desktop.md), and usage instructions in the [controls guide](../../../../docs/guides/remote-desktop.md#controls).
