---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Automate preparation for external direct remote desktop connections and temporary NAT lifetimes. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0189 — Automate preparation for external direct remote desktop connections and temporary NAT lifetimes"
created: 2026-10-02
updated: 2026-10-02
---

- Date: 2026-10-02
- Status: Adopted
- Partially supersedes: [0185](0185-mew-desktop-resident-direct-host.md) — Installation and connection preparation without automatic changes to network rules
- Decision makers: User (requested proper implementation of external phone connections without a separate relay), Codex (design)

## Decision

Retain direct WebRTC connections for video and input, OS approval, Mew authentication, and leases. Do not add TURN or server-side video relaying. External connections have a separate verification scope; do not report a successful connection on the same PC as verification of an external phone connection.

The Windows installer prepares inbound UDP access only for the fixed helper's Node executable. If administrator privileges are unavailable, request OS UAC approval, and do not override rejection, explicit blocks, or organizational policies. Report approval failures separately instead of masking them as dependency installation failures or successes. Do not change actual installed instances or firewalls during development.

Only active connections request temporary UDP mappings through PCP, NAT-PMP, or UPnP IGD from the IPv4 default gateway selected by the OS. Use only the current ICE socket's port and an address on the same interface. Request short leases and do not fall back to permanent mappings. Send successfully obtained external addresses and ports as srflx candidates over the same authenticated signaling path. Delete mappings on termination or cancellation, and let leases expire even on failure or abnormal termination. Allow users to disable this automation.

STUN only discovers public addresses without relaying video. Provide default STUN servers from multiple providers and bounded negotiation retries to account for the native library's limitation of selecting one server. Display only limited diagnostics such as candidate counts and discovery status, and do not log addresses, SDP, or ICE credentials.

Do not guarantee direct connections on networks that block all communication or on unsupported CGNAT. Distinguish automatic preparation failures from address discovery, path connection, and video decoding failures. Do not arbitrarily add a separate relay or require users to configure manual port mappings as the default procedure.

## Rationale

[PCP RFC 6887](https://www.rfc-editor.org/rfc/rfc6887.html), [NAT-PMP RFC 6886](https://www.rfc-editor.org/rfc/rfc6886.html), [Microsoft firewall API](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule). The [external direct connectivity contract](../../development/remote-desktop-connectivity.md) owns installation, lifetime, and verification details.
