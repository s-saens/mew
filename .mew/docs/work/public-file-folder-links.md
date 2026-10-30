---
title: "Public file and folder links work record"
description: "Records the 2026-10-30 public file/folder link implementation and follow-up for blank direct deep links: startup asset URL correction, regression checks, and read-only evidence that deployed Mewlink lacks the public routes and handoff. Distinguishes local verification from pending host and central application."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Add public viewing and editing links for files and folders without exposing the full workspace. Owners and managers publish through the explorer's Public dialog. Explicitly published items show an eye or pencil; revocation deletes the record and removes its badge. File URLs open a minimal document/source editor, while directory URLs add a lazy explorer confined to the published folder.

The implementation adds a separate capability API and private persistent records, live publishing-account checks, filesystem confinement, versioned saves, draft preservation on conflict, and sandboxed media delivery. Mewlink carries the public path into the app and admits only exact capability endpoints without local login. Public pages recheck publication on focus and every 15 seconds while visible. Source editors on public pages disable ordinary authenticated server lint requests.

Current behavior belongs to the [feature contract](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md#public-file-and-folder-links), [access contract](../development/access-control.md#public-capability-links), [connection contract](../development/remote-access.md#public-file-and-folder-links), and [decision 0097](../decisions/0097-public-file-folder-links.md).

## Verification

- Backend integration checks cover publication modes, persistence, explicit tree badges, revocation and fresh IDs, existing-text writes, version conflicts, binary/raw responses, malformed paths, traversal, secrets, server data, symbolic links, workspace/root isolation, creator permission changes, and remote capability revocation. The public browser fixture also verifies that unsupported binary files offer a scoped download instead of an editor error.
- Management browser checks cover desktop/mobile, four UI languages, mouse and long-press menus, copy/open controls, MOC/document pages, loading/save failures, and role restrictions.
- Save-model regressions verify serial version updates, edits entered during an in-flight write, and preservation of drafts after failed saves. Route regressions verify exact typed URL parsing and link resolution confined to the publication root.
- Transport checks cover exact anonymous HTTP admission, denied ordinary APIs and WebSockets, connection lifetime past the unauthenticated grace period, revocation, raw security headers, launcher role selection, remote context handoff, and public URL origins.
- The private central Worker check and targeted launcher route test passed. The route fixture includes file and directory public GET/HEAD entrypoints. Central checks do not build or deploy the service.

### Executed checks

- `node --test server/public-shares.test.ts server/remote-public-shares.test.ts server/remote-public-share-ui.test.ts src/utils/public-share-url.test.ts server/remote-local-auth.test.ts server/remote-mewlink-auth.test.ts server/remote-access.test.ts`: 37 passed, no failures or skips. After the final backend/transport corrections, `node --test server/public-shares.test.ts server/remote-public-shares.test.ts server/remote-launcher-role.test.ts` passed all 6 checks.
- `node --test src/api/public-shares.test.ts server/public-share-management-ui.test.ts`: 3 passed. The management fixture also passed after adding recovery for an invalid remote public base and correcting Node-compatible touch constructors.
- `node --test src/utils/public-share-document.test.ts src/utils/public-share-route.test.ts`: 4 passed.
- `node --test src/api/public-share-content.test.ts src/components/public-share-page.browser.test.ts src/workspace-startup.browser.test.ts`: 6 passed, including existing desktop/mobile startup checks. The public entry fixture uses the real main entrypoint, Markdown editor, and source editor, and rejects normal workspace authentication imports.
- `npm --prefix mewlink run check`: passed. `npm --prefix mewlink test -- test/worker.test.ts -t 'launcher pages serve HTML'`: 1 passed and 9 intentionally filtered skips.
- `npx tsc -b`: passed. Targeted oxlint reported no errors; existing CodePane warnings remain. The Impeccable detector reported no findings for the management controls and public entry/editor targets.
- `npm run check:docs`: passed with 580 descriptions, no metadata errors, and no broken local links. Changed local anchors were also inspected directly.

## Application and limitations

No app build, deployment, launcher execution, or server start/restart was performed. The user must build and apply the host changes. Mewlink additionally needs the separate central source changes applied from the excluded `mewlink/` directory; those files are not included in the host Git commit. Localhost and custom-domain links use the current origin, which visitors must be able to reach.

File links do not publish sibling resources. Directory links restrict local resources to the shared root. Public editing does not provide real-time collaboration, uploads, comments, database operations, or file creation/deletion/renaming. Live external-network and physical-device checks remain pending.

## Follow-up: blank direct links and Mewlink 404

The user reported a blank page through a tunnel and a missing page through Mewlink. A read-only check against the already running local instance reproduced the direct failure: a public URL returned HTML containing `./assets/index-….js`, which resolved under `/share/f/assets/`. That script request received HTML rather than JavaScript. The earlier browser fixture used root-level script URLs and did not reproduce the generated production HTML's relative asset layout.

`server/direct-ui.ts` now transforms startup resource attributes only in direct SPA responses. Script, stylesheet, and module-preload URLs resolve from the host root at nested entrypoints; document anchors, relative document links, inline script text, and saved artifacts are preserved. The Mewlink resource router continues reading the original relative build output. The existing themed-404 routing from concurrent work is preserved.

Read-only Mewlink checks used synthetic device names and capability IDs. The deployed service returned 200 for a device launcher but 404 with an empty body for both typed public paths. Its served connection bundle lacked the `sharePath` handoff present in current private source. This confirms that the central Worker and connection frontend need separate user deployment; host source changes alone cannot make those deployed routes available.

Follow-up checks:

- `node --test server/public-share-entry-ui.test.ts`: 2 passed. Chromium loads root, file, and directory entrypoints through real Express/static handlers and an in-memory HTTP connection, including generated relative scripts, styles, and a dynamic import. Assertions cover HEAD responses, cache headers, unchanged artifacts, and preservation of document links and inline code. The fixture opens no listening server and does not modify the running instance.
- `npx tsc -b` and targeted oxlint for the response helper and regression fixture passed.

The source fix has not been applied to the running host, and no central deployment was performed. The user must apply the host server change and deploy the current central Worker/frontend before verifying both public entrypoints again.
