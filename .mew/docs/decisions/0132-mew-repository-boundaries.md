---
title: "Separate Mew IDE, Run, and remote desktop repositories"
description: "Accepts a private Mew integration repository with independent IDE, Run, and optional remote desktop submodules. Defines ownership and publication boundaries while keeping existing runtime contracts in force until migration is verified."
created: "2026-11-04"
updated: "2026-11-04"
status: "Accepted direction; migration pending"
---

## Context

Mew's public source currently contains the optional remote desktop implementation. Mewlink has an independent Git repository inside the ignored `mewlink/` directory, but still imports parent source, configuration, assets, and build tooling. Its current boundaries are documented in the [central service runbook](../operations/remote-central.md#location-and-deployment-configuration).

The owner wants a clear separation between the public workspace, the private central service, and optional desktop components, while retaining coordinated development. Moving repositories alone does not reduce installed desktop storage or make either component independently buildable.

## Decision

Use a private integration repository named `mew` with three independent child repositories recorded as Git submodules:

| Child | Responsibility | Publication boundary |
| --- | --- | --- |
| `mew-ide` | The current Mew workspace, UI, local accounts, permissions, and integration adapters | Keep the existing public repository identity and history. Preserve the Mew product name and `mew` command. |
| `mew-run` | The current Mewlink central authentication, device registration, signaling, and service frontend | Keep the source repository private. This repository name does not itself change service URLs or protocol names. |
| `mew-remote-desktop` | OS-specific capture and input, GPU encoding, native engine, helper installation, and drivers | Install separately on demand. Decide source visibility, release location, and third-party distribution obligations before publication. |

The private parent owns compatible child-commit pins and integration tooling. Each child retains its own instructions, documentation, tests, and releases. This preserves [ADR 0001](0001-independent-project.md); the parent does not impose another project's policies on Mew IDE.

Public IDE installation must work without access to the private parent or Run. Shared protocol, browser transport, and asset dependencies must have explicit package or artifact interfaces. Keep Mewlink networking available when desktop components are absent. IDE authorization and session revocation continue to control desktop access.

Implement through the [migration plan](../work/mew-repository-split-plan.md), tracked by the [task](../../tasks/Mew를%20IDE·Run·원격%20데스크톱%20저장소로%20분리.md). This decision accepts the target direction; it does not claim a completed move or supersede current runtime and operational contracts. Update those owners when their implementation changes.

## Alternatives and rationale

- Keeping the ignored nested Run repository requires no migration, but retains public/private directory overlap and implicit parent dependencies.
- Keeping desktop as an optional module in the IDE is a smaller change and can reduce default installation cost. Separate repositories also establish independent release and ownership boundaries, which the owner selected.
- Placing a private Run submodule in the public IDE couples recursive source checkout to private access. Keep that relationship in the private parent instead.
- A single public repository cannot hold the private central implementation. A single private repository with generated public exports would introduce a separate publication and history-filtering workflow.

## Consequences and open choices

Cross-repository changes require compatible releases and child commits before updating the parent pins. Test declared dependencies and wire compatibility rather than relying on sibling source paths. Submodule maintenance adds work, but makes tested combinations reproducible.

Before implementation, select remote desktop visibility and delivery, shared package names and distribution, and the physical cutover procedure. Preserve licenses, required dependency sources, Git provenance, local data, and pending work. The migration must not rename production services or rewrite public history as an incidental effect.
