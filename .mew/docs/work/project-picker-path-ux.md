---
title: "Project picker path and folder UX"
description: "Records the 2026-10-31 path-first project dialog, immediate folder suggestions, keyboard and touch handling, edited-path safeguards, selection after creation or cloning, local checks, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and result

Made Add Project easier to scan and use by putting the labelled path field first, grouping favorites and folder/Git actions in a compact toolbar, and placing the target folder beside the primary Open button. The folder list scrolls independently. The server file browser shares the path field and compact navigation.

Enabled project path suggestions, which were previously disabled. Known child folders are filtered immediately without another request; other paths request suggestions without the former 100 ms delay. The custom combobox provides loading, empty, and error feedback, keyboard selection, mouse and touch selection, IME safeguards, and nested Esc/Back dismissal. Suggestions stay within the modal and viewport. Relative paths use the displayed folder as their base, and stale responses cannot replace a newer query.

Opening after editing a path validates and opens that folder. Relative targets are resolved consistently in the footer and Open action; empty paths disable Open. A pending listing cannot overwrite subsequent typing. Creating a folder or cloning a repository selects the API's returned folder without opening the project automatically. The suggestions endpoint now accepts server file access as well as its existing agent or terminal permissions; it does not grant agent-session cwd validation.

Current behavior belongs to the [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md), [shared UI contract](../development/ui-contracts.md#shared-ui-for-adding-projects-and-browsing-server-files), and [public project guide](../../../docs/guides/projects.md#프로젝트-탭).

## Verification and application

- Isolated Chromium verifies immediate known-folder suggestions without extra requests; raw Enter versus arrow-selected navigation; relative paths; IME; out-of-order responses; loading, empty, and error states; nested Esc/Back; Tab; mouse selection; and touch selection after scrolling.
- Project dialog checks cover preserved typing during the initial listing, validation before opening an edited path, automatic folder/clone selection, existing creation errors and missing-path confirmations, favorites, context menus, and server file operations.
- Desktop and mobile checks cover light/dark themes, initial title focus, contained dropdowns, scrolling, long paths, visible primary actions, and dialog bounds down to 320px. Reviewed desktop/mobile picker and focused dropdown captures. Physical-device and real-network latency measurements remain outstanding.
- `node --test server/project-dialog-ui.test.ts server/project-picker-path-ui.test.ts server/file-browser-path-ui.test.ts src/components/file-browser-path-suggestions.test.ts server/access-policy.test.ts server/agentCwd.test.ts`: 10 passed, none skipped.
- `npx tsc -b`: passed. Targeted oxlint on the changed TypeScript and TSX files: no errors; existing React effect/ref warnings remain.
- `npm run check:docs`: 600 descriptions checked, zero metadata or local-link errors. `git diff --check`: passed.
- Independent review found a mismatch for a cleared path; Open is now disabled for blank input, and the same resolved path drives the footer and action. The picker regression also checks blank inputs and relative target display. The follow-up `node --test server/project-picker-path-ui.test.ts server/file-browser-path-ui.test.ts` passed both checks with no skips.
- The mechanical design detector reported no findings in the changed UI components.

All browser fixtures bundle into memory and leave `dist/` and the running instance untouched. No app build, deployment, launcher, server start, stop, or restart was performed. The user must build and apply the changes.
