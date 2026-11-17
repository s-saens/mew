---
title: "Development setup and rules"
created: 2026-09-29
updated: "2026-11-11"
description: "Repository execution rules: per-message Build/Deploy authorization, npm build and verification commands, separate launcher/server lifecycle restrictions, and required UI rules. Links isolated browser, Postgres, and CLI checks."
상위파일:
  - "../MOC.md"
  - "MOC.md"
---

[Installation and usage](../../../docs/guides/getting-started-en.md) · [Contributor setup](../../../docs/development/getting-started.md)

These rules govern **this Mew source repository**, not other projects opened in Mew.

## Execution and verification

**The current message's Build and Deploy selections are explicit user instructions.** They override older saved build/deploy requirements or prohibitions. The latest explicit user request takes precedence. Preserve saved account/project guidance when applying a selection; do not rewrite it merely to execute one message.

- **Build on:** use `npm run build` after implementation changes, fix failures, and rerun before completion. With **Build off**, do not run the project build, even if an older saved default requires it. Requests without execution options retain the repository's required-build default below.
- **Deploy on:** the user authorizes the task's documented deployment after applicable verification. Confirm the actual destination and credentials, perform the deployment, and verify its result. An older blanket deployment ban is not a reason to ask again. **Deploy off** excludes deployment unless the latest explicit user request directs it. Missing procedures, credentials, or provider permission remain real blockers.
- **Separate lifecycle operations:** neither selection authorizes the `mew` launcher or server start, stop, or restart. Those operations require a separate explicit user request. Examples include `npm start`, `npm run serve`, `npm run dev`, `./mew start|stop|restart|update`, background server starts, and killing server processes. Do not append them to a build or deployment.

Applicable tests, type checks, lint, documentation checks, target restrictions, and credential protection remain in force. Do not invent deployment commands or claim availability from command success alone. [ADR 0168](../decisions/0168-request-build-deploy-authorization.md) records the authorization correction.

| Change | Required verification |
| --- | --- |
| Code, features, dependencies, or build configuration | `npm run build` unless the current message disables it, plus applicable tests, type checks, lint, and documentation checks |
| Documentation only | `npm run check:docs`; no application build required |

When a build is selected or required by the legacy default, fix failures and rerun it. If a failure or missing prerequisite blocks verification, report the actual blocker and leave the work explicitly incomplete. Other checks do not replace a selected build; a deliberately disabled build is reported as skipped.

The running server serves `dist/` directly: a build updates UI assets without restarting the server or reloading server-side code. Do not chain a server operation to the build. Keep any development server private.

Mew's [configurable build guidance](../../../docs/guides/project-setup.md#build-verification) defines request selections across projects; this repository owns its concrete command, deployment workflows, and separate lifecycle restrictions. `.mew/agent-context.json` links this contract in additional project guidance.

Run repository-owned checks from the root:

```bash
npm run check:docs
```

This checks descriptions, including history, and local links. MOC registration is optional. Follow the [documentation rules](../README.md) and [feature ownership rules](../features/README.md); use `node server/document-descriptions.ts` to choose current owners before reading bodies. Update affected contracts, descriptions, and links with implementation changes. New decisions belong in [Mew's decision records](../decisions/MOC.md); imported records remain in history.

If this clone still uses a Liiiiv shared hook, remove that local setting with `git config --local --unset core.hooksPath`. Mew owns its rules and checks.

Normal UI tests launch test-owned headless Chrome/Chromium through the shared test helper; follow the [browser-testing prerequisites and limits](browser-testing.md). Browser tests under `server/` use the Node TypeScript configuration without DOM globals. In Playwright callbacks, use `locator.evaluate` and the element's `ownerDocument` rather than a direct `document` reference.

If a terminal edit unexpectedly reverts, an open Mew editor may have saved stale content. Recheck the file, then ask the user to close that editor or choose **Revert File**.

### Required UI rules

| Rule | Implementation |
| --- | --- |
| Compact working UI | Remove outer/decorative spacing before shrinking text or usable touch targets; avoid stacked padding and unnecessary minimum heights |
| Familiar actions use icon buttons | Use the established icon set, translated accessible name, shared tooltip, and small padding/gaps; retain text when it clarifies the action or consequence |
| Purposeful UI copy | Use the field/button label when sufficient; show extra text for a decision or recovery, rather than repeating controls or implementation details |
| App-owned choices | Native `<select>` and `<datalist>` popups are prohibited, even when restyled; reuse an existing custom control or create a shared one. Prefer `SelectField` from `@mew/ui` for single selection |

Follow the [density and button contract](ui-foundations.md#design-guidelines-spacing-and-information-density), [UI copy contract](ui-foundations.md#ui-copy), and [selection contract](ui-overlays.md#dropdowns-and-selection-components). Selection must preserve theme, keyboard/touch behavior, focus, Esc/Back dismissal, and viewport bounds.

### Postgres database verification

DB service, route, and row-page integration tests use only the isolated database explicitly named by `MEW_DB_TEST_DATABASE_URL`. They do not load `.env` or normal `DATABASE_URL`; without a dedicated URL, they are skipped. Tests create and clean up temporary projects and schemas. **Never supply a production database URL.**

```bash
MEW_DB_TEST_DATABASE_URL='<격리 테스트 DB URL>' node --test server/db/databaseService.test.ts server/db/routes.test.ts server/db/rowPages.test.ts
```

### CLI release verification

The [CLI distribution contract](cli-distribution.md) and [release procedure](../operations/cli-release.md) own release behavior.

These isolated checks do not alter the running server or `dist/`:

```bash
npm ci --prefix apps/cli --ignore-scripts
npm run test:cli
node --test server/cli-host.test.ts server/instance-lock.test.ts server/release-runtime.test.ts server/mew-release-actions.test.ts
```

`npm run release:runtime -- --output <폴더>` packages an already-built `dist/` and platform-native dependencies for release maintainers or CI. It neither replaces `npm run build` nor authorizes deployment or server lifecycle operations.
