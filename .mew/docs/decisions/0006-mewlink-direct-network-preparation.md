---
title: "Automatic Network Preparation for Mewlink Direct Connections"
description: "The decision to add Windows UDP preparation limited to owner actions and short-lived router mappings while retaining direct data connections. Distinguish preparation status, signaling status, and external-network success, and preserve existing registrations and policies."
created: 2026-10-16
updated: 2026-10-16
---

# Automatic Preparation for Mewlink Direct Connections

Status: Approved.

## Background

WebRTC connections failed from a separate phone even though the public device address opened. STUN candidates were generated in production WSL, but Hyper-V blocked inbound traffic by default and there was no dedicated UDP allow rule. A single cause for the external phone failure has not yet been established. The user requested preparation through the connect button alone after deployment and explicitly excluded data relaying.

## Decision

- Transmit workspace data over direct WebRTC connections. Do not add HTTPS, WSS, or TURN data relaying.
- Prepare Windows UDP inbound access only when the local owner registers a device or prepares an existing device for connection. Request UAC approval as needed; do not automatically elevate privileges on server startup, queries, or access from an external phone.
- The preparation scope is the existing UDP `55000–55031`. Preserve existing blocks, conflicts, and administrative policies, and display failures. Distinguish environments that cannot be checked from completed preparation, while allowing registration itself.
- If normal candidates do not establish a connection quickly, reuse the existing PCP/NAT-PMP/UPnP short-lived lease, renewal, and deletion mechanisms, limited to the actual UDP socket and default route.
- Preserve existing registration IDs, keys, and the local authentication boundary. Distinguish signaling availability, OS preparation, candidate gathering, and successful connections from external devices.

## Rationale and Impact

Firewall preparation and temporary mappings on supported routers reduce the manual configuration needed for direct connections. Windows administrator consent and network permission for direct UDP are still required, and success is not guaranteed in every environment, including those with multiple NAT layers or managed network restrictions.

This decision extends the restricted UDP inbound access in [0005](0005-mewlink-domain-and-private-dashboard.md) into an automatic preparation procedure. Preserve direct transmission, central signaling, and the local authentication boundary. [Remote Access Contract](../development/remote-access.md#external-wsl-access-and-udp-inbound-traffic) owns the implementation and validation scope, and [Deployment Documentation](../operations/remote-central.md) owns application procedures.
