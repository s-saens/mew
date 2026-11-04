---
title: "Split Mew into IDE, Run, and remote desktop repositories"
description: "Tracks the planned migration to a private Mew integration workspace with independent IDE, Run, and optional remote desktop repositories. Links the phased plan, architecture decision, and acceptance gates; implementation has not started."
done: false
tags:
  - 기능
created: "2026-11-04"
updated: "2026-11-04"
---

## Goal and status

Organize development under a private `mew/` integration repository containing `mew-ide/`, `mew-run/`, and `mew-remote-desktop/` as independent Git submodules. Keep the IDE public, keep Run private, and make remote desktop an optional installation. Preserve the user-facing Mew name and `mew` command.

Planning is complete; migration has not started. The [migration plan](../docs/work/mew-repository-split-plan.md) owns the sequence, prerequisites, verification, and rollback. [ADR 0132](../docs/decisions/0132-mew-repository-boundaries.md) records the agreed direction and unresolved publication choices.

## Implementation checkpoints

- [ ] Inventory Git history, pending changes, worktrees, active path dependencies, persistent data, and rollback requirements.
- [ ] Define public shared packages and versioned integration contracts; remove dependencies on another repository's internal source paths.
- [ ] Extract the remote desktop engine and installers while retaining Mew authorization and shared Mewlink networking.
- [ ] Prepare independent child repositories and a private integration repository with pinned submodule commits.
- [ ] Make desktop installation explicit and optional; run no desktop helper when the feature is unused.
- [ ] Complete clean-checkout and compatibility checks, then coordinate the physical path cutover with the user.
- [ ] Update owning contracts, guides, operations, and release documentation; record actual verification and remaining limits.

## Completion gates

- [ ] A standalone public IDE checkout installs, builds, tests, and runs without either sibling repository or private credentials.
- [ ] Run builds from declared dependencies and artifacts; its source and history stay outside public IDE distributions.
- [ ] An optional desktop installation retains connection, input, revocation, and cleanup behavior; missing or incompatible helpers have tested recovery paths.
- [ ] The private parent reproduces a verified child-commit combination, and rollback preserves data and unrelated work.

These boxes track migration work, not completion of this planning document. Dates and assignees for implementation have not been scheduled. Server lifecycle operations, launcher execution, deployment, and driver installation remain user-owned under the [execution rules](../docs/development/getting-started.md).
