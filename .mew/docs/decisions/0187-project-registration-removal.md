---
title: "0187 — Remove project registration without deleting files"
description: "Extends the project deletion contract with owner-only removal of a registered project tree while preserving files by default and excluding it from automatic rediscovery. ADR 0191 limits this option to external project trees."
created: "2026-11-17"
status: accepted
---

[ADR 0191](0191-managed-project-permanent-deletion.md) supersedes this decision for Mew-managed projects.

## Context

[ADR 0151](0151-permanent-project-deletion.md) separated a personal shortcut from irreversible folder deletion. Users also need to remove a project from the shared catalog without deleting its files. Discovery otherwise re-registers managed and nested folders immediately.

## Decision

The owner-only Delete dialog defaults to removing shared registration and account shortcuts, with a separate unchecked checkbox for irreversible disk deletion. The existing permanent deletion endpoint retains its behavior. A separate registration-removal endpoint preserves the folder and records a subtree exclusion; explicit linking clears an applicable exclusion. Both operations reconcile affected account roots. Personal shortcut removal remains separate.

## Alternatives and rationale

Keeping only shortcut removal leaves the project in the shared catalog. Reusing the existing deletion endpoint with a new optional flag risks an older server ignoring the flag and deleting files. A dedicated endpoint fails safely against an older server.

## Consequences

Unregistering affects all accounts and may clear active roots, but preserves the disk contents. Exclusions prevent automatic rediscovery until an explicit link. Disk deletion remains irreversible and retains the existing protected-path checks. The [registry contract](../development/architecture.md#permanent-project-deletion) and [project selection contract](../features/projects-files-search/opening-projects-tabs-and-groups.md) describe the current behavior. This decision supersedes ADR 0151's dismissal of registration removal and its two-stage deletion menu, while preserving its permanent-deletion safety boundary.
