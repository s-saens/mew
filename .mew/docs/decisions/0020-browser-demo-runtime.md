---
title: "0020 — Shared UI and a Replaceable Demo Runtime"
description: "Decision to inject a browser demo implementation into a shared runtime contract without copying the Mew UI. Defines a single virtual state, local collaboration, in-memory storage, origin separation, and deployment matching the source; the complete file list and on-demand body loading follow subsequent ADR 0027."
created: "2026-10-19"
updated: "2026-10-20"
---

# 0020 — Shared UI and a Replaceable Demo Runtime

Status: Adopted

## Background

Users must be able to try Mew directly at `mew.run/demo` without installation or login. Copying screens for the demo would require maintaining UI changes and bug fixes twice. Returning only fixed API responses causes state inconsistencies between editing, autosave, agent modifications, and Git changes, and cannot support real-time features.

## Decision

Select the demo runtime from a separate HTML entry point, then use the actual Mew app, editor, and panels unchanged. Provide transport, collaboration, initial authentication, and base paths through a shared runtime contract, without adding demo-specific UI branches to each feature. Actual P2P connection status and the demo runtime are separate.

The demo's canonical state is one `DemoWorkspaceStore` per visitor. HTTP, real-time events, the editor, virtual agents, and Git read and modify the same files. Document editing uses actual Yjs and the shared editor schema without replicating the server's synchronization protocol. Replace only operations requiring external commands, models, or hosts with virtual implementations.

Isolate settings, drafts, and caches in memory as well, without using actual users' browser storage or persistent caches. Do not forward unsupported operations to the actual server. The central `/demo` opens the demo on a separate app origin and applies username reservation and existing occupancy checks.

Include UI changes in the next demo build. Verify that source and artifacts match during central deployment and deploy the demo together with them. For new server features, also update the required virtual behavior and contract verification.

## Rationale and Impact

Shared UI improvements need to be implemented only once, and demo state and runtime lifetime are separated from the product server. Reusing the existing `EditorApi`, `EditorCollab`, and transport contracts also reduces the cost of moving every feature to a new abstraction.

The demo implementation and fixtures must be maintained separately. Verify shared interface changes through type and behavior tests; the public demo is updated only after deployment completes. This decision does not provide an actual multitenant server or unrestricted OS command execution.

[Browser Demo](../development/demo.md) owns the specific current contract and user rollout procedures.

Subsequent [ADR 0027](0027-demo-lazy-repository.md) expands file preparation to a complete public file list, a small initial copy, and on-demand body loading. The shared UI, per-visitor virtual state, and boundaries for external connections and in-memory storage remain unchanged.
