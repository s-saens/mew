---
title: "Project sidebar title alignment"
description: "Records the project sidebar title height correction, font-size regression coverage, and local verification limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The desktop project sidebar title used a fixed pixel height while adjacent workspace title bars followed the root font size. It now follows the same spacing scale as the file explorer, as specified in the [project navigation contract](../development/ui-project-navigation.md#header-project-switcher).

The App browser regression passed with root font sizes of 16, 20, and 24 pixels, comparing the title's position and height with the file explorer. `npm run build`, `npx tsc -b`, and `npm run lint` passed; lint reported warnings. The documentation description check passed, while the link check reported 39 existing errors involving missing paths and a task asset URL. The build updated local `dist/`; no server was restarted and no deployment was performed. The running workspace was not manually checked.
