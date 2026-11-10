---
title: "Mew iOS client"
description: "Source entrypoint for the SwiftUI/WKWebView iOS project, its saved direct/Mewlink connections, native static-code storage, and linked architecture, build instructions, and verification status."
---

# Mew iOS client

Open `Mew.xcodeproj` on a Mac with Xcode and select the **Mew** scheme. This app reuses the host's React UI, remembers direct and Mewlink connections, and stores verified static UI files in native storage. It uses system frameworks without React Native or CocoaPods.

- [Architecture and bridge contract](../../.mew/docs/development/ios-client.md)
- [Build, test, and device verification](../../.mew/docs/operations/ios-client.md)
- [Feature acceptance](../../.mew/docs/features/appearance-accounts-operations/ios-client.md)
- [Implementation evidence and remaining gates](../../.mew/docs/work/ios-client.md)

The current Linux implementation checks do not establish an Xcode build or an accepted physical-device release. Remote push after suspension/termination is not implemented; the notification bridge delivers events received while Mew is running. Direct HTTP transfers currently have a 32 MiB body limit and do not stream incrementally.
