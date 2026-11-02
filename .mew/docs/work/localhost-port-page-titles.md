---
title: "Localhost port page titles"
description: "Records the 2026-11-03 addition of HTML page titles beside localhost ports, bounded lookup and fallback behavior, local verification, and user-owned server application limits."
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
