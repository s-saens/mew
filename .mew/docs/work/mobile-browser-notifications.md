---
title: "Mobile browser notification delivery"
description: "Records the mobile Notification-constructor failure and the service-worker delivery and Mewlink top-level permission bridge added on 2026-11-03. Separates local verification, physical-device limits, and pending central deployment."
created: "2026-11-03"
updated: "2026-11-03"
---

The existing notification hook relied on a constructor rejected by common mobile browsers. It now uses a shared service-worker delivery engine, with desktop fallback. Mewlink delegates permission and OS delivery to its top-level public device page through the trusted connection channel. The [feature contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#notification-settings-and-pc-desktop-notifications) and [ADR 0126](../decisions/0126-mobile-browser-notifications.md) own behavior and rationale.

The notification worker has a narrow scope and no fetch/cache behavior. It uses opaque action IDs and the exact owning WindowClient, closes stale notifications, and never stores message bodies, senders, project paths, or navigation targets. Settings preserve existing channel preferences, explain iPhone/iPad Home Screen requirements, and make the three-second test guidance apply to other apps or tabs.

## Verification and application

- `node --test src/utils/hosted-notifications.test.ts src/utils/notification-delivery.test.ts server/notification-worker.test.ts src/components/mewcat-notifications.test.ts src/utils/mewcat-notifications.test.ts src/hooks/use-chat-notifications.test.ts src/utils/chat-notification-rules.test.ts server/chat-bubbles-ui.test.ts server/chat.test.ts server/chat-history.test.ts`: 71 passed, none skipped. Coverage includes rejected mobile constructors, real delivery-hook compatibility, narrow worker registration, activation/handshake timeouts, exact-client clicks, malformed messages, iOS installation state, desktop fallback, bounded notices, late cleanup, trusted hosted state, connection replacement, permission prompt time, and chat regressions.
- On the already running local server, two isolated Chromium contexts at 390/1100px loaded a synthetic blank fixture and the actual built notification worker. With the `Notification` constructor deliberately disabled, real service-worker registration, `showNotification`, opaque click data, and dismissal cleanup passed. The document remained uncontrolled and the root scope was not replaced. Both temporary registrations were removed and browser contexts closed. This verifies browser API behavior under simulated widths, not physical mobile OS banners.
- `node --test mewlink/test/notification-host.node.test.ts mewlink/test/app-install-host.node.test.ts`: 8 passed. `npm run check --prefix mewlink` passed both Worker and browser-client type checks. `npm run build --prefix mewlink` passed and emitted `notification-worker.js`. These are local checks of the separate central source, not production deployment.
- `npm run build` passed with existing chunk-size warnings. `npm run lint` passed with existing warnings. Changed-document descriptions, local links, and new cross-reference anchors passed scoped validation; `git diff --check` passed. Full `npm run check:docs` passed 675 descriptions but still reports the unrelated pending `.mew/tasks/Image preview and attachment editing.md` asset URL as a non-repository-relative link.

No application server lifecycle or deployment operation has been performed.

The Git-excluded central sources changed in this task are `mewlink/src/notification-host.ts`, `mewlink/src/app-launcher.ts`, `mewlink/src/connection-parent.ts`, `mewlink/src/worker.ts`, `mewlink/vite.config.ts`, and `mewlink/test/notification-host.node.test.ts`. They remain outside the Mew commit and require a user-owned central frontend deployment. A host build alone does not enable this bridge in the running Mewlink frontend. The checkout must contain that separate central source to inspect or run its checks.

This work does not add server Web Push. Real Android/iOS devices, OS notification permission prompts, screen-lock delivery, background suspension, and production Mewlink have not been verified.
