---
title: "External-site access and DOM browser latency"
description: "Records the 2026-11-01 external HTTP(S) browser extension, insecure-origin recorder fix, local live replay timing, duplicate-snapshot removal, regression measurements, build and static checks, and remaining asset and runtime application limits."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and result

The user reported sluggish interaction in the DOM browser and requested external-site access. The Browser address field now accepts external HTTP(S) websites, preserving the existing access controls and blocked Mew port numbers. Ordinary HTTP sites can initialize the recorder using `crypto.getRandomValues`. The [current contract](../development/port-preview.md#internal-dom-browser) and [decision 0106](../decisions/0106-dom-browser-external-sites.md) own behavior and rationale.

The viewer previously scheduled incoming events by host timestamps. A snapshot dated one minute ahead failed the new regression's one-second visibility deadline before the fix. Received batches now use a local monotonic timeline in arrival order. Isolated mutation measurements with host offsets of +60, -60, and +120 seconds completed in 6–29 ms in the focused run and 15–75 ms with other browser tests running. These measurements include local test-driver overhead and establish clock independence, rather than external-network or physical-device latency.

New documents previously emitted both the recorder's automatic full snapshot and a navigation-command snapshot, rebuilding the same page twice. The command now requests a snapshot only when its generation did not advance through a new document. Initial navigation and reload each emit one snapshot; SPA history continues to rebuild with its new generation.

## Changed files

- `server/dom-browser.ts`: External HTTP(S) navigation, tokens on insecure origins, and conditional navigation snapshots.
- `server/dom-browser.test.ts`: Address policy, isolated external-host navigation and redirects, single snapshots, and existing protection checks.
- `src/components/DomBrowserPanel.tsx`: Local monotonic live replay scheduling.
- `src/components/dom-browser-panel.browser.test.ts`: Clock-skew and external-address regressions alongside existing interaction checks.
- `.mew/docs/development/port-preview.md`: Current implementation contract and remaining initial-asset latency.
- `.mew/docs/features/browser-android-remote-desktop/server-browser-login-and-popups.md`: Feature scope and acceptance criteria.
- `docs/guides/browser.md`: External address entry and access restrictions.
- `.mew/docs/decisions/0103-localhost-dom-browser.md`: Supersession link for the former localhost restriction.
- `.mew/docs/decisions/0106-dom-browser-external-sites.md`: Decision and consequences.
- This work record: Local results and application boundary.

## Verification and limits

All 21 relevant tests passed with no skips across these runs:

```bash
node --test server/dom-browser.test.ts
node --test server/dom-browser-flow.browser.test.ts src/components/dom-browser-panel.browser.test.ts src/components/dom-browser-entry.browser.test.ts src/utils/dom-browser-scroll.test.ts src/utils/local-browser-links.test.ts src/utils/port-preview-entry.test.ts server/browser-dom-executable.test.ts
```

Checks cover external-host HTTP entry, reload, links, redirects, Back/Forward, single document snapshots, protection against redirects into Mew, native app scripts, inert replay, editing, assets, generation checks, scroll revisions, responsive docking, and permission revocation. External navigation uses Chromium DNS mapping to an isolated fixture and requires no public Internet service.

`npm run build` passed, including TypeScript, with the large-chunk warning. `npm run lint` passed with warnings. Documentation descriptions and links passed, as did `git diff --check`. The Impeccable detector returned no findings for the changed viewer.

Initial snapshots still wait for bounded image/font/CSS asset inlining, so slow assets can delay initial content and subsequent queued events. Compatibility with every public website, physical devices, and Mewlink over an external network remains unverified. The required build updated local UI assets; running server-side code was not reloaded. No deployment, launcher execution, or Mew server start, stop, or restart was performed. The user applies the host changes.
