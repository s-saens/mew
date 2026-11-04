---
title: "Ordinary Chrome installation and browser-purpose routing"
description: "Records the November 5 WSL Google Chrome installation and separate Chrome/Chromium selection for login, external pages, loopback apps, and tests. Covers local real-browser transitions, state/history regression coverage, and application and authentication verification limits."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

Install ordinary Google Chrome inside WSL and implement [ADR 0137](../decisions/0137-browser-purpose-routing.md): ordinary Chrome for login and external DOM pages; Playwright Chromium for loopback apps and UI automation. The previous internal Browser selected the same Playwright executable for every URL.

Executable selection, live role transitions, storage/history behavior, and limits belong to the [DOM contract](../development/port-preview.md#internal-dom-browser), [login contract](../development/login-desktop.md), and [testing contract](../development/browser-testing.md). Existing unrelated session-option changes remain outside this commit; their working-copy storage path is partitioned by role to avoid sharing a native profile between browser distributions.

## Host installation

Installed the official amd64 `google-chrome-stable` Debian package, version `157.0.8103.38-1`, inside Ubuntu 24.04 WSL. The download used Google's HTTPS endpoint and its SHA-256 matched the Google HTTPS package index. This is a package-index checksum comparison, not a separate GPG verification claim. The system package install added Chrome only, without upgrading or removing other packages. `/usr/bin/google-chrome-stable --version` reported `Google Chrome 157.0.8103.38`.

The ordinary Chrome resolver and login resolver now select `/usr/bin/google-chrome-stable`. The automation resolver still selects the existing Playwright executable, which reports Chrome for Testing `153.0.8010.12`. Package prerequisites follow Google's [Linux installer guidance](https://support.google.com/chrome/a/answer/9025926?hl=en).

## Verification and limits

A real-browser smoke used an already-running localhost sign-in app and `https://example.com/` through `DomBrowserSession`. Localhost ran on the Playwright 153 binary; external navigation ran on ordinary Chrome 157 and returned the expected page title. Back returned to the 153 binary and restored a temporary local-storage marker. Script-initiated navigation from localhost also switched to Chrome 157. Test-owned browser processes were closed afterward.

- `node --test server/browser-dom-executable.test.ts server/browser-dom-history.test.ts server/dom-browser-runtime.test.ts server/login-desktop-executable.test.ts server/test-browser.test.ts` passed (31/31). Coverage includes independent executable discovery/overrides, strict role prerequisites, loopback normalization, native history replacement and batched same-URL entries, cross-role state/history transitions, available POST-body forwarding without source-cookie copying, missing-browser recovery, and bounded redirect chains.
- The real same-URL history smoke initially exposed coalesced native history notifications. Recording all newly observed native entries fixed the loss; a regression test and a repeated real-browser check passed. Two synchronous same-URL `pushState` calls were traversed back to their original native state.
- `npm run build` passed, including TypeScript checks. Repository lint passed with existing warnings, and focused lint for the changed TypeScript files passed without diagnostics. Initial new-test type errors were corrected before the successful build.
- `npm run check:docs` validated 704 descriptions but failed on 42 pre-existing missing links. All eight changed documents passed scoped description and local-link checks. No existing documentation structure was reorganized.

This local browser evidence does not establish actual provider login, mobile behavior, or Mewlink/external-network application. No application server, browser service, or Mew launcher was started, stopped, or restarted. The user must apply the server-side routing changes through the normal Mew restart procedure.
