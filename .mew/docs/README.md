---
title: "mew documentation authoring and navigation rules"
description: "Defines ownership and English-language maintenance of project knowledge, tasks, public guides, and first-party resources; description-based discovery, checks, and current versus historical sources."
created: "2026-10-06"
updated: "2026-10-29"
---

# Documentation authoring and navigation rules

For usage instructions, start with the [public documentation](../../docs/README.md). This document defines rules for people and agents who write or maintain documentation.

Keep the canonical source of Mew project knowledge in this `.mew/docs/`. Keep public guides in `docs/` at the repository root, tasks in `.mew/tasks/`, and built-in product skills and tool instructions in `resources/`. Under the [independent project decision](decisions/0001-independent-project.md), this repository owns its instructions, documentation, decisions, and verification. Navigating, updating, or registering in parent Liiiiv instructions or central documentation is not required. Documentation navigation retains the description-based approach from [previous ADR 0199](history/decisions/0199-mew-description-discovery.md).

## Documentation language

Write and maintain this repository's project-owned documentation in English, regardless of the agent's response language. This covers project knowledge, task and note prose, public guides, and first-party instructions in `resources/`.

Preserve code, commands, identifiers, machine-owned metadata, and third-party source material. Keep pinned vendor skills and license texts in their original form. Translate human-readable titles and descriptions; retain metadata keys, IDs, dates, status values, and task tag identifiers. Repair incoming links when translating headings or file and folder names.

Use [the English installation guide](../../docs/guides/getting-started-en.md) for new installation links. The other existing locale-specific guide paths retain their full content in English for link compatibility. Create another maintained language edition only when explicitly requested.

This repository policy does not change Mew's UI languages, language skills, or the default document language in other projects. See [ADR 0088](decisions/0088-english-project-documentation.md).

## Finding the documents you need

Read the project README, instructions, and [execution and verification rules](development/getting-started.md) first. Then scan only document paths and YAML frontmatter `description` to select the current document bodies you need. Descriptions are navigation hints; verify exact facts, statuses, and contracts in the selected bodies. Do not load document bodies, history, or original research in full.

From the repository root, the command below dynamically lists paths and descriptions without printing document bodies. No separate list file or index needs to be maintained.

```bash
node server/document-descriptions.ts
npm run check:docs
```

The default list excludes `history/`, `archives/`, hidden paths, and symbolic links from the configured Documents location, `.mew/docs/`. `--repository` includes public guides, tasks, free-form documents, and directly maintained product resources, and excludes pinned external skills `.vendor`. Include history descriptions with `--all` only when historical evidence is needed. archives are always read-only and excluded from the list. Documents without descriptions, empty strings, invalid YAML, and the old `desc` key are check errors.

## Document placement

| Content | Canonical location |
| --- | --- |
| User installation, operation, configuration, self-hosting, and contribution guides | Repository root `docs/` |
| Current requirements, behavior, and verification criteria by feature | `.mew/docs/features/` |
| Shared implementation, storage, communication, UI, and verification contracts | `.mew/docs/development/` |
| Procedures for project publishing, central services, and repository maintenance | `.mew/docs/operations/` |
| Technical choices and changes to existing decisions | `.mew/docs/decisions/` |
| Task titles, completion, assignees, tags, and dates | `.mew/tasks/` |
| Records of design, implementation, execution, and rollout verification | `.mew/docs/work/` |
| Original comparisons, measurements, and investigations | `.mew/docs/research/` |
| Superseded implementations and previous contracts | `.mew/docs/history/` |
| Business and promotional materials | `.mew/docs/business/` |
| Free-form work and practice documents | `.mew/notes/` |
| Built-in skills and tool usage instructions | `resources/skills/` · `resources/help/` |
| Production originals and review outputs / final app assets / public documentation images | `assets/` / `public/` / `docs/assets/` |

Distinguish successful verification in work records from actual application to production. Do not infer completion or current contracts from titles or modification dates alone. After checking the current canonical source, move records of superseded implementations to `history/`, preserving the original text and unverified conditions. Fix incoming links and, when needed, retain paths used by existing decisions or external links as short relocation notices. Preserve original research in `research/`, but categorize research on previous implementations under History / raw in the documentation home.

When organizing documents, first identify who owns the content. Even when they cover the same topic, usage, configuration, implementation contracts, and work records provide different information for readers. Consolidate overlapping authoritative content in the existing owning document and link to it from other documents. Moving files directly under `docs/` alone does not complete classification.

