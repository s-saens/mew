---
title: "Terminal auxiliary key keyboard focus"
description: "Records the November 10 terminal auxiliary-key focus fix, local regression checks, and physical-device verification boundary."
created: "2026-11-10"
updated: "2026-11-10"
---

Mobile terminal auxiliary keys lost input focus because the enclosing agent panel blurred keyboard owners after button clicks. The in-flow key bar now opts into the panel's existing keyboard-preservation boundary. The [shared package contract](../development/packages.md#mobile-auxiliary-keys) describes the resulting behavior.

Local Chromium tests passed for the panel click path with focused and unfocused input, the terminal's key sequences and absence of redundant focus requests, and arrow gestures. `npm run build` passed, and lint completed with warnings. An initial broader agent-tab test timed out during tab navigation before reaching the new assertions; the focused panel test was then run independently. The repository documentation check reports 37 existing missing links, including `.mew/docs/MOC.md` and decision index paths. A physical mobile OS keyboard has not been verified; applying changes to a running instance remains user-owned.
