---
title: "0191 — Require permanent deletion for managed projects"
description: "Requires explicit permanent deletion for projects inside the Mew-managed root and retains file-preserving registration removal for external projects. Partially supersedes ADR 0187."
created: "2026-11-18"
status: accepted
---

## Context

[ADR 0187](0187-project-registration-removal.md) lets owners remove a shared project registration while keeping its files. An external folder has a lifecycle outside Mew. A folder in Mew's managed project root stays in managed storage if an owner only unregisters it.

## Decision

Classify projects by their registered path within the canonical managed root. For a managed project, the owner-only Delete confirmation offers permanent deletion and warns that it erases the folder and its files. Cancel receives initial focus. External projects retain the option to unregister and preserve files.

The registration-only API rejects trees that include managed projects. Permanent deletion continues through the existing explicit endpoint.

## Alternatives and consequences

Preselecting the existing checkbox would still allow owners to leave an unregistered folder in managed storage. Silently converting registration removal into permanent deletion would let an older client erase files without explicit confirmation. The separate operations preserve the meaning of each request. [The registry contract](../development/architecture.md#permanent-project-deletion) describes validation and account reconciliation.
