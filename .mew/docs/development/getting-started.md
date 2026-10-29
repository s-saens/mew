---
title: "Development setup and rules"
created: 2026-09-29
updated: "2026-10-26"
description: "Defines development commands; repository-internal document checks, CLI and isolated Postgres tests, type checks, tests, and lint validation; restrictions on agent builds and server execution limited to this Mew source repository; document ownership and updates; required UI implementation rules; and ownership of feature documentation after removal of the feature panel."
상위파일:
  - "../MOC.md"
  - "MOC.md"
---

[Installation and usage](../../../docs/guides/getting-started-en.md)

Development environment setup and standard commands are in the [public contributor guide](../../../docs/development/getting-started.md).

The server serves `dist/` directly. Building changes what a running instance serves; it is not an isolated validation step. Keep the development server private.

Mew owns its development rules, documentation, and decision records. Run documentation checks from the repository root without another workspace's scripts or hooks:

```bash
npm run check:docs
```

This checks descriptions, including history, and local links within the repository. MOC registration is optional. Repair existing links when files move. New decisions belong in [Mew's decision records](../decisions/README.md); imported decisions remain in history. If this clone still has a Liiiiv shared hook configured, remove that local setting with `git config --local --unset core.hooksPath`.

**In this Mew source repository, coding agents must not run** `mew`**, build, deploy, or restart the server.** This includes `npm run build`, `npm start`, `./mew start|stop|restart|update`, killing server processes, and starting them in the background. Agents may run checks that leave the running instance alone, such as `npm test`, `npm run lint`, and `npx tsc -b`. The user runs builds and applies changes. These restrictions belong to this project's instructions; do not add them to Mew-wide agent guidance or apply them to other projects opened in Mew.

Browser tests under `server/` use the Node.js TypeScript configuration, which excludes DOM globals. For DOM operations in Playwright callbacks, use `locator.evaluate` and its element argument (or `el.ownerDocument`) instead of directly referencing `document`.

If a file edited from the terminal reverts unexpectedly, an open mew editor may have saved an older copy over it. Check the file again, then ask the user to close that editor or use **Revert File**.

For feature work, select the owning current document from its frontmatter `description` using `node server/document-descriptions.ts`. Follow the [documentation rules](../README.md); MOC registration is optional. Keep the feature's scope, detailed behavior, implementation notes, and acceptance criteria in the owning feature document; update linked shared contracts when they change. Follow the [feature documentation rules](../features/README.md).

### Required UI rules

**Keep working UI compact.** Avoid decorative whitespace, stacked container padding, and unnecessary minimum heights. Reduce outer spacing before shrinking readable text or usable click/touch targets. Follow the [spacing and information density rules](ui-contracts.md#design-guidelines-spacing-and-information-density).

**Prefer icon buttons for familiar actions.** Close, refresh, copy, cancel, and disconnect controls should normally use the established icon set with a translated accessible name and a shared tooltip. Keep short text where an icon alone makes the primary action or its consequences unclear. Use small padding and gaps by default; see the [UI button and spacing contract](ui-contracts.md#design-guidelines-spacing-and-information-density).

**Do not add permanent instructions, shortcut hints, or explanatory copy that repeats what the interface already makes clear.** Use the button or field label when it is enough. Show additional information where it helps someone decide or recover from an error. See [UI copy](ui-contracts.md#ui-copy).

**Do not use native** `<select>` **or** `<datalist>` **popups for app-owned choices.** Reuse an existing custom component, or create a shared one if none fits. Changing a native control's border or `appearance` does not satisfy this rule. It applies on desktop and mobile, including when modifying an existing native dropdown.

Prefer `SelectField` from `@mew/ui` for single-choice fields. Follow the [selection component contract](ui-contracts.md#dropdowns-and-selection-components) for themes, keyboard and touch input, focus, Esc/Back dismissal, and viewport boundaries.

### Postgres database verification

DB service, route, and row page integration tests use only the isolated test DB explicitly specified by `MEW_DB_TEST_DATABASE_URL`. They do not automatically use `.env` or `DATABASE_URL` from the normal runtime environment and are skipped if no dedicated URL is provided. Tests create temporary projects and schemas and clean them up on completion. Do not specify a production DB URL.

```bash
MEW_DB_TEST_DATABASE_URL='<격리 테스트 DB URL>' node --test server/db/databaseService.test.ts server/db/routes.test.ts server/db/rowPages.test.ts
```

### CLI release verification

The canonical sources for the prebuilt launcher are the [CLI distribution contract](cli-distribution.md) and [release procedure](../operations/cli-release.md). `npm ci --prefix apps/cli --ignore-scripts`, `npm run test:cli`, and `node --test server/cli-host.test.ts server/instance-lock.test.ts server/release-runtime.test.ts server/mew-release-actions.test.ts` are isolated checks that do not modify the actual server or dist. `npm run release:runtime -- --output <폴더>` is a command for release maintainers/CI that packages an already-built dist and platform-specific native dependencies; it does not change the rule prohibiting agents from building, deploying, or restarting the app.
