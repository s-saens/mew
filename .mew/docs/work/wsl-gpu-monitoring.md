---
title: "WSL GPU monitoring and desktop stalls"
description: "Records the 2026-11-02 NVIDIA kernel-pool and DPC observations, Windows-only GPU queries under WSL, shared lightweight collection, passing regression/build checks, and an unrelated full-repository document-link failure. Distinguishes local verification from pending server application and long-term driver validation."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and observed behavior

The Windows desktop developed mouse and window-movement stalls after extended uptime despite moderate reported CPU, RAM, and GPU utilization. Rebooting had restored responsiveness. The local investigation on 2026-11-02 observed repeated `nvlddmkm.sys` DPC execution lasting approximately 70–154ms and about 1.85GB allocated under the NVIDIA `NVRM` kernel-pool tag.

A controlled comparison of 20 WSL GPU queries left 185,504 additional bytes allocated under that tag after the queries exited. Twenty equivalent Windows queries produced a measured increase of zero bytes. Mew's resource collector repeatedly invoked the WSL command. These observations support removing that query path; they do not establish that every desktop stall has the same cause or that the Windows path is free of all driver defects. Raw diagnostic logs and captures remain local and are not committed.

The [WSL issue report #12756](https://github.com/microsoft/WSL/issues/12756) describes similar persistent pool growth from WSL `nvidia-smi` calls and a Windows-query control. The issue was automatically closed for inactivity. Treat it as a reported reproduction, not a vendor-confirmed repair or a guarantee about current driver versions.

## Resulting behavior

The change uses Windows `nvidia-smi.exe` for aggregate GPU readings under WSL and returns unavailable GPU data when it cannot safely use that executable. It never retries with Linux `nvidia-smi` under WSL. Windows compute PIDs do not enter the Linux process list.

Header gauges and overload notifications request summaries without process enumeration or per-process GPU queries. The server shares in-flight collection and cached results across clients. The header refreshes every two seconds while visible and immediately on foreground return; overload checks retain their existing interval. The [system resources contract](../features/appearance-accounts-operations/system-resources-and-processes.md) owns the collection details, the [Mewpet contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md) owns client polling, and [ADR 0121](../decisions/0121-safe-wsl-gpu-monitoring.md) records the choice and alternatives.

## Verification status

Completed local checks:

- `node --test server/gpu-stats.test.ts server/resource-sample-cache.test.ts server/sysStats.test.ts server/platform.test.ts src/components/mewcat-notifications.test.ts src/utils/mewcat-notification-rules.test.ts`: 34 passed, two platform-dependent tests skipped. The regressions cover WSL discovery and failure cases, Linux fallback prevention, PID namespace separation, process-free summaries, shared pending work, expiry, and failed-query retry delays.
- `node --test server/header-resources-polling-ui.test.ts`: all six cases passed, covering summary URLs, two-second header cadence, hidden/visible transitions, no overlap, timeouts, cleanup, and away notifications.
- `node --test server/network-usage-ui.test.ts` and `node --test server/mewcat-ui.test.ts`: passed. Existing header fixture assertions were aligned with the current compact header dimensions, nested gauge markup, and theme tokens; the product's appearance did not change.
- A bounded smoke check on the affected WSL host sent 100 concurrent requests through the new GPU collector: one actual Windows `nvidia-smi.exe` invocation returned the RTX 5060 Ti sample, and the WSL process-GPU map stayed empty. This exercised the new module directly, not the running application server.
- `npm run build`: passed, including `tsc -b`; Vite reported a large-chunk warning. The first attempt found unsupported `Promise.withResolvers` typings in the new tests; compatible deferred promises fixed those errors before the successful rebuild.
- `npm run lint`: exited successfully with warnings.
- `npm run check:docs`: description validation passed; the full link check failed on an unrelated pending task document's absolute `/api/asset` link. The modified documents' links were checked separately with the existing checker.

These results verify the implementation and bounded collector behavior. They do not establish runtime application, driver repair, or leak-free operation over several days.

## Application boundary and limitations

The agent does not deploy, run the launcher, or start, stop, or restart the application server. The user must apply the server changes through the normal lifecycle before the running collector uses them. Build verification alone does not establish that the server code is active.

This change prevents future calls through the observed WSL query path; it does not reclaim already accumulated Windows driver allocations. A Windows reboot, if needed to clear the affected machine's state, is user-owned. Long-running validation after application remains necessary to assess pool growth and desktop responsiveness on the affected driver.
