---
title: "0001 — Mew as an Independent Project and Document Ownership"
description: "Records the decision to separate Mew from the Liiiiv workspace and use repository-local instructions, decisions, and validation as the basis, along with the operational conditions for moving the local folder."
created: 2026-10-14
updated: 2026-10-14
---

- Status: Adopted
- Decision maker: User instruction
- Partially supersedes: The portions of the previous workspace's document ownership, central ADR, shared checks, and registration rules that applied to Mew

## Background

Mew's source repository was an independent Git repository, but its instructions, decision records, and document check commands depended on Liiiiv's parent folder. Cloning it elsewhere or moving the folder broke required entry points and supporting links.

## Decision

- The root `AGENTS.md` owns Mew's instructions, and `docs/README.md` owns document ownership and authoring rules. Remove the obligation to read or update the parent Liiiiv instructions and central documents.
- Record new Mew decisions in `.mew/docs/decisions/`. Local numbering starts at `0001` and is distinct from the previous central numbering.
- Move the original text of previous Mew ADRs and the document policies referenced by those decisions to `.mew/docs/history/decisions/`. Preserve their original numbers, dates, subsequent decisions, and content, adjusting only links to repository-local locations. Do not synchronize with external originals. The company policies from that time are not current Mew instructions.
- Feature, development, and operations documents own the current contracts. Migrated ADRs serve as history for checking the rationale behind choices and subsequent changes. For changes that conflict with existing decisions, record the scope and reasons in a new Mew ADR.
- Retain the principles of description-based navigation, document updates within the same task, preservation of original text in history, and read-only archives. Do not change other projects' document structures or rules.
- Run document checks using tools within the repository. Do not depend on scripts or MOC registration in other repositories.
- Move the source location in this development environment from `~/dev/liiiiv/mew` to `~/dev/mew`. This is a personal installation path, not a requirement for other installations. Preserve Git history, uncommitted changes, and `.data/`, and update launchers, settings, and saved paths together.

## Operational Conditions

Running servers and agents retain the absolute paths from startup. Follow [Changing the Repository Location](../../../docs/operations/project-location.md) to apply the folder move. Retain the existing approval scope for restarts and builds in [Execution and Validation Rules](../development/getting-started.md).

Do not rename Git remotes, npm scopes, or service domains as part of this folder and documentation boundary change.
