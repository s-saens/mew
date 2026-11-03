---
title: "Improve project selection and creation UX"
description: "Completed implementation task for inline project creation and managed cloning, personal shortcuts, a collapsed shared catalog, and nested project navigation. Links local verification and remaining provider/runtime limits."
done: "true"
tags:
  - 기능
assignees:
  - songsh5775@gmail.com
startDate: "2026-11-01"
date: "2026-11-01"
---

# Improve project selection and creation UX

## Goal and current scope

Make project selection and creation available directly inside the project panel. Users should see project names and actions without needing to know the managed storage path. The November 3 requirements below supersede the November 1 popup-based add-project entry flow.

Current contracts belong in [Opening, selecting, and switching projects](../../docs/features/projects-files-search/opening-projects-tabs-and-groups.md) and [UI project navigation](../../docs/development/ui-project-navigation.md). User instructions belong in [Projects](../../../docs/guides/projects.md).

## Panel and catalog

- Show **My Projects** as the main project list.
- **Add** reveals three horizontal inline choices: **Git clone**, **New project**, and **Existing project**. Keep setup in the panel; the existing server folder browser remains available for choosing an existing folder.
- Keep **All Projects** collapsed at the bottom of the panel. Expanding it shows the shared catalog and allows adding a registered project to My Projects.
- Creating, cloning, or linking a project registers it in the shared catalog and adds it to the initiating account's My Projects.
- **Remove from My Projects** in the row context menu removes only that account's shortcut. The shared catalog and files remain intact.
- A shortcut must reference a registered catalog entry: a project absent from All Projects cannot remain in My Projects. `projects.yaml` is the authoritative catalog and personal-shortcut store.
- Signed-in users, excluding guests, can access registered projects and keep personal shortcuts, subject to the existing file and feature permissions.
- Show nested Git/Mew projects beneath their parent projects in their actual hierarchy; `mew/mewlink` is an example. Retain existing switching and permission boundaries.

## Git clone

- Clone into the managed server directory, `~/.mew/projects/<name>`.
- Allow a public repository URL without connecting a provider account.
- Offer account connection before the user has opened a project, rather than requiring the Git panel first. Reuse the existing per-account authorization flow.
- For a connected account, list accessible repositories, including authorized organization and private repositories, and allow selecting one to clone.
- GitHub is the currently implemented connected provider. Public URL cloning supports GitHub and GitLab HTTPS URLs; private cloning and account repository selection use GitHub. GitLab account connection and other provider integrations remain future work; do not present them as available.
- Reject invalid names, invalid remotes, and existing destination folders without overwriting them. Preserve actionable errors and remove incomplete managed clones when cloning fails.

## New project

- Show an inline project-name field.
- Place a Git icon toggle inside its right edge. Keep Git initialization enabled by default, preserving the original requirement.
- Use a check icon to confirm creation. Create and open `~/.mew/projects/<name>` without asking for a path.
- Preserve initial `.mew/` settings and `.mew/docs/`. When Git is enabled, initialize `.git/` and write the existing `.gitignore` defaults.
- Preserve the existing optional **Create with agent** capability as a secondary action. It may reuse the normal agent conversation popup after creating/opening the project; it must not reintroduce a popup as the ordinary Add entry flow.

## Existing project

Open the existing server folder browser and link the selected folder in place. Do not copy or move it into the managed directory. Preserve its contents and canonical-path deduplication.

## Acceptance and verification

- [x] Add reveals exactly three horizontal setup choices inside desktop and mobile project panels.

- [x] New project uses name-only inline creation, a default-on Git toggle, and icon confirmation.

- [x] A public repository URL can be cloned into managed storage without provider login.

- [x] GitHub connection and repository selection work without an active project, including accessible organization/private repositories.

- [x] Create, clone, and link register one shared entry and one personal shortcut, without duplicate aliases.

- [x] My Projects removal preserves the shared entry, files, and other accounts' lists; orphan shortcuts are excluded.

- [x] All Projects starts collapsed at the bottom and supports explicit shortcut addition.

- [x] Nested Git/Mew projects appear in their actual hierarchy without changing existing switching permissions.

- [x] Automated regression tests cover changed behavior. Run relevant tests, type checks, lint, `npm run check:docs`, and the required `npm run build`, following repository execution restrictions.

- [x] Update canonical contracts, user guides, and a work record with actual outcomes and remaining limits. Do not deploy or perform server lifecycle operations.

## Implementation outcome — November 3, 2026

Implemented the panel flow and recorded local checks in the [work record](../../docs/work/shared-project-registry.md#inline-project-setup-follow-up--november-3-2026). The referenced task's original Korean filename was automatically moved by the open task editor to this English title.

Relevant automated tests, TypeScript/build, and lint passed. The full documentation check remains blocked by an unrelated image task's existing asset link. GitHub/provider and mobile checks use fixtures; live provider authorization, physical-device behavior, and server-side runtime application remain user-owned verification boundaries.

## Original direction: November 1, 2026

The initial request replaced path-first project addition with managed name-first creation at `~/.mew/projects/<name>`, while retaining external-folder links. Empty creation defaults to Git initialization. Agent-assisted creation reuses the normal agent conversation component, asks the user about the project first, and documents the result under Mew's applicable guidance.

The request also separated the shared **Projects** catalog from each account's **My Projects** shortcuts, both stored in `projects.yaml`. If account A creates projects `1`, `2`, `3` and account B creates `i`, `ii`, `iii`, the shared catalog contains all six; A initially has `1`, `2`, `3`, and can add `i` without copying it or changing B's shortcuts.

The November 3 update replaces the add-project popup with inline panel controls, adds managed cloning and collapsed All Projects, and requires a nested project hierarchy. It retains the shared catalog, personal-shortcut model, managed storage, and existing-folder linking from the original request.
