---
title: "Mandatory agent build verification"
description: "Records the 2026-10-31 change requiring implementation builds while preserving server lifecycle restrictions, synchronization of repository and injected project guidance, and the successful production build following a reported error."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and result

At the user's explicit request, replace the agent build prohibition with a mandatory build after code, feature, dependency, or build configuration changes. Fix and rerun failed builds before completion, or report an actual blocker as incomplete work. Keep deployment, launcher execution, and server start/stop/restart restricted to the user.

The [execution rules](../development/getting-started.md) and [ADR 0104](../decisions/0104-required-agent-build-verification.md) own the policy. Repository entrypoints and `.mew/agent-context.json` now carry the same requirement, including injected project guidance. Conflicting current build prohibitions were updated; historical reports of work performed without builds remain unchanged. Unrelated pending edits were preserved.

## Checks and application boundary

- `npm run build` passed on the current checkout: TypeScript succeeded and Vite transformed 4,696 modules and generated production assets. Vite reported chunk-size warnings; no build error was reproduced.
- `npm run check:docs` passed 602 descriptions and all local links; `git diff --check` passed.
- The build updated `dist/`, including the DOM browser assets, as authorized. Build success does not establish server-side runtime or remote deployment success.
- No server was started, stopped, or restarted; no launcher or deployment command was run.
