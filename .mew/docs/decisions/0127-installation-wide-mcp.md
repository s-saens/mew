---
title: "0127 — Installation-wide common MCP connections"
description: "Shares one Mew MCP registry and credential cache across installation accounts, with owner-only management and initiator-owned authorization jobs. Supersedes ADR 0120's private ownership without automatically publishing existing private data."
created: "2026-11-03"
updated: "2026-11-04"
status: "accepted"
---

## Context

[ADR 0120](0120-shared-mcp.md) removed repeated registration and authorization across runtimes but kept a separate common registry for each Mew login account. The user requested one registration shared by all accounts on the same installation.

## Decision

Use one installation-owned registry at `DATA_DIR/mcp/servers.json` and one associated credential cache. All authenticated accounts with agent permission use its enabled definitions through the existing ACP stdio bridge. Owners with agent permission manage common definitions, raw details, imports, and authentication changes.

Keep authorization jobs and login desktops bound to their initiating account and live access. Permit one job per shared registry/server name across accounts. Preserve the installation registry and credentials when an account is deleted. The scope change leaves account-private originals untouched, without automatically merging them or using them as a fallback; owners explicitly register or import shared definitions.

This supersedes ADR 0120's account-private registry and credential ownership and its deletion policy. Native import preservation, separate native authentication, transport bridging, refresh coordination, and credential epochs remain in effect.

## Alternatives and rationale

Duplicating definitions and credentials into every account would retain drift and require repeated updates. Automatically merging existing private registries would expose previously private configuration and create ambiguous name and credential conflicts. Keeping account-private registries would not satisfy installation-wide reuse.

One canonical registry matches the requested sharing boundary. Owner-only management limits who can change shared tools and authentication, while agent permission controls who can use them. Keeping each approval with its initiating account preserves the existing host-browser and live-access boundaries.

## Consequences

[ADR 0128](0128-shared-mcp-readiness.md) later narrows ACP injection to enabled definitions whose saved connection status is `connected`. Registration and credential ownership remain installation-wide.

A definition, authentication change, or disconnect affects all accounts using that connection. Account removal preserves shared authentication; existing cleanup of the deleted account's legacy private MCP data remains. Existing private registrations require an explicit owner action before they become shared. Native registrations remain available independently and may produce duplicate bindings after import. This remains an OS-user execution boundary, not process isolation between Mew accounts.

The [common MCP contract](../development/shared-mcp.md) owns storage, API, authentication, and session behavior. The [user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) owns controls; the [work record](../work/shared-mcp.md) distinguishes local verification from runtime application.
