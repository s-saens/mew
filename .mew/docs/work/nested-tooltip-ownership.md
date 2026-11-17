---
title: "Nested tooltip ownership"
description: "Records the project selector's duplicate tooltip fix, local browser regression checks, and verification limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The project command button was inside two hover tooltip layers, so both displayed its label. The closest layer now owns the target's tooltip and placement, as specified in the [shared UI contract](../development/ui-foundations.md#prefer-icon-buttons).

Local verification passed for the fixed-popup browser regression, `npx tsc -b`, and `npm run build`. `npm run lint` passed with warnings. The documentation description check passed; the link check reported 39 existing errors involving missing paths and a task asset URL. The build updated local `dist/`; no server was restarted and no deployment was performed. The actual project selector was not manually verified in a running instance.
