---
title: "Documentation roles and storage boundaries for project materials"
description: "Defines owning paths, discovery, checks, deployment, and compatibility with existing paths for project knowledge, tasks, public guidance, product resources, and production source assets. Extends the placement rules from the existing documentation ownership decision."
created: "2026-10-29"
updated: "2026-10-29"
---

## Status

Accepted. Replaces the arrangement that grouped all roles under repository-root `docs/` while preserving content-based ownership and the distinction between current content and records from [0040](0040-document-gardening.md). Retains the existing decision not to separate feature-specific specifications into a separate Specs area.

## Background

`docs/` mixed user guidance, implementation contracts, tasks, business materials, and skills directly served and read by the server. Documents-linked paths, fixed task storage paths, and consumers of public guidance and product packages differed. Some public images used temporary upload URLs excluded from Git, and the public Mewpet folder also contained production source assets.

## Decision

- `.mew/docs/` contains project knowledge tracked in Git. Manage current features, shared contracts, decisions, recurring maintenance procedures, work, research, and history in role-specific subfolders. Place business materials in `business/` and free-form work documents in `.mew/notes/`, which is excluded from default knowledge discovery.
- `.mew/tasks/` is the Markdown source for task titles, completion, assignees, dates, and tags. Installation-specific task order, colors, and identifier metadata remain in the existing data path. Preserve compatibility with existing `docs/tasks/`, `docs/tasks/Done/`, and `tasks/` through reading and nondestructive migration on write.
- Repository-root `docs/` provides guidance for users, self-hosted server operators, and external contributors. Manage npm publishing, central service, and repository history maintenance procedures in project documentation. Link dated application and validation records to `work/` and original comparison and research materials to `research/`.
- `resources/skills/` and `resources/help/` are product resources read and distributed by the app. Preserve pinned external skill source text, licenses, and hashes together. Mewpet tool help does not read development specifications or public guides as runtime payloads.
- `assets/` contains production source assets and review materials, `public/` contains final app assets, and `docs/assets/` contains public documentation images. Update existing generated artifacts using their generation inputs and methods, and do not manually replace paths in demo copies pinned to historical commits.
- Root `AGENTS.md` and `.mew/agent-context.json` link to project documentation entry points. Explicitly set Documents for this repository to `.mew/docs`. Do not change the default Documents policy for other projects in bulk.
- Default description discovery reads only linked Documents. The `--repository` check covers all specified documentation roles and excludes `.vendor`, arbitrary hidden state, and archives. Include history through `--all`; MOC registration is not required.

## Alternatives and Rationale

Splitting by `docs/internal/` would keep public guidance and project operations materials mixed under the same Documents root. Moving all Markdown to `.mew/docs/` would blur distribution boundaries for public installation and contribution guidance and product resources. Instead of continuing to add top-level folders for each role, organize project knowledge by topic within `.mew/docs`.

## Impact and validation

Update relative links, parent-file references in frontmatter, documentation checks, runtime paths, and release inclusion lists in the same change. Preserve existing edits, untracked documents, and collaboration data in their new locations, and do not include content from other work in this commit. Git-tracked `.mew` documents are also public repository materials; moving directories is not access control.

Specific authoring and placement contracts follow [Documentation rules](../README.md), the task storage contract follows [Task list](../development/task-list.md), and distribution boundaries follow the [CLI contract](../development/cli-distribution.md). Record actual execution, checks, and the scope not applied to production in the [Migration work record](../work/documentation-role-migration.md).
