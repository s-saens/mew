---
title: "0140 — Resolve skills through a managed library"
description: "Replaces native skill folders as Mew's active inventory with common and project libraries, explicit imports, persistent enablement, removable defaults, and one resolver for suggestions and guidance. Keeps MCP source ownership unchanged."
created: "2026-11-05"
updated: "2026-11-05"
status: "accepted"
---

## Context

The [native source management decision](../history/decisions/0157-mew-native-agent-harness-management.md) made each runtime's original files authoritative. The management screen consequently exposed duplicate names, runtime-specific destinations, package dependencies, and read-only copies. Removing one copy could leave another active. Documentation guidance and native runtime discovery could bypass the explicit skill suggestion list.

Users need to understand which skill applies and turn it off without discovering storage precedence or deleting files used by external CLIs.

## Decision

Mew resolves one effective skill per name from a common library and a project library. Project content and enablement override common settings. Native runtime folders supply import candidates, not automatic library registrations. Import preserves the source and carries supporting files. Provenance remains available in details rather than separate active rows.

Use one resolver for management state, explicit suggestions, per-turn workflow selection, documentation routing, and the optional commit workflow. Bundled documentation entrypoints and the commit workflow are initially available. Users can disable or remove them and explicitly restore them; absence after removal must not cause automatic registration. Documentation dependencies remain packaged resources reachable from their parent workflow, not independent active skills.

Codex and Claude Mew sessions suppress native automatic skill discovery through session/process configuration and receive the active catalog with each request. Other adapters receive the same selection guidance without an unverified claim of native suppression. This governs automatic workflow selection, not filesystem permissions or previously supplied conversation text. External CLIs keep their existing files and configuration.

MCP retains its existing native source editor and installation-wide common connections. This decision supersedes the native-source-first approach only for Mew's active skills.

## Alternatives and rationale

Deduplicating the display alone leaves guidance and runtime discovery inconsistent with the controls. Moving every native skill into one folder would affect external CLIs and user-managed links. Mirroring skills into each runtime recreates competing originals. A managed library with explicit imports keeps user files intact and gives Mew one application policy.

## Consequences

Previously discovered native skills require import before Mew presents them as active choices. Library settings apply across runtimes; common settings belong to the installation rather than an individual Mew account. Project overrides must remain visible and reversible. Existing conversations retain old text, and provider-specific automatic discovery controls require adapter verification.

The [skill library contract](../development/skill-library.md) owns storage and application details. The [management guide](../../../docs/configuration/agent-harness.md) owns everyday usage, and the [work record](../work/managed-skill-library.md) records actual checks and remaining limits.
