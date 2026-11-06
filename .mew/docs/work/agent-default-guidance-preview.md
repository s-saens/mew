---
title: "Default guidance previews"
description: "Implementation and local verification of localized previews for code quality and documentation default guidance in agent settings."
created: "2026-11-06"
updated: "2026-11-06"
---

The code quality and documentation default-guidance options expose a T button to show the instruction in the interface language. The preview does not select the option or change the English instruction sent to agents. The [guidance contract](../development/agent-guidance.md) owns the current behavior.

Local verification: `npm run build` and `npx tsc -b` passed. The guidance UI regression test passed at desktop and mobile widths. Targeted `oxlint` completed with three existing warnings in the shared select component. `npm run check:docs` passed all description checks but reported 39 existing missing links outside this change. The build updates the served `dist/` assets; no deployment or server lifecycle operation was performed.
