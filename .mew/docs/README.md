---
title: "Mew documentation rules"
description: "Ownership, English-language policy, description-based discovery, and concise authoring rules for Mew documentation. Defines current versus historical records, same-task write-back, metadata, links, and validation."
created: "2026-10-06"
updated: "2026-11-03"
---

# Documentation authoring and navigation rules

Mew owns this repository's instructions and documentation under [ADR 0001](decisions/0001-independent-project.md). Parent Liiiiv policies and documentation do not govern it. For product usage, start at the [public documentation](../../docs/README.md).

## Documentation language

Write project-owned documentation in **English**, regardless of the response language. This includes knowledge, tasks, notes, public guides, and first-party instructions in `resources/`.

Preserve code, commands, identifiers, machine-owned metadata, and third-party source and license texts. Keep metadata keys, IDs, dates, and status tags intact. Translate human-readable titles and descriptions, repairing incoming links. Keep existing locale-specific guide paths for compatibility; maintain another language edition only when requested. New installation links use the [English guide](../../docs/guides/getting-started-en.md).

This policy does not change UI languages, language skills, or another project's default language. See [ADR 0088](decisions/0088-english-project-documentation.md).

## Finding the documents you need

1. Read the project README, agent instructions, and [execution rules](development/getting-started.md).
2. Select a topic from document paths and frontmatter `description` values.
3. Read only the selected current bodies and relevant decisions. Load history or research only when provenance is needed.

```bash
node server/document-descriptions.ts                         # Project knowledge
node server/document-descriptions.ts .mew/docs/development  # One scope
node server/document-descriptions.ts --repository           # All maintained roles
npm run check:docs
```

The catalog reads YAML headers, not bodies. It defaults to `.mew/docs` and excludes hidden entries, symlinks, `history/`, and `archives/`. `--all` includes history; archives remain excluded and read-only. `--repository` also covers public guides, tasks, notes, and first-party skills/help, excluding pinned `.vendor` sources. No catalog file or MOC registration is required. This preserves the [description-discovery decision](history/decisions/0199-mew-description-discovery.md).

Descriptions guide selection; the body establishes facts and status. Do not recursively load the document tree or infer implementation from a title or modification date.

## Document placement

| Content | Canonical home |
| --- | --- |
| Installation, usage, configuration, self-hosting, contribution | Repository `docs/` |
| Feature requirements, behavior, implementation entry points, acceptance criteria | `.mew/docs/features/` |
| Shared implementation, storage, communication, and UI contracts | `.mew/docs/development/` |
| Repeatable publishing, service, and maintenance procedures | `.mew/docs/operations/` |
| Technical choices and reversals | `.mew/docs/decisions/` |
| Design, implementation, execution, and rollout records | `.mew/docs/work/` |
| Original investigations and comparisons | `.mew/docs/research/` |
| Superseded implementations and evidence | `.mew/docs/history/` |
| Business materials | `.mew/docs/business/` |
| Task status, dates, assignees, and tags | `.mew/tasks/` |
| Free-form work and practice | `.mew/notes/` |
| Built-in skills and tool instructions | `resources/skills/`, `resources/help/` |
| Production originals, app assets, public documentation images | `assets/`, `public/`, `docs/assets/` respectively |

Identify the owner before moving content. A feature contract, operating guide, decision, and work record may concern one topic while serving different readers. Keep each fact in one current owner and link to it. Moving files into a common folder alone does not establish ownership.

Keep task metadata in tasks and substantial design or verification evidence in linked work records. Distinguish local checks from production application and implemented behavior from plans. Preserve original research and historical rationale. After checking the current owner, move superseded records to history with their original text and uncertainties intact. Record the observation date and current canonical source in work and research records. Consolidation must retain unique facts, figures, code, checkboxes, and uncertainties. Age alone does not justify deletion. Follow [ADR 0087](decisions/0087-documentation-role-boundaries.md).

## Parent files

