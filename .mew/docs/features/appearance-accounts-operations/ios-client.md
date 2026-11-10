---
title: "iOS client connections and retained UI"
description: "Defines saved direct and Mewlink connections, native retained UI code, unchanged host permissions, in-session OS notifications, and explicit remote-push and physical-device limits for the iOS hybrid client."
created: "2026-11-10"
updated: "2026-11-10"
---

# iOS client connections and retained UI

The iOS client reuses the Mew web interface inside a native application. Its primary purpose is to remember connections and retain UI code in app-managed storage. Source implementation is distinct from a signed, installed, accepted iOS release.

## User behavior

- Show saved connections on the first screen. A user may add a direct host address or a public Mewlink device URL, edit/delete a connection, and return to the chooser from a workspace.
- Direct addresses may point to the user's HTTPS tunnel or Tailscale host. Explicit private-network HTTP needs clear consent; invalid certificates are not accepted silently. Tailscale connectivity itself remains supplied by the user's network configuration.
- Save connection metadata without storing passwords in ordinary preferences. Existing account login, roles, file permissions, and Mewlink trust continue to apply.
- Fetch fresh entry information and reuse native-retained static UI files after current-host validation. Download changed or missing code as needed. Do not promise zero network startup or offline workspace operation.
- Provide an action to remove retained UI code without deleting the host's workspace data.
- Offer native notification permission and deliver existing in-session alerts. Notification taps return to the correct live connection/owner when available.
- Surface entry load failures and process termination with recovery and a route back to saved connections.

## Acceptance matrix

| Scenario | Required outcome |
| --- | --- |
| Restart the app | Saved connection metadata remains available |
| Same host/version after cache warming | Static UI bodies reuse native files after host validation |
| Host UI update | New entrypoints/assets load; old code cannot substitute for mismatching host content |
| Deleted or corrupted cache | Live code loads, or a clear network failure appears |
| Permission denied, revoked, offline | No cached code fallback bypasses the failure |
| Different connection or account | State, credentials, notifications and caches remain scoped appropriately |
| Ordinary browser without native bridge | Existing Mew startup, cache, authentication and notifications continue |
| App suspended or stopped | Do not claim ongoing event monitoring or remote push |

The [implementation contract](../../development/ios-client.md) owns detailed limits, transport, identity, and security rules. The [operating guide](../../operations/ios-client.md) owns Xcode/device verification. [Work status](../../work/ios-client.md) records what has actually been checked.
