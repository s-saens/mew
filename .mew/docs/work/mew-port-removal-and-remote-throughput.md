---
title: "Mew Port removal and remote response throughput"
description: "Records removal of Mew Port and bounded pipelining of remote HTTP response acknowledgements, local regression and build checks, pre-existing documentation errors, and unmeasured production performance."
created: "2026-11-09"
updated: "2026-11-09"
---

# Mew Port removal and remote response throughput

The user requested removing Mew Port and improving Mewlink speed. The implementation removes direct and Mewlink port-preview entry points, listener discovery and shutdown, port buttons, and the old permission. Ordinary host Browser access remains. [ADR 0160](../decisions/0160-remove-mew-port.md) records the change; the [Browser contract](../development/browser-desktop.md) and [remote access contract](../development/remote-access.md) own current behavior.

Remote HTTP responses can now have two RTC-process send acknowledgements pending, within the existing consumer credit. The previous implementation waited after each chunk. This reduces serialized process acknowledgements in the tested case; it does not establish the cause or magnitude of the reported real-world slowdown. The remote access contract owns ordering, cancellation, and revocation boundaries.

Local regression checks exercised delayed acknowledgements, data order, cancellation, revocation, permission normalization, browser entry, and removal of the former controls. The parent build and lint passed with warnings. The documentation checker validated metadata but reported 37 existing missing links outside this change. The independent Mewlink source passed type checks and its device-path/deployment-script unit checks. Actual external-network timings, comparison with Cloudflare Tunnel, and application to the running host and central service remain unverified. The required build updates `dist/` served by the running source server; no deployment or server lifecycle operation was performed.
