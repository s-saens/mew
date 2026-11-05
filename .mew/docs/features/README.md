---
title: "Mew feature document management"
created: "2026-09-18"
updated: "2026-11-05"
description: "Ownership, hierarchy, and write-back rules for feature contracts, preserved legacy status fields, and historical records. Covers removed feature-panel workflows and the Android feature removal notice."
---

Choose relevant feature bodies by `description`, following the [documentation rules](../README.md). Documents uses `.mew/docs`; the [feature home](_features.md) remains for navigation and old links.

The dedicated feature panel, API, CLI, and execution queue were removed under [ADR 0065](../decisions/0065-remove-feature-panel.md). Feature specifications remain ordinary Markdown in Documents.

## Files and hierarchy

- Each feature is one Markdown file. Its filename without `.md` is the title; a representative file's `_` prefix is hidden. Frontmatter `title` and `parent` do not define the current title or hierarchy.
- A leaf is `Name.md`. When it gains its first child, move it to `Name/_Name.md` beside its children. When the last child leaves, restore `Name.md` and remove the empty folder. Keep folders containing attachments or hidden files.
- Documents operations update content and links. Renaming a parent renames its folder and representative file. Direct filesystem moves require manual link checks.
- Keep `MOC.md` and `_MOC.md` for compatibility. If `_Folder.md` exists, it is the representative; a separate MOC remains navigation.
- Preserve existing IDs for historical references. Accept ordinary Markdown without frontmatter or dedicated delimiters; do not impose a body heading or bullet format.

## Navigation and content ownership

| Owner | Content |
| --- | --- |
| Feature file | Requirements, scope, detailed behavior, implementation entry points, acceptance criteria |
| Shared development contract | Rules used by several features |
| Public guide, configuration, or operations document | Usage or operating instructions |
| `../work/` | Dated implementation and validation evidence |
| `../research/` | Original investigations and comparisons |

Keep detailed behavior and acceptance criteria after the feature overview. Link shared owners instead of creating a second Specs body. Read those contracts when delegating a feature.

Use Documents and actual files to inspect hierarchy, titles, related documents, commits, and verification. Update the owning feature and any changed shared contracts in the same task. New files need no MOC registration. Moves require incoming-link repairs.

Prose cleanup does not reapprove status or verification hashes. Record only executions, commits, and checks actually performed.

## Status and execution

The initial 2026-09-18 catalog had 8 areas and 44 subfeatures. Its `created` dates record registration, not implementation. The current file list governs later additions and removals.

| Legacy field | Meaning and current handling |
| --- | --- |
| `implemented` | The documented scope was confirmed in code; verification may remain incomplete |
| `verified`, `needs-fix` | User determinations; do not infer or automatically change them |
| `status_hash` | Former API hash of title, body requirements, and parent relationship; the app no longer recalculates it or makes determinations from it |
| `files` | Representative implementation entry points, not an exhaustive changed-file list |

Editing a document does not trigger agent execution or Git commits. [Feature-based development](terminals-agents-automation/feature-driven-development-and-markdown-documents.md) preserves the removed workflow's records.

## Items not included in the catalog

The initial catalog excluded the old home to-do/calendar, unimplemented AI commit generation, and unrealized plans. The Android environment and gateway feature was removed on 2026-11-05; its former scope remains in the [removal notice](browser-android-remote-desktop/android-environment-checks-and-screen-connection.md). RAG was removed on 2026-09-28; its evidence is in [history](../history/rag-feature.md). Installation, HTTPS, backups, licensing, research, and past plans retain their existing owners.

## Specs consolidation — 2026-10-06

Seven detailed Specs bodies were consolidated into their owning feature files to avoid reading two documents for one feature. `.mew/docs/specs/` retains relocation notices for old ADR and external links. Description discovery selects the current feature body.

Existing IDs, saved statuses, hashes, and validation records were preserved. Under legacy hash rules, changed content or links may be read as `changed`; consolidation does not reapprove user determinations.
