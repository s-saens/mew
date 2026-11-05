---
id: "mew-remote-android"
parent: "mew-remote"
title: "Removed Android environment and gateway feature"
status: "removed"
created: "2026-09-18"
updated: "2026-11-05"
status_hash: "bed0a9e331155081546a5580d1b26a16663266c47fe7472e00f82e8352aff86c"
files: []
commits: []
description: "Records removal of the Android SDK readiness panel, setup commands, gateway proxy, capability, and demo. Retains the former feature scope for existing links; Android viewing-device support remains available."
상위파일:
  - "MOC.md"
  - "_browser-android-remote-desktop.md"
---

## Removal

Under [ADR 0147](../../decisions/0147-compact-workspace-menu.md), Mew no longer includes the Android environment panel, SDK readiness checks, registered setup commands, gateway iframe, or Android feature permission. The former Android APIs are absent, and saved panel visibility and width values are ignored. The browser demo also omits this feature.

This removal does not affect use of Mew from Android browsers, installation guidance, notifications, keyboard handling, or Android project file icons. It does not uninstall SDKs, emulators, system images, or gateways that users installed separately.

## Former scope

The removed feature checked SDK tools, acceleration, system images, and AVD readiness; offered server-defined preparation commands and terminal access; and connected to an already running WebRTC gateway display. Status queries alone did not install, start processes, or download anything. Emulator binaries and system images were never bundled with Mew.

The original optional-gateway rationale remains in [historical ADR 0058](../../history/decisions/0058-mew-android-panel-optional-gateway.md). The [browser guide](../../../../docs/guides/browser.md) describes the available login and host-browser features.
