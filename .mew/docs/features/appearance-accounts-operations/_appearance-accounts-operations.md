---
id: "mew-settings"
parent: null
title: "Interface, accounts, and operations"
status: "verified"
created: "2026-09-18"
updated: "2026-10-14"
status_hash: "66acae9698f920a11450fd0360475c1ab19b8d7e798fdd7f1215e0c9c4cb4d28"
files: []
commits: []
description: "Parent feature document covering panel layout, mobile restoration, appearance settings, account permissions, server resources, network usage, updates, and Mewpet. Explains the scope of child features and links to detailed contracts, and distinguishes ownership of individual implementations and verification."
상위파일: "../_features.md"
---

## Requirements

- Adjust the user environment and manage access permissions and server operational status.

- Select the work scope and related implementation in the child features.
- Check each detailed contract even when changing multiple child features.

### Child features

- [Mewpet Assistant·Conversations·Mew Controls](mewpet-assistant-conversations-and-controls.md)

- [Panel Layout·Mobile·State Restoration](panel-layout-mobile-and-state-restoration.md)
- [Display·Language·Font·Keyboard Shortcut Settings](appearance-language-fonts-and-shortcuts.md)
- [Accounts·Roles·Feature Permissions·Guest Sharing](accounts-roles-feature-permissions-and-guest-sharing.md)
- [View System Resources·Processes](system-resources-and-processes.md)
- [App Updates·Operations Access](application-updates-and-operations.md)
- [Mewpet mascot](mewpet-mascot-notifications-and-breaks.md)

- [Network Usage](network-usage.md)

### Detailed contracts

- [Account and appearance settings](../../../../docs/configuration/appearance.md) · [Permissions contract](../../development/access-control.md)

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
