---
title: "Shared project registry and personal project shortcuts"
description: "Accepts a shared projects.yaml catalog with per-account My Projects, name-only managed creation in ~/.mew/projects, explicit existing-folder linking, and agent-assisted discovery using the existing conversation panel. Supersedes the account-isolated catalog and member restriction in ADR 0070 while retaining file, feature, server-operation, and account-root boundaries. ADR 0124 extends managed cloning and nested discovery; ADR 0151 adds a separate owner-only permanent deletion API."
created: "2026-11-02"
updated: "2026-11-06"
---

## Status

Accepted at the user's request. Extended by [ADR 0124](0124-managed-clone-and-project-discovery.md) for managed cloning and nested catalog discovery, and [ADR 0151](0151-permanent-project-deletion.md) for explicit owner-only permanent folder deletion. Shortcut removal retains its original preservation contract. Partially supersedes [ADR 0070](0070-manager-project-access.md): registered projects are shared across signed-in accounts, and members can discover, create, link, pin, and select them. Per-account active roots and workspace restoration remain. Existing arbitrary server folder/Git operations, subproject/worktree operations, and owner-only administration retain their previous boundaries. Shared icon APIs also allow members for registered roots.

## Context

Adding a project required finding a server directory before working. This made a new installation depend on understanding paths, and conflated the instance's available projects with one account's quick-access list. The user requested name-only creation, optional Git initialized by default, an agent-guided creation path, existing-folder linking, and one shared catalog with independent personal shortcuts.

## Decision

Use `DATA_DIR/projects.yaml` as the canonical instance-wide registry and per-account My Projects ledger. A registered project records its absolute path, display name, and managed/linked origin. Each normalized account ID owns an ordered shortcut list in the same file. Creating or linking registers the project and pins it for the creator; another account can pin the same project without copying files or changing the creator's list. Removing a shortcut preserves global registration and all project files.

Create managed folders beneath `~/.mew/projects/<name>` using a safe single directory name. Creation never overwrites an existing folder. Every managed project receives an empty `.mew/docs/` directory as its detected Documents location, keeping an empty project’s root limited to `.mew/` and optional Git files. Git is checked by default and adds `.git/` and a `.gitignore` excluding Mew temporary uploads. Keep linking as an explicit server-folder branch, preserving existing folder locations and contents. Default project lists and ordinary creation work with names rather than asking for storage paths.

Replace automatic presentation of the startup folder for a new account with project onboarding. Keep the server's fallback path internal for compatibility; expose whether the account actually has a project so the UI does not mount project work against an implicit root.

Allow signed-in non-guests, including members, to browse the registry, maintain My Projects, create managed projects, link existing directories, and select registered roots. Existing file and feature rules still control contents and tools. Signed-in users may read and edit shared project icons; members are restricted to registered roots. Guests do not gain catalog or project-management access. Arbitrary OS write and Git operations retain their existing checks.

For **Create with agent**, create and open the managed project, then embed the normal `AgentPanel` in a popup. Start one new conversation with a one-time discovery prompt that asks about the project first. Apply existing default and project guidance to the resulting documentation and implementation. Retain ordinary runtime selection, permissions, authentication, transcript storage, reconnect behavior, and access to the conversation after the popup closes.

Migrate all legacy account project lists when YAML is first created, preserving their order and compatibility data. Use saved active roots only for accounts without a legacy list. Preserve old JSON rather than deleting historical data. Keep active roots and per-project UI in their existing account ledger; the catalog does not become the active-root owner.

## Alternatives and rationale

Keeping paths as the primary creation control would preserve the original friction. Hiding a default path while retaining separate private catalogs would not provide the requested shared discovery. Treating My Projects as directories or copies would duplicate files and break shared collaboration, so it is an ordered link list instead.

Putting project folders inside `DATA_DIR` would mix user work with protected server state and couple their location to installation settings. A fixed managed root separates project material from instance metadata. YAML keeps shared registration and personal shortcuts in one reviewable file with atomic replacement; a database is unnecessary for this small ledger.

A separate setup chatbot would duplicate the normal conversation component's runtime, permission, storage, and recovery behavior. Reusing AgentPanel preserves those contracts and keeps the resulting conversation available for further work. Prompt-guided discovery does not guarantee a provider's behavior or successful implementation.

## Consequences

Registering a project makes it discoverable to all signed-in users of the instance. Personal shortcuts do not provide privacy; operators continue to use file and feature permissions. Existing roots, files, sessions, and other users' active views are preserved. Missing catalog directories remain listed for unavailable mounts, and opening them can fail without removing their records.

The [architecture contract](../development/architecture.md#shared-project-registry-and-my-projects) owns storage, migration, and API shapes. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md), [UI contract](../development/ui-contracts.md#shared-ui-for-adding-projects-and-browsing-server-files), and [agent session contract](../development/agent-sessions.md#agent-assisted-project-creation) own current behavior. [The work record](../work/shared-project-registry.md) separates local checks from runtime application.
