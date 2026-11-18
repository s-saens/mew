---
title: "Require document descriptions in the project wiki"
description: "Limits Mew discovery descriptions to wiki roots while retaining path and text search, existing metadata, and independent link checks. Records the benchmark rationale and the scope of the previous policy it supersedes."
created: "2026-11-18"
---

# Require document descriptions in the project wiki

## Status

Accepted. Narrows the scope of [description-based discovery](../history/decisions/0199-mew-description-discovery.md) and the description validation scope in [Documentation roles](0087-documentation-role-boundaries.md).

## Context

The [three-way benchmark](../research/document-discovery-three-way-2026-11-18.md) compared 20 prompts on 590 Mew documents. The description catalog used the fewest mean input tokens and provided complete evidence for 19 prompts. Folder and body search provided complete evidence for 18. The benchmark did not measure the cost of keeping descriptions current.

## Decision

Keep description-based discovery for the project wiki. Mew recognizes project-relative `.mew/wiki/`, `.mew/docs/`, and `wiki/`. This repository uses `.mew/docs/`. Require a nonempty `description` on managed wiki Markdown, and generate a starting description for new wiki pages. Use paths, headings, and text to locate other docs. Existing descriptions can remain in public documentation, tasks, and other files. Preserve metadata required by independent formats such as skill manifests and database fields.

## Alternatives and consequences

Requiring descriptions on every managed document would extend the writing and validation burden beyond the wiki. Using only folder search would eliminate that burden while losing the measured discovery advantage on this corpus. The wiki boundary keeps descriptions close to internal project knowledge. It also allows public guides and other text to follow their own conventions. Link validation retains its independent scope, and MOC registration stays optional.

See the [documentation rules](../README.md#writing-descriptions) and [agent guidance contract](../development/agent-guidance.md).
