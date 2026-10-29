---
id: "mew-remote"
parent: null
title: "Browser, Android, and remote desktop"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-20"
status_hash: "fa171a4c0dd4125f3b1ab4b9b1719541e1dfad7e8c2588d363eaf72c977f2e9f"
files: []
commits: []
description: "Parent feature document grouping independent login video, localhost app access, Android environment preparation, gateway displays, and remote desktop input. Provides child feature scopes and detailed contract links, and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Access OAuth login, host development apps, the Android development environment, and the logged-in server desktop.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Virtual login display and localhost app access](server-browser-login-and-popups.md)
- [Android Environment Checks·Display Connection](android-environment-checks-and-screen-connection.md)
- [Remote Desktop·Touch Input](remote-desktop-and-touch-input.md)

### Detailed contracts

- [Browser and Android](../../../../docs/guides/browser.md) · [Remote desktop](../../../../docs/guides/remote-desktop.md)

<!-- mew:implementation:start -->
## Implementation details

- Groups the currently available child features into one work area.
- Each child feature links to the basis for its implementation and limitations.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review child feature boundaries and omissions.
  - Parent status does not automatically approve child statuses.

<!-- mew:validation:end -->
