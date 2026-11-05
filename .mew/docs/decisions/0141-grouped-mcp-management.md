---
title: "0141 — Group MCP connections independently of credentials"
description: "Adds service groups and common/project usage to the existing installation MCP registry while keeping authentication independent. Defines opt-in Cloudflare consolidation, safe project-only registration, and native source boundaries."
created: "2026-11-05"
updated: "2026-11-05"
status: "accepted"
---

## Context

[ADR 0127](0127-installation-wide-mcp.md) provides one shared registry and credential cache. [ADR 0128](0128-shared-mcp-readiness.md) excludes unprepared connections from ACP startup. The source editor still presents runtime locations as the main organization, so services with several endpoints, such as Cloudflare, require repeated management.

Users need one service row with optional individual choices and a project-specific use setting. Authentication must survive a use toggle. Project-only setup must not make a new connection active in other projects, including after a partial write failure.

## Decision

Make grouped Mew connections the default MCP view. Keep native configuration editing and imports in an external/advanced view. Store group membership and common usage in private management metadata beside the existing registry; store project overrides without credentials under `.mew`. Share one project-boundary helper with skill management.

A group is a gate over its members. Turning it off preserves their individual choices. Project overrides inherit common settings when cleared. Owners manage shared definitions, groups, and authentication; agent-enabled accounts can change only project usage. A use toggle neither logs out nor cancels a pending approval. The registry's existing `enabled` flag becomes a common default that an explicit usage setting can override. Saved readiness still gates injection independently.

Infer a Cloudflare group from official remote MCP hosts without changing the registry on reads. Let owners add the official unified API connection and explicitly select dedicated Mew connections to turn off. Require a prepared unified connection before retiring existing choices. Preserve original definitions, credentials, and native settings. For project-only registration, write a disabled source default before usage sidecars so a later disk failure cannot expose it to other projects.

Apply resolved common/project/group usage and saved readiness on ACP creation, clearing, and loading. Preserve debugger and Mewpet bindings. Existing conversations keep their tools. Native runtime originals can still load independently; do not imply that Mew group switches suppress them or share their OAuth stores.

## Alternatives and rationale

Grouping rows without a central use resolver would leave controls disconnected from runtime application. Duplicating connections by project would duplicate authentication and drift. Reusing logout as an off switch would unnecessarily clear shared credentials. Automatically disabling every specialized Cloudflare endpoint would assume feature and account equivalence that has not been established.

The existing shared bridge remains the transport boundary. A small metadata layer supplies grouping and usage without another registry or credential implementation.

## Consequences

Connection readiness and usage become separate visible states. Removing a group keeps connections and authentication and lets individual settings apply again; the UI must explain that consequence. Partial multi-file registration reports the preserved source and asks the user to refresh. Raw native source behavior remains outside group controls.

The [management contract](../development/mcp-management.md), [connection contract](../development/shared-mcp.md), and [user guide](../../../docs/configuration/agent-harness.md) own current behavior. The [work record](../work/grouped-mcp-management.md) records actual verification. This extends ADRs 0127/0128 and the MCP boundary retained by [ADR 0140](0140-managed-skill-library.md).
