---
title: "Mew repository separation plan"
description: "Plans the staged move to a private Mew integration workspace with IDE, Run, and remote desktop repositories. Covers current dependency edges, optional installation, Git and data preservation, clean-checkout verification, and user-managed cutover and rollback."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and scope

Implement the repository boundaries accepted in [ADR 0132](../decisions/0132-mew-repository-boundaries.md). The [task](../../tasks/Mew를%20IDE·Run·원격%20데스크톱%20저장소로%20분리.md) owns implementation status. This document is a plan; no repositories, runtime paths, installations, or services have been changed by this planning work.

```text
mew/                       private integration repository
  mew-ide/                 public Mew repository, pinned submodule
  mew-run/                 private Mewlink repository, pinned submodule
  mew-remote-desktop/       independent optional component, pinned submodule
```

Retain the IDE's repository identity and history, product name, and `mew` command. Renaming the local folder does not require renaming the hosted repository, npm packages, protocol fields, or deployed Mewlink service. Choose desktop repository visibility and its release channel before publication.

## Current dependencies to separate

The November 4 source inspection found these migration entry points:

| Area | Current coupling | Planned boundary |
| --- | --- | --- |
| Run source and configuration | The ignored `mewlink/` repository imports parent `shared/`, `src/utils/`, TypeScript configuration, and browser test tooling. | Explicit shared packages, local configuration, and declared test dependencies. |
| Run frontend and demo | `mewlink/vite.config.ts` reads parent public worker/launcher assets. Its deploy script builds the parent demo; `tools/demo-distribution.mjs` defaults to `mewlink/dist/demo`. | Versioned frontend assets and an explicit demo artifact handoff. Move central-only tooling to Run or the private parent. |
| IDE tooling | Root package scripts and `tools/port-preview-readiness.mjs` assume a nested `mewlink/` checkout. | Standalone IDE checks plus separate private integration commands with explicit paths. |
| Desktop implementation | `native/remote-desktop/`, desktop server adapters, and viewer code span installation, control, capture, and input. | Native engine/installers in the desktop repository; IDE UI and authorization adapters consume a declared helper interface. |
| Shared networking | `server/remote-access-rtc.mjs` imports NAT/connectivity utilities from the desktop directory and uses root `node-datachannel`. | Public shared networking remains available to IDE/Mewlink without the desktop package. |
| Setup and distribution | The `mew` setup prepares desktop components; server startup can warm an installed helper; `server/release-runtime.ts` includes native desktop source. | Explicit optional installation, on-use helper startup, and independently tested distribution contents. |

Private checkout paths above are inventory references, not documentation dependencies. Current contracts remain in [central operations](../operations/remote-central.md), [remote access](../development/remote-access.md), [desktop architecture](../development/remote-desktop.md), and [CLI distribution](../development/cli-distribution.md).

## Phase 1: preserve the baseline and choose delivery

1. Inventory both Git repositories, branches, linked worktrees, submodule state, staged/unstaged/untracked work, and required ignored state. Preserve unrelated work and the ongoing desktop latency and virtual display work; extraction must include the final reviewed implementation, not an older snapshot.
2. Follow the existing [source relocation procedure](../../../docs/operations/project-location.md). Inspect process working directories, tmux sessions, editor/agent supervisors, debugger settings, configured paths, and helper installations. Plan around active path dependencies. The user coordinates shutdown and waits for independent writers before stored-state migration, then performs any later restart. A symlink alone does not complete the move.
3. Preserve accounts, project registries, conversations, `.data/`, environment configuration, credentials, signing material, and installed helper state in protected local backups. Record a source-to-target path map without putting private contents in Git or documentation. Migrate path-derived keys and filenames according to their storage formats, resolve destination collisions, and preserve transcript payloads and counts. Use consistent SQLite backups rather than copying only a live database file.
4. Select remote desktop visibility and binary/package delivery. Preserve the [distribution and source obligations](../development/remote-desktop-distribution.md). Record shared package versions and the compatibility policy before extraction.
5. Establish rollback source commits and verify local recovery copies. Keep private central source out of public trees, archives, package contents, and history, including the legacy paths identified by the central runbook. Inspect history before any new publication; do not rewrite published history during this task without a separate decision.

Exit gate: a reviewed inventory, delivery choices, compatible baseline commits, and a reversible path plan. Repository credentials and remote creation are separate setup steps; planning does not create or publish repositories.

## Phase 2: make dependency boundaries explicit

1. Catalog cross-repository imports, configuration inheritance, static assets, fixture access, demo output, and release scripts. Give each shared unit one canonical owner; avoid copied protocol implementations.
2. Group public shared protocol, browser transport, networking, and required assets into focused package interfaces. They may initially live in `mew-ide`; a fourth repository is not required. Published or packaged consumers must resolve declared, pinned dependencies without sibling internal paths. Local linking may support coordinated development.
3. Give Run its own build/test configuration and explicit demo artifact input. Replace the nested-folder assumptions in IDE scripts and central-only checks.
4. Define helper protocol version/capability checks, compatible engine releases, and missing/incompatible-helper recovery. Preserve session identity, authorization leases, exclusive control, input release, and shutdown behavior. Repository boundaries do not authorize a new unauthenticated network listener.

