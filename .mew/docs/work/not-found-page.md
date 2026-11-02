---
title: "Branded missing-page recovery"
description: "Records the 2026-10-30 implementation of Mew's themed 404 page, application-route classification and fallback status, isolated browser and regression checks, existing test failures, and the boundary before user-applied deployment."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Added a recognizable recovery screen for unknown URLs instead of opening the workspace and replacing the address. The large 404 graphic includes a tilted M, follows the existing palette and local fonts, and settles once unless reduced motion is enabled. The screen provides workspace recovery and browser back navigation, with translated copy in all four UI languages.

The browser and production fallback use the same route classifier. Unknown direct paths skip authentication and workspace imports, and the production fallback sets HTTP 404 while serving the application shell. Workspace, valid public-share, remote-frame, demo-base, and port-preview entry behavior follows the [current architecture contract](../development/browser-startup.md#application-routes-and-missing-pages). Existing share availability errors retain their own screen.

## Verification

- `node --test src/utils/app-route.test.ts src/utils/public-share-route.test.ts src/not-found.browser.test.ts src/i18n.test.ts packages/ui/src/i18n.test.ts`: passed 10 tests. The browser fixture compiled the real entry point in memory, replacing only the downstream workspace, share viewer, and remote initializer. It checked recovery links, browser back, saved light/dark themes, keyboard focus, 44px targets, 1440/390/320px widths, four languages, reduced and normal motion, malformed shares, valid share entries, and preservation of workspace/preview/remote entry selection. No production assets were written.
- Inspected desktop and mobile captures for both themes. An independent reviewer returned `ship` with no blocking findings and suggested keeping Korean words together; the paragraph now uses Korean-specific word wrapping while retaining the 320px overflow check.
- `npx tsc -b`: passed. Oxlint with `--deny-warnings` on the changed code and tests: passed. `impeccable detect --json` on the new component and stylesheet returned no findings.
- `npm run check:docs`: passed with 582 descriptions and no metadata or link errors. `git diff --check` passed for this task's paths.
- The broader startup/localization check passed 9 of 12 tests. Two startup checks fail because the existing public-share graph couples workspace dependencies and includes editor modules in the fixture. An isolated test copy loading the pre-change `HEAD` entry point and share-route helper reproduced both failures. The third failure reports existing untranslated literals across unchanged source files; the new page uses translated messages.

These checks validate isolated rendering and route selection. They do not validate live HTTP responses, a real remote connection, or deployment. No app build, deployment, launcher invocation, or app-server start, stop, or restart was performed. The user must build and apply the frontend and server changes before they appear in the running instance.
