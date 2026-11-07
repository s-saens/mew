---
title: "Agent composer defaults"
description: "Implementation and local verification of account- and runtime-specific composer defaults for model, effort, permission, Build, and Deploy."
created: "2026-11-07"
updated: "2026-11-07"
---

The composer saves its five selected settings together for the current account and runtime. New tabs inherit saved execution choices when they have no local choice; existing tab choices and message snapshots remain separate. The [decision](../decisions/0154-agent-composer-defaults.md) records the storage and compatibility tradeoff, and the [feature contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) owns current behavior.

Local verification: `npm run build` passed; the account/default and composer UI tests passed; `npm run lint` completed with warnings. `npm run check:docs` passed metadata validation but reported 37 missing targets in other documents. No deployment or server lifecycle operation was performed. Real provider sessions and physical devices were not tested.
