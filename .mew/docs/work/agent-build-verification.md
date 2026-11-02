---
title: "Mandatory agent build verification"
description: "Records the 2026-10-31 repository build requirement and the 2026-11-02 move to configurable default Mew guidance, with implementation, local verification, and user-owned server application boundaries."
created: "2026-10-31"
updated: "2026-11-02"
---

## Purpose and result

At the user's explicit request, replace the agent build prohibition with a mandatory build after code, feature, dependency, or build configuration changes. Fix and rerun failed builds before completion, or report an actual blocker as incomplete work. Keep deployment, launcher execution, and server start/stop/restart restricted to the user.

The [execution rules](../development/getting-started.md) and [ADR 0104](../decisions/0104-required-agent-build-verification.md) own the policy. Repository entrypoints and `.mew/agent-context.json` now carry the same requirement, including injected project guidance. Conflicting current build prohibitions were updated; historical reports of work performed without builds remain unchanged. Unrelated pending edits were preserved.

## Checks and application boundary

- `npm run build` passed on the current checkout: TypeScript succeeded and Vite transformed 4,696 modules and generated production assets. Vite reported chunk-size warnings; no build error was reproduced.
- `npm run check:docs` passed 602 descriptions and all local links; `git diff --check` passed.
- The build updated `dist/`, including the DOM browser assets, as authorized. Build success does not establish server-side runtime or remote deployment success.
- No server was started, stopped, or restarted; no launcher or deployment command was run.

## 2026-11-02: Configurable default build verification

Move the general completion rule from this repository's additional project instructions into Mew's account-wide defaults. The [user guide](../../../docs/guides/project-setup.md#build-verification), [session contract](../development/agent-guidance.md#passing-project-context), and [ADR 0116](../decisions/0116-configurable-agent-build-verification.md) own the current behavior and rationale. The earlier sections above record the original repository-only change.

Default instructions now expose required build verification, an optional command, implementation or all-change scope, and repair-and-rebuild or failure-report behavior. Empty commands follow each project's existing build process. Projects without a build system report verification as not applicable. Missing settings in existing accounts receive effective defaults without rewriting saved files or revisions; custom instructions and damaged sections are preserved. The settings form uses the existing revision API, autosave, conflict reporting, and draft-discard guards.

Removed the redundant build bullet from `.mew/agent-context.json`. Repository entrypoints retain `npm run build` as Mew's concrete command and preserve the prohibition on agent deployment, launcher execution, and server lifecycle operations. Other projects' saved instructions were not migrated.

Local checks:

- `npm run build` passed, including TypeScript and production asset generation; Vite retained its chunk-size warnings.
- Backend, context, account, branch, retry, and project-setup regression tests passed across eight test files, including the new build-setting validation tests.
- `node --test server/agent-build-verification-ui.test.ts` and `node --test server/agent-guidance-ui.test.ts` each passed. Isolated Chromium checked 1100, 390, and 320px widths in light and dark themes, autosave, retained settings and drafts, invalid-input recovery, transient save retries, conflict reloads, and custom instructions. Desktop and mobile screenshots were also inspected; these fixtures do not verify a physical device or a running Mew server.
- `npm run lint` passed with existing warnings. Documentation description/link checks and `git diff --check` passed.

The build updates the assets served from `dist/`; it does not apply server-side code to an already running process. The user must apply those changes through their normal server lifecycle procedure. No deployment, launcher, or server lifecycle command was run.
