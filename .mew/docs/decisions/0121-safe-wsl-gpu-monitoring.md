---
title: "0121 — Safe NVIDIA resource collection under WSL"
description: "Selects Windows nvidia-smi.exe exclusively under WSL, preserves PID namespace boundaries, and shares bounded resource queries across summary and detailed consumers. Records why caching alone and a persistent NVML integration were not selected."
created: "2026-11-02"
updated: "2026-11-02"
status: "accepted"
---

## Context

Mew collected aggregate GPU and compute-process data with two Linux `nvidia-smi` calls per resource request. The header requested a full resource snapshot every 500ms, in addition to the popup and overload monitor. A local Windows/WSL investigation observed persistent NVIDIA kernel-pool growth after repeated WSL queries; equivalent Windows queries did not increase the measured pool. Low average CPU, RAM, and GPU utilization did not explain the accompanying desktop stalls. The [work record](../work/wsl-gpu-monitoring.md) preserves the measured scope and its limits.

The [WSL issue report #12756](https://github.com/microsoft/WSL/issues/12756) describes similar pool growth. It is a user report, and its automatic closure does not establish a vendor-confirmed fix.

## Decision

Use Windows `nvidia-smi.exe` exclusively for aggregate GPU measurements when Mew runs under WSL. Detect WSL from Linux environment markers or the Microsoft kernel release, and discover the executable through PATH and mounted Windows drive roots. If discovery or execution fails, expose GPU data as unavailable. Linux `nvidia-smi` is never a WSL fallback.

Keep process identity within the server's OS namespace. Skip Windows compute-process queries under WSL because their PIDs cannot be joined to Linux `/proc` entries. Native Linux and Windows retain per-process GPU memory collection.

Add an optional summary request that skips process enumeration and per-process GPU work. Use it for header gauges and overload notifications while preserving the full response by default. Share in-flight collections and short-lived results across clients, with a longer retry interval for unavailable GPU queries. Reduce header polling to every two seconds while visible and refresh immediately on return. The [system resources contract](../features/appearance-accounts-operations/system-resources-and-processes.md) owns the exact API and collection intervals; the [Mewpet contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md) owns client polling.

## Alternatives and rationale

Caching Linux queries alone would slow the observed accumulation while continuing to invoke the affected path. Omitting all GPU monitoring under WSL would avoid those calls but discard aggregate measurements available through Windows. Windows executable queries preserve those measurements with a small change and an observed safe control on the affected machine.

A persistent NVML collector could avoid repeated initialization, but it would add native bindings or a resident helper and lifecycle management. Its behavior under the affected driver would need separate measurement. It is unnecessary for the current aggregate display and would widen this fix.

## Consequences

Multiple clients share collection costs, and header or notification requests no longer scan the process list. GPU values can be several seconds old. Missing Windows tools or disabled interop leave GPU data unavailable, while CPU, memory, and processes remain available. WSL process GPU memory remains unsupported rather than using unrelated Windows PIDs.

This is an application-side mitigation based on local evidence, not a claim that the NVIDIA driver leak has been repaired. Existing Windows kernel-pool allocations remain outside Mew's control. Server-code application and any Windows reboot are user-owned operations; this decision authorizes no deployment or server restart.
