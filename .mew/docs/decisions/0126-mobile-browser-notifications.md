---
title: "Mobile browser notifications through an owning top-level service worker"
description: "Uses a narrow notification-only service worker for mobile browser delivery and a trusted Mewlink top-level permission bridge. Preserves resource routing, private notification data, installation boundaries, and the absence of background server push."
created: "2026-11-03"
updated: "2026-11-03"
status: "accepted"
---

## Context

Mew's OS delivery used `new Notification()`, which [fails in most mobile browsers](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification). Mewlink also runs the host UI inside a cross-origin frame, where browser notification permission cannot be requested directly. On [iOS/iPadOS](https://webkit.org/blog/13878/), notification permission requires a Home Screen web app and a user action.

## Decision

Use `ServiceWorkerRegistration.showNotification()` through a notification-only worker with the narrow `/__mew_notifications__/` scope. Preserve Mewlink's existing root resource worker. The worker has no fetch handler or offline cache, so the [installation decision](0064-installable-web-app.md) remains in force.

For direct access, the host page owns permission and delivery. For Mewlink, the top-level public device page owns them and the existing trusted frame-bound MessagePort carries permission state, generic localized titles, opaque IDs, and click results. Invoke the permission API during the original button action before awaiting worker setup. Only the exact originating WindowClient may receive a click; the app keeps navigation targets in memory and applies its existing account and feature checks.

## Alternatives and rationale

- Keeping the constructor excludes common mobile browsers. Retain it only as a fallback for desktop environments without a usable worker.
- Registering another root worker risks replacing Mewlink's resource routing. A narrow separate scope permits notifications without changing resource ownership.
- Asking for permission in the installed UI frame fails cross-origin browser rules. Delegate the action through the existing trusted channel without sharing central credentials.
- Adding Push API subscriptions, persistent inboxes, VAPID keys, or server push delivery would change event collection and operations. That is a separate feature; this change fixes presentation of events already received by the running app.

## Consequences

HTTPS or localhost, browser support, OS permission, and the existing notification preference remain required. Ordinary iPhone/iPad Safari tabs show installation guidance. Closing or suspending the app can stop new event delivery; physical-device behavior and OS policy remain verification limits.

Mewlink requires both the host change and a separate central frontend update. Central sources remain Git-excluded and are not deployed by agents. The [notification feature](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#notification-settings-and-pc-desktop-notifications) owns current behavior; the [work record](../work/mobile-browser-notifications.md) records verification and application status.
