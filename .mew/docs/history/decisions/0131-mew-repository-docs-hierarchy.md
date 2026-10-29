---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate mew startup guidance from hierarchical repository documentation. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0131 — Separate mew startup guidance from hierarchical repository documentation"
created: 2026-09-11
updated: 2026-09-11
---

- Date: 2026-09-11
- Status: Superseded by: 0132
- Supersession confirmed: 2026-09-11 — [0132](0132-docs-project-owned-documentation.md). The Mew-only exception was absorbed into a README + docs structure for all owning projects, and the limits on central storage of operational documents were also changed.
- Partially supersedes: 0012 — the single-README-file restriction on detailed references coupled to Mew code
- Decision makers: User (requested keeping run instructions in the root README and separating documentation into mew/docs) + agent (structure design and execution)

## Background

The mew README grew to 858 lines, making it difficult to find run instructions
or read only the contract for a specific feature. The user requested hierarchical documentation in
`mew/docs/` while keeping run instructions in the root README. The filename allowlist in [ADR 0012](0012-docs-repo-doc-allowlist-and-absorption.md) prevents this separation.

## Options

1. Keep all details in the README — complies with the existing allowlist, but the entry document keeps growing.
2. Move details to the company SSoT — contracts that change with the code would reside outside the standalone repository.
3. Allow `docs/` only for mew — separates the execution entry point from detailed references while preserving the company SSoT boundary.

## Decision

Adopt option 3. Do not change the allowlists for other code repositories.

- `mew/README.md`: Product introduction, required tools, installation, run, and validation commands, execution invariants, and entry points to detailed documentation.
- `mew/docs/MOC.md`: A brief map of usage, configuration, deployment, and development. Select only the documents needed from MOCs for narrower scopes.
- `mew/docs/`: Detailed references that change with the code, including current UI behavior, configuration, deployment procedures, code structure, APIs, storage formats, and protocols.
- `mew/SECURITY.md`: The existing canonical source for roles, authentication, and guest boundaries. Link to it from other documents without duplicating it.
- Company operational records and decisions that are difficult to reverse remain in the existing `.mew/docs/ops/mew/` and `.mew/docs/decisions/`. Do not create a separate
  company constitution, original ADRs, or operational history in `mew/docs/`.
- When adding or moving documents, update the relevant MOC and relative links together. When changing code, update the relevant detailed references in the same change.
- Add only the exact `mew/docs/` path as an exception to workspace documentation checks. Do
  not allow arbitrary `.md` files elsewhere, and use lowercase kebab-case for new filenames.

## Rationale

Run information must be available on the first screen, and implementation work must require reading
only the relevant topic. Detailed references in the repository are the single canonical source moved from the README
body, not a copy of the company SSoT. This preserves the self-contained repository direction of [ADR 0023](0023-mew-selfhost-packaging-repo.md) and the shared change lifecycle of code and documentation.
