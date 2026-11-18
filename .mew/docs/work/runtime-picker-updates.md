---
title: "Runtime picker update actions"
description: "Records lazy update discovery and individual update actions in the runtime picker, local verification, and application limits."
created: "2026-11-18"
updated: "2026-11-18"
---

The runtime picker now renders its installed runtimes before update discovery finishes. Available, automatically supported updates appear on installed rows and use the existing individual update jobs. Codex and Claude refer to their host CLIs. The [runtime contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) and [user guide](../../../docs/configuration/agent-runtimes.md) describe the behavior and permission boundary.

Local verification: `npm run build` passed, including TypeScript; `npm run lint` passed with warnings. An isolated browser test passed for deferred discovery, unavailable updates, CLI mapping, and execution errors. The existing `server/updates.test.ts` had eight passes and one failure: its release installer expectation still names the former npm package. `npm run check:docs` validated descriptions but reported 39 existing missing or invalid links, including the absent decisions README. No provider update or deployment was performed. The build updates client assets served from `dist`; server lifecycle operations were not performed. Real provider updates and device presentation remain unverified.
