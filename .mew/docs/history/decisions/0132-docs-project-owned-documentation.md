---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Keep project documentation in the owning project and ADRs at the root. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0132 — Keep project documentation in the owning project and ADRs at the root"
created: 2026-09-11
updated: 2026-09-11
---

- Date: 2026-09-11
- Status: Adopted
- Follow-up decision: [0178](0178-mew-multilingual-readme-router.md) — the mew README's role as an introduction and language-specific guide, and entry paths to MOCs
- Partially supersedes: 0003·0008·0012 — locations for product-specific documentation and write-back, the single-README-file restriction, the mew-only exception, and the scope of central storage for operational documentation
- Supersedes: [0131](0131-mew-repository-docs-hierarchy.md) — absorbs the Mew-only exception into a common project ownership structure
- Decision makers: User (requested organizing all product-specific content into README run instructions and indexes plus separate documents, while keeping ADRs at the root) + agent (design and migration)

## Background

[ADR 0131](0131-mew-repository-docs-hierarchy.md) separated mew's run instructions from its detailed references. The user requested extending this structure
to all products and projects and moving project-specific content from the root SSoT into each owning project.

## Options

1. Keep product definitions and operations centrally, and only code contracts in projects — information for one product remains split between two locations.
2. Move all documents and ADRs to each repository — makes it difficult to find common decisions and cross-project impacts in one place.
3. Keep project-specific documents in the owning project, and common knowledge and ADRs centrally — shortens navigation paths while preserving an owner for each fact.

## Decision

Adopt option 3. Document placement is based on **the project that owns the content** rather than whether it is coupled to code.

- `<프로젝트>/README.md` contains what the project is, run instructions, required configuration, validation commands, work invariants, and an index of detailed documentation.
- Select only the needed areas from `<프로젝트>/docs/MOC.md`. Keep product definitions, roadmaps, specs, research, usage instructions, development contracts, operations, and ongoing work in a single canonical source in that project's `docs/`.
- If the README is short and there is no detailed documentation, do not create an empty `docs/`. Apply the structure above when detailed content becomes necessary.
- If a shared service has an owning project, keep its documentation in that project too. Do not create central copies for med-gen, AI/TTS, or similar services merely because multiple consumers use them. Consumer documentation links to the owner's canonical source.
- Keep all original ADRs and ADR scope maps in `.mew/docs/decisions/`. Do not create or duplicate ADRs in projects. Preserve existing decision bodies and adjust only the links needed for migration.
- The root `.mew/docs/` covers the company, brand, shared service inventory, cross-project policies, development environments, support programs, events, common references, and immutable archives. A product appearing in a support program submission or event record does not change that record's owner.
- Read in this order: root `AGENTS.md` → brief central common rules → owning project's README → needed docs documents and relevant central ADRs. Do not recursively load all products, ADRs, or history.
- When code and documentation both need changes, update the project's docs in the same task. For technical decisions, also update central ADRs; for port, domain, or account changes, also update the central service inventory.
- The central product and project maps and repository inventory link to each project without duplicating detailed content. During migration, update relative links, documentation maps, and the machine-readable list of documentation boundaries together.
- Preserve existing original research, responses, and attachments, and distinguish their navigation scope with `History / raw`. Do not move or modify `archives/`. Do not reset review dates for current facts merely because files were moved.
- Allow Markdown in project `docs/`; elsewhere, allow only the existing four filenames. The checker checks links and MOC reachability within registered boundaries and explicitly skips external boundaries in central CI where other repositories are absent. Workspace checks also verify that targets actually exist.

## Rationale

Anyone reading about or implementing a product should be able to find sufficient context in that project's README. A single
source of truth does not mean that all content must be in the same Git repository; it means that each fact has one canonical source and one owner. Keeping shared
rules and ADRs centralized also preserves consistency across projects and the lineage of decisions.

## Migration results

- Moved 102 project-specific documents, research responses, and attachments from the central location to their owning projects. Connected run instructions and detailed indexes through the README + docs structure in 10 projects. The QR and Gantt tools, which have no detailed content, retain their READMEs as entry points.
- Preserved the old mew README copy that remained at the workspace root in mew's History / raw, and changed the root README into an entry point for all projects.
- Kept the existing central archives and original ADR locations. Adjusted links in moved content and documentation paths in code, and left research attachments byte-for-byte unchanged.
- The documentation boundary checker verifies registered project existence, README indexes, MOC reachability, and links to Markdown and HTML attachments. It checks CI with only the central repository checked out and the full workspace separately.
