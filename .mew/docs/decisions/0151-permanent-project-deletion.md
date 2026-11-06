---
title: "0151 — Separate shortcut removal from permanent project deletion"
description: "Adds owner-only permanent deletion of a registered project folder with protected-path validation, shared catalog cleanup, deleted-path tombstones, and account reconciliation. Extends ADR 0118 while preserving shortcut-only removal, and records the explicit confirmation and failure boundaries."
created: "2026-11-06"
updated: "2026-11-06"
status: accepted
---

## Context

[ADR 0118](0118-shared-project-registry.md) separates the shared project catalog from each account's My Projects shortcuts. Removing a shortcut preserves the project folder, global registration, and other accounts' lists. The user also needs an explicit way to delete the actual project, with the personal list menu offering both operations without conflating their consequences.

A registered folder may be managed by Mew or linked from another server location. It may contain nested registered projects or be selected by several accounts. A filesystem delete alone would leave catalog entries, shortcuts, and saved active roots pointing at removed folders. Reusing shortcut removal for that operation would silently change its established preservation contract.

## Decision

Keep shortcut removal unchanged. The project context menu first offers Edit and Delete. Delete reveals Remove from My Projects and, for owners only, Delete permanently in the same menu. Permanent deletion requires a separate confirmation naming the project and folder and explaining that its files are deleted and its entries removed from every account. Focus Cancel initially, block dismissal and duplicate submission while busy, and retain errors for retry.

Add an owner-only `DELETE /api/project-registry` operation accepting `{ path }`. Require an existing registered canonical directory, revalidate the target, and reject a root replaced by a symlink. Protect filesystem root, the server user's home, instance data and registry storage, the Mew source root, and ancestors whose deletion would contain those locations. Individual managed projects remain deletable when project storage and instance data share a `.mew` parent.

After deleting the actual directory and its contents, remove the project and registered descendants from the shared catalog and every account's shortcuts and compatibility references. Keep exact removed registered paths in optional version-1 `deletedPaths` tombstones. Compatible personal-list writes reject these paths so stale saves cannot resurrect the deleted project, while preserving legacy recovery for other unavailable folders. Explicit creation, linking, or discovery of a real folder at that path clears its tombstone.

Clear affected saved active roots and send account-scoped `projects-deleted` signals to accounts with affected shortcuts or active roots; changed active roots also receive workspace signals. Personal-list hooks wait for pending saves and reload authoritative paths/icons without applying obsolete reads. Existing workspace restoration then chooses a remaining real personal project or returns to onboarding. The initiating browser waits for pending personal-list saves before issuing deletion and reconciles its list and workspace only after success. Running agent and terminal processes are not stopped by deletion.

## Alternatives and rationale

- Keeping only Remove from My Projects preserves files but does not provide the requested permanent operation.
- Making Delete immediately remove files would obscure the distinction between a personal shortcut and a shared project. Separate choices and confirmation make the consequence explicit.
- Deleting through a generic server-file action would not own shared catalog and account cleanup. The registry owns those references and therefore owns the operation.
- Allowing every account that can pin a project to delete it would turn discoverability into destructive authority over other users' work. Permanent deletion remains owner-only.
- Removing registration while preserving the folder would be a different operation. It would not meet the requested deletion behavior and could let managed-folder discovery register the folder again.
- Rejecting every unavailable path in compatible shortcut writes would discard established migration/recovery behavior. Exact deleted-path tombstones prevent resurrection without treating an unavailable mount as a confirmed deletion.

## Consequences

Permanent deletion affects every account using the folder and includes uncommitted files and nested projects. It applies to linked folders at their original locations as well as managed folders. Mew provides no undo for this operation; Cancel and shortcut removal preserve files.

Filesystem deletion and YAML publication are separate operations. Validation and explicit errors remain necessary; a failed request must not be presented as success. Existing account-root fallback and project refresh contracts remain authoritative rather than introducing another active-project ledger.

The [registry contract](../development/architecture.md#permanent-project-deletion) owns API shapes, validation, and cleanup. The [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md#select-and-organize-projects) and [UI navigation contract](../development/ui-project-navigation.md#header-project-switcher) own current interaction and focus behavior. The [work record](../work/shared-project-registry.md) records actual verification separately from runtime application.
