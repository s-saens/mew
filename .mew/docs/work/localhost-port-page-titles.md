---
title: "Localhost port page titles"
description: "Records the 2026-11-03 addition of HTML page titles and the follow-up name-first port tags with actual process-name fallbacks, bounded metadata lookup, local verification, and user-owned server application limits."
created: "2026-11-03"
updated: "2026-11-03"
---

## Purpose and result

The user requested app names in the internal browser's port list. Eligible ports now show their root HTML page title beside `localhost:<port>`. Refresh updates both values; long titles truncate within the row and use the shared tooltip. Missing titles leave the port selectable. The list still starts no Chromium context and executes no app scripts.

The [port-discovery contract](../development/port-preview.md#host-port-discovery) owns lookup limits, optional response fields, cancellation, and access boundaries. [Decision 0123](../decisions/0123-localhost-port-page-titles.md) records the bounded HTTP enrichment exception to the original discovery policy. The [browser guide](../../../docs/guides/browser.md#find-running-localhost-apps) explains usage and title availability.

## Local verification

- The eight discovery/API tests passed, including optional title responses, policy changes during lookup, authentication failure, and existing OS discovery and scan recovery.
- All nine UI checks passed, including desktop/mobile title layout, invalid title values, text-only rendering, long-title truncation, refresh, selection, stale results, and existing failure recovery. Desktop and mobile title screenshots were inspected outside the repository. The UI detector reported no findings.
- All nine title-module tests passed, covering HTML entities and Unicode, inert parsing, redirect guards including empty credentials, live permission checks, compressed size limits, IPv6 fallback, concurrency, deadlines, and cancellation cleanup. The final combined run passed all 26 tests without skips.
- `npm run build` passed, including TypeScript checks, with the existing large-chunk warning. `npm run lint` passed with existing React warnings; focused `oxlint` also passed after the final Unicode title adjustment.
- `npm run check:docs` passed all 669 description checks but failed on one existing absolute `/api/asset` link in the unrelated, untracked `.mew/tasks/Image preview and attachment editing.md`. The six documents changed for this task passed description and local-link checks separately. `git diff --check` passed.

## Application boundary

Checks use isolated fixtures; no production app was probed. Titles set only by JavaScript, authenticated app pages, and HTTPS-only services may retain port-only labels. Physical-device and live Mewlink checks remain for the user. No deployment, launcher execution, or Mew server start, stop, or restart was performed. The user must apply the server code; building UI assets does not reload the running port-list handler.

## Follow-up: name-first port tags and process fallbacks

The user corrected the row order to `{name} [port]` and requested useful identification of non-web listeners. Names now precede a compact numeric port tag. HTML titles take priority over actual listener process names, Mew retains its known label, and unavailable metadata uses the existing localized unnamed label. Blocked listeners remain disabled even when their process name is visible. Process names identify the owner without guessing the service from a port number or reading command arguments/environment variables.

The [current contract](../development/port-preview.md#host-port-discovery) owns optional `processName` metadata, OS sources, parallel lookup, deadlines, and bounds. [Decision 0124](../decisions/0124-localhost-port-service-labels.md) records the fallback choice and its limits.

All 38 focused tests passed: 13 browser checks across the port picker, panel, and host/viewer flow; eight process-module tests; eight discovery/API tests; and nine existing title-module tests. Coverage includes name/tag order and styling, desktop/mobile layout, title priority, unnamed fallback, blocked/Mew rows, OS ownership parsing, permission errors, Unicode, bounded filesystem work, partial deadlines, cancellation, and optional metadata failures. The final port-picker checks passed again after adjusting name contrast. Desktop/mobile service-label screenshots were inspected outside the repository; the UI detector found no issues.

Full lint and focused `oxlint` passed with existing React warnings. The full documentation check passed 671 descriptions and reported the same unrelated task asset-link error noted above. All six changed documents passed description and local-link checks separately; `git diff --check` passed. Initial builds encountered transient type errors in concurrently edited project-addition code outside this change. After those files were corrected, `npm run build` passed, including TypeScript checks, with the existing large-chunk warning.

Checks remain local and isolated. OS visibility, scan limits, and generic process names such as `node` can leave the purpose unclear. Physical-device and live Mewlink verification remain for the user. No deployment or Mew server lifecycle operation was performed.
