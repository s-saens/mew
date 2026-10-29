---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Keep the cursor separate even when Windows capture fails. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0146 — Keep the cursor separate even when Windows capture fails"
created: 2026-09-15
updated: 2026-09-15
---

- Status: Adopted
- Decision makers: User (requested a fix for the client cursor not being applied), Codex (implementation)
- Partially supersedes: The policy in [0144](0144-mew-desktop-local-cursor.md) of falling directly back to Chromium when Windows initialization fails

## Decision

If DXGI cannot provide an initial screen image or a separate cursor, use GDI screen copying and separate system cursor queries in a worker in the same login session. If GDI also fails, fall back to the existing Chromium capture. Show whether the cursor is separated in the connection help.

GDI reads the screen at up to 30Hz and does not feed identical pixels to the encoder again. Send the OS cursor's shape, hotspot, and position through existing cursor messages without drawing it onto the screen. Raw frames remain inside the helper, and existing WebRTC/VP8 transport is used. Do not use workarounds that globally hide the cursor or force screen updates through OS input. Do not expand access to the lock screen or secure desktop.

Repeated DXGI initial-frame failures caused the local cursor to be disabled on Windows connections. GDI has higher CPU read and comparison costs and may be unable to read some GPU/protected content, so use it only as a fallback path. Retain omission of unchanged video from network transmission and local cursor responsiveness.

References: [Microsoft screen capture](https://learn.microsoft.com/en-us/windows/win32/gdi/capturing-an-image), [CreateDIBSection](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createdibsection), [GetIconInfo](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-geticoninfo). Implementation and verification belong in the [development contract](../../development/remote-desktop.md),
and progress belongs in the [work document](../../work/remote-desktop-latency.md).