Keep task status, dates, tags, and assignees in the task, and separate lengthy design, implementation, and verification records into `work/`. State the observation date and current canonical source in records and research so that past conditions of not implemented, not deployed, or other limitations are not read as current status. When consolidating duplicate paragraphs, preserve unique content, figures, code, checkboxes, and unverified conditions. Do not discard records based only on age or filename.

## Parent files

Record parent document references in frontmatter `상위파일` using paths relative to the current document, rather than in the body. Use a string for one document or a string array for links to multiple documents. Put child file lists and contextually necessary reference links in the body. Existing `parent` IDs in feature documents are a separate field and must not be changed.

## Writing descriptions

Write a nonempty string `description` in the first YAML block of directly maintained Markdown for project documents, tasks, public guides, and product resources. Describe the target feature, contract, or problem and the document's scope in 1\~2 sentences. Do not merely repeat the title or copy the entire body. Explicitly identify plans that are not implemented, previous contracts, relocation notices, and research findings to distinguish them from the current implementation. Standardize the field name as `description`.

Write a description when creating a new document or detailed body. Documents created by adding only a title in the task panel start with `태스크: 제목`, and the automatic default description follows title changes. The panel does not overwrite manually refined descriptions. When the body's scope or status changes, the author also updates the description.

## Ownership and updates

Each feature file owns its feature-specific requirements and detailed specifications; keep development contracts, usage instructions, and operations shared by multiple features in the existing owning documents. Update owning documents in the same task as changes to code, features, or operations. Record technical choices, shared contracts, and changes to existing decisions in [Mew decision records](decisions/README.md). Preserve migrated central ADRs as history in `history/decisions/`; Mew documentation defines current rules. Do not put secrets or temporary debugging logs in documentation.

New or moved documents do not need to be registered in a MOC. Fix existing incoming links when moving or renaming documents. Preserve existing MOCs and representative documents for compatibility with Documents, feature screens, and old links. A MOC's link list is not a mandatory index covering every file. Preserve original history bodies and research findings, and do not modify archives.

`npm run check:docs` checks descriptions and links within the repository. Relative link paths must remain within the repository; do not make files in other local projects required references. For source and configuration files excluded from the public repository, format their paths as code and explain the separate prerequisites. Preserve old path references in historical documents as history, but point clickable evidence links to the migrated copies. Keep detailed Markdown in the role-specific owning paths above, and keep `README.md`, `AGENTS.md`, and `CLAUDE.md` at the repository root. Dedicated skill and package documentation retains its existing format.

The current link check verifies that target files exist and remain within the repository boundary; it does not check section locations after `#`. When changing headings or explicit anchors, also check the same document's table of contents and incoming links from other documents. Preserve fixed anchors shared by existing language editions, or update their references together.

## Writing readable guides

- Introductions show the purpose, representative screens, and getting-started links first. Do not repeat the full feature specifications in installation guides.
- Write getting-started guides in this order: prerequisites → installation → first login → first task. Distinguish currently available installation options from unpublished releases.
- Usage instructions explain the intended task, starting location, and result, and link to owning documents for implementation contracts and verification evidence.
- Group and link topics in subject-area homes. Put current usage and contracts first, followed by work, research, and history with their nature clearly identified.
- Keep public screenshots in `docs/assets/screenshots/` in the repository, and use relative links and specific alt text. The default capture conditions are **the default Midnight theme with Mewpet visible**. Change these conditions only when explaining another theme or a hidden state.
- Capture the actual running UI. Use example data in a new browser context, and record the capture date, screen size, whether mock responses were used, and whether a physical device was used in the document introducing the image. Do not include accounts, personal files, conversations, or secrets. Do not build the app or restart the server to capture screenshots.
- Keep the core sequence and scope aligned across language editions of the same content. When changing existing heading anchors or reference paths, also check incoming links.

The separation of introduction, installation, and detailed guides drew on the [code-server README](https://github.com/coder/code-server) and [HedgeDoc documentation home](https://docs.hedgedoc.org/); the feature-focused introduction drew on the [AFFiNE README](https://github.com/toeverything/AFFiNE). Follow mew's folder ownership and description-based navigation rules as defined.

## Project materials and runtime state

`.mew/docs`, `.mew/tasks`, and project settings are project materials tracked in Git. Exclude `.mew/notes` from the default navigation scope for current contracts. Define retention and sharing scopes separately for collaboration data such as comments; do not treat it as temporary files based only on location. Per-installation accounts, sessions, and user-edited skills are persistent data in `MEW_DATA_DIR`. When adopting a temporary upload in `.mew/temp` as a permanent documentation image, copy it to the asset path appropriate to its role and update the link. Do not delete referenced files based only on the name of a temporary path.

Follow [0087](decisions/0087-documentation-role-boundaries.md) for document classification and relocation decisions.
