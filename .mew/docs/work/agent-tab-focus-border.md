---
title: "Agent tab bar focus border"
description: "Work record for keeping the agent and terminal tab bar focus border visible above its contents, with local verification and limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The agent and terminal tab bars restore focus after tab operations, but their browser focus outline could be obscured by the panel handle and selected tab. The [tab creation contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md) now specifies a visible border above those contents. A pointer-transparent overlay preserves the existing controls.

Local verification: `npm run build` passed, including TypeScript checks. `npm run lint` passed with existing warnings. `server/agent-tab-focus-ui.test.ts` passed in headless Chromium at desktop and mobile widths in light and dark themes, checking focus, overlay placement and pointer access. The broader `server/agent-new-tab-ui.test.ts` timed out during tab switching before the focus checks; the same timeout occurred with the unmodified test and stylesheet. `npm run check:docs` found 39 existing repository link errors; description validation passed. No deployment or server lifecycle operation was performed.
