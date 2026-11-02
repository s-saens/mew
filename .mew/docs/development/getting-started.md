---
title: "Development setup and rules"
created: 2026-09-29
updated: "2026-11-03"
description: "Repository execution restrictions, required build and verification commands, and UI implementation rules. Links isolated Postgres and CLI checks and Mew's documentation ownership."
상위파일:
  - "../MOC.md"
  - "MOC.md"
---

[Installation and usage](../../../docs/guides/getting-started-en.md) · [Contributor setup](../../../docs/development/getting-started.md)

These rules govern **this Mew source repository**, not other projects opened in Mew.

## Execution and verification

**Agents must not deploy, run the `mew` launcher, or start, stop, or restart servers.** The user performs those operations. Prohibited examples include `npm start`, `npm run serve`, `npm run dev`, `./mew start|stop|restart|update`, background server starts, and killing server processes.

| Change | Required verification |
| --- | --- |
| Code, features, dependencies, or build configuration | `npm run build`, plus applicable tests, type checks, lint, and documentation checks |
| Documentation only | `npm run check:docs`; no application build required |

Fix build failures and rerun the build. If a failure or missing prerequisite blocks verification, report the actual blocker and leave the work explicitly incomplete. Other checks do not replace the build.

The running server serves `dist/` directly: a build updates UI assets without restarting the server or reloading server-side code. Do not chain a server operation to the build. Keep any development server private.

Mew's [configurable default build guidance](../../../docs/guides/project-setup.md#build-verification) serves other projects; this repository owns the concrete command and stricter execution restrictions. The former duplicate rule in `.mew/agent-context.json` was removed.

Run repository-owned checks from the root:

```bash
npm run check:docs
```

This checks descriptions, including history, and local links. MOC registration is optional. Follow the [documentation rules](../README.md) and [feature ownership rules](../features/README.md); use `node server/document-descriptions.ts` to choose current owners before reading bodies. Update affected contracts, descriptions, and links with implementation changes. New decisions belong in [Mew's decision records](../decisions/README.md); imported records remain in history.

If this clone still uses a Liiiiv shared hook, remove that local setting with `git config --local --unset core.hooksPath`. Mew owns its rules and checks.

Browser tests under `server/` use the Node TypeScript configuration without DOM globals. In Playwright callbacks, use `locator.evaluate` and the element's `ownerDocument` rather than a direct `document` reference.

If a terminal edit unexpectedly reverts, an open Mew editor may have saved stale content. Recheck the file, then ask the user to close that editor or choose **Revert File**.

### Required UI rules

| Rule | Implementation |
| --- | --- |
| Compact working UI | Remove outer/decorative spacing before shrinking text or usable touch targets; avoid stacked padding and unnecessary minimum heights |
| Familiar actions use icon buttons | Use the established icon set, translated accessible name, shared tooltip, and small padding/gaps; retain text when it clarifies the action or consequence |
| Purposeful UI copy | Use the field/button label when sufficient; show extra text for a decision or recovery, rather than repeating controls or implementation details |
| App-owned choices | Native `<select>` and `<datalist>` popups are prohibited, even when restyled; reuse an existing custom control or create a shared one. Prefer `SelectField` from `@mew/ui` for single selection |

Follow the [density and button contract](ui-contracts.md#design-guidelines-spacing-and-information-density), [UI copy contract](ui-contracts.md#ui-copy), and [selection contract](ui-contracts.md#dropdowns-and-selection-components). Selection must preserve theme, keyboard/touch behavior, focus, Esc/Back dismissal, and viewport bounds.

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
