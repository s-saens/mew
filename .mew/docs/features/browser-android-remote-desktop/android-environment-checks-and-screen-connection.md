---
id: "mew-remote-android"
parent: "mew-remote"
title: "Android environment checks and display connection"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-20"
status_hash: "bed0a9e331155081546a5580d1b26a16663266c47fe7472e00f82e8352aff86c"
files: ["src/components/AndroidPanel.tsx", "server/androidEnv.ts", "server/port-preview.ts"]
commits: []
description: "Feature contract covering Android SDK, acceleration, system image, and AVD status checks, execution of preparation commands, and connection to an existing WebRTC gateway display. Describes the boundary that status queries alone do not install, download, or start processes, and the localhost gateway proxy restricted to Android permissions."
상위파일:
  - "MOC.md"
  - "_browser-android-remote-desktop.md"
---

## Requirements

- Check the Android development environment and access preparation commands and an existing gateway display.

### Scope

- Provide SDK, acceleration, system image, and AVD status, execution of server-defined preparation commands, and terminal access.
- Connect to an already running WebRTC/gateway display.

### Boundaries and limitations

- Do not include Android Emulator or system images in the Mew distribution.
- Status queries alone do not install, start processes, or download anything.

### Detailed contracts

- [Android support scope](../../../../docs/guides/browser.md)

<!-- mew:implementation:start -->
## Implementation details

- Provide SDK, acceleration, system image, and AVD status, execution of server-defined preparation commands, and terminal access.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the host architecture and readiness status are accurate and that installation does not begin before explicit execution.

<!-- mew:validation:end -->
