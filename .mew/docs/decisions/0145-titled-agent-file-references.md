---
title: "Titled file references for agent drafts"
description: "Accepts an explicit mew-document prefix for titled agent file tags while preserving legacy document and upload reference paths. Records serialization, escaping, alternatives, and download-only tab access for unsupported formats."
created: "2026-11-05"
updated: "2026-11-05"
status: accepted
---

## Context

The editor AI action now applies to every file view and prepares only a file tag. The tag needs the current document title as well as the exact scope and path. Existing `[[project:path]]` strings serve drafts, clipboard text, queues, schedules, and runtime prompts. They permit literal pipes in filenames; upload tokens use the same outer shape. [ADR 0039](0039-agent-inline-attachments.md) established atomic inline tags and later extended them to ordinary document references.

## Decision

Serialize new titled references as `[[mew-document:<encoded-project>:<path>|<title>]]`. Reserve `mew-document` for this format and retain the original parsing of legacy document and upload tokens. Encode the project with `encodeURIComponent`. Escape backslashes, pipes, and square brackets in path/title with a backslash, and encode CR/LF as `\r`/`\n`. The first unescaped pipe separates the path and title. Decode only this explicit format; ordinary paths remain literal.

Display the title beside the icon in the existing atomic document tag. The filename action opens the decoded project/path. Keep the serialized string in existing draft, queue, schedule, clipboard, and runtime transport paths. Titled references remain ordinary file references even when their paths are in an upload directory; they do not create attachment metadata.

Unsupported formats now open a permission-checked download-only tab so the shared AI action is reachable for every file extension. This reverses the previous feature restriction that kept new unsupported files in the explorer. Keep buffers empty and read-only, use HEAD on existing raw-file endpoints to validate access, and preserve the existing format-specific renderers.

## Alternatives and rationale

- Adding `|title` to ordinary references would reinterpret existing filenames containing pipes, including uploads. The explicit prefix avoids that collision.
- Looking up titles whenever a tag renders would require additional file reads and could lose the title captured from pending editor content.
- Storing separate title metadata or a rich document format would add persistence and migration work. Embedded JSON would add quoting and escaping without improving this fixed schema.

## Consequences

Existing saved references and upload behavior remain compatible. Titled tags retain their label across draft restoration and transcript display without extra file reads. Providers receive a human-readable scoped reference with its title; no instruction is added or submitted automatically. The title is a snapshot taken when the editor action prepares the draft, rather than a live rename subscription. Existing unlabeled tags retain their icon-only appearance.

Current behavior belongs to the [input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#titled-file-references) and [file AI action contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md#scope). The [work record](../work/task-agent-integration.md#all-files-and-titled-reference-only-drafts-2026-11-05) records local verification and limits. This extends ADR 0039; its atomic editing and upload decisions remain in force.
