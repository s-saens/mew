---
title: "English project documentation"
description: "Adopts English for Mew's first-party project documentation and document names, preserves metadata and executable content, and retains legacy installation paths without changing product language behavior."
created: "2026-10-29"
updated: "2026-10-29"
status: accepted
---

## Context

Mew separates public guides, project knowledge, tasks, notes, and bundled instructions by ownership under [ADR 0087](0087-documentation-role-boundaries.md). These sources still mix Korean, English, Japanese, and Chinese. The project owner requested that all documentation be converted to English. Translating headings and task titles also affects incoming fragments and the task title-to-filename contract.

## Decision

Maintain this repository's first-party documentation in English, including human-readable titles and descriptions. Give its document files and folders English names. Preserve feature IDs, metadata keys and types, dates, status values, task tag identifiers, commands, code, and pinned third-party material. Translate historical prose from its recorded source without updating historical facts or verification claims.

Repair existing incoming links, heading fragments, and `상위파일` references when names change. Task filenames follow their translated titles using the existing [task document contract](../development/task-list.md); task identity and completion metadata remain intact. Preserve fixed demo snapshots and their internal paths.

Use the [English installation guide](../../../docs/guides/getting-started-en.md) for new installation links. Retain the complete content of the other locale-specific installation files in English at their existing paths, with a compatibility notice. This replaces the repository guide routing described in [historical ADR 0178](../history/decisions/0178-mew-multilingual-readme-router.md). Other product language behavior is outside this decision's scope.

The [documentation rules](../README.md#documentation-language) own the current language policy. This repository's English source language is independent of the agent's response language and does not change language defaults for other projects opened in Mew.

## Alternatives

- Keep Korean project knowledge and translate only public guides. This would leave the requested repository-wide conversion incomplete and retain mixed-language maintenance.
- Maintain parallel editions of every document. This would multiply the work needed to keep current contracts synchronized.
- Translate prose while retaining Korean document names. This would keep Korean labels in the file explorer and conflict with automatic task title-to-filename synchronization.
- Replace the older installation files with redirects. Retaining their full translated content preserves distinct source information and existing links during this change.

## Rationale and consequences

One source language gives maintainers a consistent documentation corpus without creating parallel current contracts. English names require a coordinated link migration; metadata, protected code, pinned vendor hashes, and fixed snapshots require separate checks. Historical source versions remain available in Git. Compatibility paths remain for earlier installation links.

Mew continues to support its existing UI languages and documentation skills. Runtime messages, user data, account state, and installed user-edited skills retain their existing language and ownership.
