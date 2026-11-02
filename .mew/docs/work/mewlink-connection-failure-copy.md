---
title: "Minimal Mewlink connection failure message"
description: "Records the 2026-11-02 removal of retry counts and diagnostic details from exhausted Mewlink recovery, local regression and build verification, and pending central deployment."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and result

Simplified the exhausted Mewlink recovery screen to “연결 실패했습니다” (“Connection failed”), keeping the reconnect button and device-list link. Retry counts and diagnostic messages such as `Failed to fetch` are omitted. Retry limits, identity checks, the retained iframe, and unsent drafts follow the existing [remote access contract](../development/remote-access-recovery.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) and [shared UI contract](../development/ui-contracts.md). Initial bootstrap and explicit authorization/configuration errors retain their existing details.

The independent `mewlink/` repository owns `src/connection-parent.ts` and `test/startup.browser.test.ts`. The parent repository owns the contracts and this record.

## Local verification

- The startup, connection-screen, recovery, and trusted-browser fixtures passed with `node --test --test-reporter=dot mewlink/test/startup.browser.test.ts mewlink/test/connection-screen.browser.test.ts mewlink/test/recovery.browser.test.ts mewlink/test/trusted-browser.browser.test.ts`.
- The updated regression asserts the exact heading, absence of detail paragraphs, preserved actions, stopped automatic retries, and manual recovery with the same unsent draft. Layout assertions cover 390px and 1100px in light and dark themes; the dark mobile capture was visually inspected.
- Root `npm run build` and Mewlink `npm run check` and `npm run build` passed. The root build retained bundle-size warnings.
- Root `npm run lint` completed with existing warnings and no errors. The UI detector reported no findings for the changed launcher source.

## Application boundary

No deployment, launcher execution, or server lifecycle operation was performed. The user must deploy the central frontend to apply this message to the live Mewlink screen. Local browser fixtures use mocked connection responses and do not verify physical devices or external networks.
