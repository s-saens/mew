---
title: "Chromium browser and UI-test restoration"
description: "Records the November 4 reversal of Obscura for the internal Browser and UI tests, restored native Chromium paths, regression coverage, local existing-app replay checks, and remaining server-application and device-verification limits."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and resulting behavior

The user confirmed the Obscura page eventually appeared after the stylesheet correction, but both startup and later interaction remained slow. Restore Chrome/Chromium for the internal Browser and normal UI tests under [ADR 0136](../decisions/0136-chromium-browser-restoration.md).

The internal Browser again uses native browser HTTP/cookies, history, WebSockets, and pointer input with CDP redirect guards. Obscura process startup, Node compatibility bridges, and the reflected-link patch are removed. UI tests retain their shared `connectTestBrowser()` call sites while the helper launches and closes a test-owned Chromium browser. Executable discovery and current behavior belong to the [DOM browser contract](../development/port-preview.md#internal-dom-browser) and [browser-testing contract](../development/browser-testing.md).

Existing unrelated session-option work is kept outside this commit. Its working-copy storage-path option is adapted to a native Chromium persistent context so that restoring the runtime does not discard that pending work.

## Verification and limits

Local existing-app checks launched only test-owned browser processes, with no application or browser service started. All test-owned browsers were closed afterward. They are separate from applying the updated server and verifying the physical device.

- `node --test server/dom-browser-runtime.test.ts server/browser-dom-executable.test.ts server/test-browser.test.ts` passed (8/8). Mocked runtime coverage checks owned Chromium launch, rrweb initialization without the removed patch, native WebSocket connections and pointer/history commands, blocked ports through CDP, and cleanup. Helper tests cover owned browser selection, retired endpoint handling, timeouts, and launch failures.
- A real Chromium session opened the existing localhost sign-in app through `DomBrowserSession`; its actual rrweb events were replayed in another Chromium page with the viewer's resource policy. At a 390-pixel viewport, the replay showed the sign-in layout, sans-serif font, styled controls, and email input. Local first-snapshot checks measured 666–960 ms; one input change produced its host-recorded event after about 5 ms. These are individual local smoke measurements, not a controlled comparison or a mobile/network latency guarantee.
- `npm run build` passed, including TypeScript checks. Repository lint passed with existing warnings, and focused lint for the changed TypeScript files passed without diagnostics. The initial build found an implicit parameter type in the new regression test; the type was corrected before the successful build.
- `npm run check:docs` validated descriptions but failed on the same 42 existing missing links. Scoped checks validated all 11 changed document descriptions. Ten changed documents had no link errors; `getting-started.md` retained its two pre-existing missing targets, including the decision-index path changed by unrelated pending work.
- The existing HTTP/WebSocket fixture suite was adjusted for native Chromium hostname resolution and session isolation, but was not run during this task. The full UI suite, physical-device behavior, Mewlink, and external networks remain unverified.

No deployment, launcher execution, or application-server start, stop, or restart was performed. A running Mew server still needs the user's normal restart before it loads the restored runtime.