Use relative paths in frontmatter `상위파일`, as one string or a string array. Put child lists and contextual links in the body. Preserve existing feature `parent` IDs; they serve a different purpose.

## Writing descriptions

Every directly maintained Markdown document needs a nonempty `description` in its first YAML block. Use **one or two sentences** that identify the owning topic, coverage, and relevant status. Include distinguishing terms an agent would search for; leave exhaustive behavior lists in the body.

Missing descriptions, empty values, invalid YAML, and the legacy `desc` key fail validation. Update the description when the body's scope or status changes. Task-panel placeholders use `태스크: 제목` until edited; automatic title updates preserve manually refined descriptions.

## Ownership and updates

Keep current requirements and detailed acceptance criteria in the owning feature document. Shared contracts, usage, configuration, and operations stay in their respective owners. Link to them instead of maintaining another copy. Follow the [feature rules](features/README.md).

| Change | Write-back |
| --- | --- |
| Code, feature, configuration, or operating behavior | Update the owning current documents and descriptions in the same task |
| Architecture, technology choice, shared contract, or established decision reversal | Record the decision in `decisions/`; link superseded decisions and retain history |
| Implementation or verification work | Record purpose, resulting behavior, actual checks, outcomes, and remaining limits in the existing work/change record |
| Routine prose edit | Update the current owner; no duplicate permanent log is needed |
| File or heading move | Repair incoming links and relevant anchors in the same task |

Preserve original decisions and migrated sources in history. Keep secrets and temporary debugging logs out of documentation. Retain root `README.md`, `AGENTS.md`, and `CLAUDE.md`; preserve dedicated skill/package formats.

New or moved files need no MOC update. Preserve existing MOCs and representative pages for link and Documents compatibility; they are optional navigation, not complete registries.

Run `npm run check:docs` from this repository. Links must resolve inside it. For private or excluded source paths, use inline code and explain prerequisites; do not make another local checkout a documentation dependency. Historical references remain evidence, while current links point to canonical owners.

The link checker verifies target files and repository boundaries, **not heading anchors**. Inspect changed anchors and incoming links directly. Preserve shared anchors or update their callers together. Documentation changes also follow the [execution and build rules](development/getting-started.md).

## Writing readable guides

- Give each file one reader and task. Split independently maintained subjects when this improves retrieval; avoid arbitrary size limits or tiny fragments.
- Lead with the purpose or contract. Use short, concrete sentences and one topic per paragraph. Use tables for comparisons and bullets for independent rules. Keep conditions, exceptions, actor responsibilities, uncertainty, code, and links intact.
- Introduce features and representative screens without repeating their full specifications. Order getting-started guides as prerequisites → installation → login → first task. State unpublished release limits.
- Usage guides name the task, starting point, and result, then link implementation and verification details to their owners. Put current instructions before historical evidence.
- For language editions, preserve sequence, scope, and shared anchors; repair incoming links when paths or headings change.

Public screenshots belong in `docs/assets/screenshots/` with relative links and specific alt text. Capture the actual UI using example data in a new browser context. Default to **Midnight with Mewpet visible** unless illustrating another setting. Record capture date, viewport, mocked responses, and physical-device use in the introducing document. Exclude private accounts, files, conversations, and secrets. Screenshot work does not authorize server lifecycle operations.

Guide organization drew on [code-server](https://github.com/coder/code-server), [HedgeDoc](https://docs.hedgedoc.org/), and [AFFiNE](https://docs.affine.pro/); Mew's ownership and discovery rules remain authoritative.

## Project materials and runtime state

`.mew/docs`, `.mew/tasks`, and project settings are Git-tracked project materials. Exclude `.mew/notes` from default current-contract navigation. Define retention and sharing for collaboration data such as comments; location alone does not make it temporary.

Installation accounts, sessions, and edited skills persist in `MEW_DATA_DIR`. To adopt an upload from `.mew/temp` into documentation, copy it to the proper permanent asset location and update its links. Never delete a referenced file merely because its path looks temporary.
