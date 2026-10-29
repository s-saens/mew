---
id: "mew-settings-system-resources"
parent: "mew-settings"
title: "System resources and process view"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-14"
status_hash: "20544b07271a698d27b55dfdbbdbc97abb3472a36115cbbbcdffed7759ae2d9f"
files: ["src/components/SystemStatsModal.tsx", "server/sysStats.ts", "src/components/network-usage-panel.tsx"]
commits: []
description: "Feature contract for displaying server CPU, memory, GPU, temperatures, processes, and recent trends alongside the current tab's upload/download totals and per-second speeds. Explains how measurements unsupported by the OS or tools are displayed and distinguishes recent trends from long-term monitoring history."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- View the server's current resource usage and processes.

### Scope

- Display CPU, memory, GPU, temperatures, processes, and recent trends while the popup is open.

### Boundaries and limitations

- Leave measurements unavailable from the OS or tools blank, or display them as unsupported.
- Recent trends are not the server's long-term monitoring history.

### Detailed contracts

- [Commands and Scheduled Tasks](../../../../docs/guides/commands.md)

<!-- mew:implementation:start -->
## Implementation details

- Display CPU, memory, GPU, temperatures, processes, and recent trends while the popup is open.
- Integrate the totals and speed tables from [Network usage](network-usage.md) below CPU, memory, and GPU and above the process list. Display network totals for the current tab even while server resources are loading or their retrieval has failed.
- Close the popup with the X button on the right side of the title row. Display it even in loading and error states, and provide a translated accessible name and a keyboard focus indicator.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify measurements and unsupported indicators for each supported environment, and that trends reset after the popup is closed.
  - Verify that the upper-right X button is visible on desktop and mobile and can close the popup by click, touch, and keyboard.

<!-- mew:validation:end -->
