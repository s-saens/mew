---
title: "Build and verify the iOS client"
description: "Build prerequisites and verification procedure for the standalone Mew iOS project, saved direct/Mewlink endpoints, native UI storage, and notification checks. Distinguishes source checks from signing, physical-device acceptance, central application, and remote push."
created: "2026-11-10"
updated: "2026-11-10"
---

# Build and verify the iOS client

Audience: developers with a Mac and Xcode, and release owners preparing a device build. The [implementation contract](../development/ios-client.md) owns protocol details; [work status](../work/ios-client.md) records actual results. Do not interpret this guide as permission for agents to deploy or start/restart Mew servers.

## Prerequisites

- macOS with Xcode and an installed iOS SDK matching the app project's deployment target.
- A reachable, already-running Mew host. The user manages its lifecycle.
- For Mewlink, an existing registered device and current central frontend built with the shared native cache adaptation. Central application remains separate and user-owned.
- For signed device installation, the user's Apple development team and provisioning setup.

The iOS project uses system frameworks and does not require React Native, CocoaPods, a JavaScript mobile toolchain, or a native dependency installation. The shared Mew web assets still follow the root repository's `npm run build` process.

## Build and test

Open `apps/ios/Mew.xcodeproj`. Select the **Mew** scheme, choose a simulator/device, and configure the user's development team for signing. Never commit a personal team identifier, provisioning profile, credentials, or APNs private key.

Use Xcode's Build and Test actions. Record the Xcode/iOS SDK version, destination, build outcome, and XCTest result in a work record. Source inspection and project-file parsing on Linux do not substitute for these checks.

For an installed simulator, the equivalent terminal command is:

```bash
xcodebuild test -project apps/ios/Mew.xcodeproj -scheme Mew \
  -destination 'platform=iOS Simulator,id=<available-simulator-UUID>' CODE_SIGNING_ALLOWED=NO
```

The [iOS verification workflow](../../../.github/workflows/ios-client.yml) selects an available iPhone simulator on a macOS runner and runs the same build/tests. It runs on matching pull requests or manual dispatch after publication of the commit. Adding this workflow locally does not mean it has executed; inspect its actual result before claiming native acceptance.

## Connect and inspect retained code

1. Add a direct endpoint or Mewlink device URL in the app's connection chooser. HTTPS tunnel and Tailscale HTTPS addresses use normal certificate validation. Explicit private HTTP has separate consent and does not authorize an invalid TLS certificate.
2. Open the connection and sign in through Mew. Confirm the chooser is still reachable and reopening the application retains the connection metadata.
3. Open an editor and other optional panels to populate native UI files. Reconnect to the same host/version and inspect network/native cache diagnostics in a development build: the host must confirm current content while retained bodies avoid a full transfer.
4. Update the host using user-managed procedures, then reconnect. Confirm fresh HTML selects current UI code and no stale body substitutes for mismatching host content.
5. Clear the app's retained UI files. Confirm live assets repopulate without deleting host documents or account data.

First contact and missing/evicted files still require downloads. Connection authentication and current-host code confirmation still require network access. An offline launch is not an offline workspace.

## Physical-device acceptance

Check both direct and Mewlink on an actual iPhone:

- Login, logout, password change, account switch and revoked access; no state crossing between saved hosts/accounts.
- Static module/CSS/font loading, optional dynamic imports, document Hotview/Plain, code editing, terminal and agent sockets, browser video, and PDF/editor workers where used.
- Image/media rendering, large responses, binary uploads, multipart attachments, cancel, download, and external links.
- Native cache hit/miss/corruption, host update, insufficient disk space, endpoint deletion, and explicit cache removal.
- App switching, locking, network switching, WebView process termination, recovery and draft handling.
- Notification permission denied/granted, in-session delivery, duplicate IDs, tap routing, and account/connection disposal.
- Untrusted certificates, mismatching Mewlink device paths/origins, raw user HTML and external frames; none may gain native operations accidentally.

App suspension can stop JavaScript/network work. This release's local notification bridge cannot discover new agent events after the app is stopped. Full remote push requires a separately implemented server/APNs delivery path.
