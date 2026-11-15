---
title: "Use wiki for new managed project documentation"
description: "Records the choice of .mew/wiki for newly created managed projects and preservation of existing configured and legacy document paths."
created: "2026-11-15"
updated: "2026-11-15"
---

## Status

Accepted for new managed projects. Migration of the Mew source repository and existing projects is separate and not yet applied.

## Context

Root `docs/` commonly contains user-facing guides. Project documentation also includes implementation contracts, decisions, and work records. New managed projects need a distinct location without overriding existing project settings.

## Decision

Create `.mew/wiki/` as the Documents location for newly created managed projects. Discover it when no saved setting, applicable fallback, root `docs/`, or legacy `.mew/docs/` selects another path. Continue honoring configured paths and legacy folders; do not move existing project content automatically. This extends [ADR 0087](0087-documentation-role-boundaries.md) for new managed projects.

## Alternatives and consequences

Keeping `.mew/docs/` makes the two roles harder to distinguish; `.mew/project-docs/` is more explicit but longer. `wiki` gives the project documentation a short, recognizable name. The name does not require wiki software or a navigation registry. Existing installations retain their selected paths and do not receive the new server behavior until their server code is reloaded.