Exit gate: independently resolvable dependency graphs, a documented compatibility policy, and tests for missing components and incompatible versions.

## Phase 3: prepare child repositories and the private parent

1. Prepare a temporary sibling workspace before replacing the current primary path. Preserve the public IDE repository's history and existing Run history. Extract desktop history/source with provenance and notices; do not import unrelated private files into a public repository.
2. Map the existing IDE checkout to `mew-ide`, Run to `mew-run`, and the extracted native implementation to `mew-remote-desktop`. Retain IDE viewer and permission adapters; relocate native helpers and installers through the interfaces from phase 2.
3. Create the private parent with submodule declarations, compatible child commit pins, bootstrap instructions, and integration commands. Commit child changes before advancing parent pointers. Parent instructions cover coordination; each child keeps its own authoritative project rules.
4. Preserve worktree relationships. Verify `/.worktrees/` in the IDE ignore rules before creating worktrees, and keep new ones under the IDE primary checkout's `.worktrees/<branch-slug>`. Use `git worktree move` for supported linked-worktree moves after checking process dependencies. Do not assume that command can move the primary checkout; plan a verified clone/transfer and worktree metadata repair as needed.

Exit gate: a fresh private parent checkout reproduces the chosen revisions, and each child has its own working build/test entry points. Do not change live paths yet.

## Phase 4: make desktop installation optional

1. Remove automatic desktop installation from ordinary IDE setup and native desktop payloads from the default IDE distribution. Keep shared networking dependencies needed by Mewlink.
2. Offer an explicit install action on first desktop use, with status, progress, retry, and version diagnostics. Install through the selected release/package mechanism; document OS permissions and any required driver preparation.
3. Start the helper on desktop use. Define and test its idle/session cleanup policy so opening the IDE alone creates no desktop helper or capture/encoding work.
4. Preserve existing installations and settings through a documented compatibility/migration path. Uninstall must remove only desktop-owned files. Do not delete shared Rust/C++ toolchains or other projects' caches.

Exit gate: users without desktop get a complete IDE, while users who install it retain the existing authenticated viewer and native session behavior. Record measured clean-install disk costs; repository separation alone does not reclaim an existing helper installation.

## Phase 5: verify and cut over

Run applicable automated checks before marking implementation complete:

| Scope | Required evidence |
| --- | --- |
| Public IDE alone | Fresh checkout with no private siblings: install, applicable tests/type/lint/docs checks, and `npm run build`. Verify package/runtime/demo contents exclude private sources and optional desktop payloads. |
| Run | Its declared type checks, tests, and build with pinned shared dependencies and demo artifacts. Use isolated central fixtures; record actual external-service checks separately. |
| Desktop | Relevant native/Rust, installer, helper version, permission/revocation, input release, disconnect, and shutdown regressions. Keep OS compilation separate from real capture, signing, and driver installation. |
| Integration | Pinned child combination; Mewlink direct access/recovery without desktop; optional desktop connection and incompatible-helper recovery; public/private source exclusion. Browser checks follow the [existing browser-testing contract](../development/browser-testing.md). |
| Cutover | Git/worktree integrity, preserved pending work and data, repaired configured paths, and a demonstrated rollback path. |

Update affected feature contracts, architecture, public installation guides, central operations, desktop distribution, CLI releases, and document descriptions with each implementation phase. When the physical move is applied, link the local-path follow-up from ADR 0001 while preserving its independent-project principle and original relocation history. Repair incoming links when files move; preserve historical decisions and work records. Repository naming alone must not change Worker/D1/DO resources, service domains, OAuth callbacks, registration keys, or device trust.

After local gates pass, the user coordinates the physical path switch and operational application. Agents must not deploy, execute the Mew launcher, start/stop/restart servers, or install/sign drivers. Report local checks separately from the user's runtime and physical-device acceptance.

## Rollback

Keep the original checkout/data backups until user acceptance. If a pre-cutover gate fails, leave live paths untouched and continue from the temporary workspace. After cutover, the user coordinates service operations; restore the prior compatible child pins, path configuration, and retained helper version without overwriting newer project data or pending work. Avoid database, identity, or wire-format changes in the repository move so rollback does not require a data migration. A future incompatible schema change needs its own migration and recovery plan.

## Planning verification

`npm run check:docs` passed with 690 descriptions, zero metadata errors, and zero local-link errors. The three new documents received an independent read-only review with no material issues. This planning task has not run application builds, tests, deployment, server operations, or migration commands. Runtime behavior remains unchanged; implementation acceptance belongs to the linked task.
