---
id: "mew-settings-system-resources"
parent: "mew-settings"
title: "System resources and process view"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-02"
status_hash: "20544b07271a698d27b55dfdbbdbc97abb3472a36115cbbbcdffed7759ae2d9f"
files: ["src/components/SystemStatsModal.tsx", "server/sysStats.ts", "server/gpu-stats.ts", "server/resource-sample-cache.ts", "src/components/network-usage-panel.tsx"]
commits: []
description: "Defines server resource snapshots, lightweight summary requests, shared collection intervals, and Windows-only NVIDIA queries under WSL without crossing process PID namespaces. Covers the resource popup, unsupported measurements, recent trends, and the current tab's network totals and speeds."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- View the server's current resource usage and processes.

### Scope

- Display CPU, memory, GPU, temperatures, processes, and recent trends while the popup is open.
- Provide CPU, memory, and aggregate GPU summaries for the header and overload notifications without collecting process details.

### Boundaries and limitations

- Leave measurements unavailable from the OS or tools blank, or display them as unsupported.
- Recent trends are not the server's long-term monitoring history.
- In WSL, CPU, memory, and processes describe the Linux server environment; aggregate GPU measurements come from the Windows host. Windows GPU process IDs cannot identify Linux processes.
- Changing collection prevents future calls through the affected WSL query path. It does not reclaim kernel memory already accumulated in the Windows driver.

### Detailed contracts

- [Commands and Scheduled Tasks](../../../../docs/guides/commands.md)
- [Mewpet header gauges and overload notifications](mewpet-mascot-notifications-and-breaks.md)
- [Safe WSL GPU monitoring decision](../../decisions/0121-safe-wsl-gpu-monitoring.md)

<!-- mew:implementation:start -->
## Implementation details

- Display CPU, memory, GPU, temperatures, processes, and recent trends while the popup is open.
- Integrate the totals and speed tables from [Network usage](network-usage.md) below CPU, memory, and GPU and above the process list. Display network totals for the current tab even while server resources are loading or their retrieval has failed.
- Close the popup with the X button on the right side of the title row. Display it even in loading and error states, and provide a translated accessible name and a keyboard focus indicator.

### Collection and API

`GET /api/system-stats` includes the process list by default. `GET /api/system-stats?processes=0` retains the response shape with an empty `processes` array and skips both process enumeration and per-process GPU queries. The header and overload monitor use this summary request; the resource popup uses the full request.

Share collection work across requests and browser tabs in the server process. Concurrent requests reuse each collection already in flight, including when its ordinary cache interval has elapsed. Collection remains demand-driven; an idle server does not start resource queries on a timer.

| Measurement | Reuse interval |
| --- | --- |
| CPU and memory summary | 500ms |
| Full process list | 2 seconds |
| Successful aggregate GPU snapshot | 5 seconds |
| Failed or unavailable aggregate GPU query | 30 seconds before retry |
| Per-process GPU memory on native Linux or Windows | 5 seconds |

### GPU queries under WSL

Treat a Linux server as WSL when WSL environment variables are present or the kernel release identifies Microsoft. Resolve the Windows `nvidia-smi.exe` through PATH and mounted Windows drive roots, including paths with spaces and custom mount locations. Run the executable directly with bounded execution time. If discovery or execution fails, return an empty GPU list and retry according to the unavailable-query interval. Never fall back to Linux `nvidia-smi` under WSL.

Skip the compute-process GPU query under WSL. Windows compute PIDs belong to a different namespace from Linux `/proc`; the Linux process list retains `gpuMemMb: 0` as an unsupported measurement. Native Linux and Windows retain per-process GPU memory collection. Missing or unsupported aggregate values remain unavailable rather than becoming a claimed zero utilization.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not a record of completed checks:
  - Verify measurements and unsupported indicators for each supported environment, and that trends reset after the popup is closed.
  - Verify that the upper-right X button is visible on desktop and mobile and can close the popup by click, touch, and keyboard.
- Regression checks must cover WSL detection, executable discovery with custom mounts and spaces, absence of Linux fallback, PID namespace separation, summary requests skipping process work, concurrent collection sharing, cache expiry, and failure retry delays.
- Local measurements, completed checks, and runtime application status belong to the [WSL GPU monitoring work record](../../work/wsl-gpu-monitoring.md).

<!-- mew:validation:end -->
