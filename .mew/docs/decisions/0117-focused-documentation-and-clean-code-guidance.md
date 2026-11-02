---
title: "Default guidance for focused documents and cohesive code"
description: "Adds independent, configurable Mew defaults for focused document structure and clean, modular code while preserving project conventions, selective document reading, existing account sources, and test-writing settings."
created: "2026-11-02"
updated: "2026-11-02"
---

## Status

Accepted at the user's request. Extends the independent documentation settings in [ADR 0073](0073-documentation-guidance-options.md) with document structure and adds a separate code-quality preset. Existing testing and build-verification decisions remain unchanged.

## Context

Accurate document descriptions help agents choose relevant material, but documents that combine unrelated subjects can still require broad reading and costly maintenance. The user requested default guidance for focused documentation and clean code organized into suitable units. These goals need explicit instructions without imposing a fixed folder tree, arbitrary size limits, or unnecessary fragmentation on every project opened in Mew.

## Decision

Add two independent per-account presets, each with **Apply default guidance** (`required`, default) and **Follow project instructions** (`project`). Place **Document structure** (`documentStructure`) next to writing style under Documentation and **Code quality** (`codeQuality`) in General. Selections save immediately through the existing guidance revision API and apply starting with the next actual request.

Document structure asks agents to keep each file focused on a topic and reader task, separate independently maintained subjects when useful, and maintain a canonical source with links instead of copied facts. Accurate descriptions must support selecting only the relevant document bodies. Preserve description-first discovery without requiring MOC navigation or registration. Split documents when that helps reading and maintenance, without arbitrary line limits or fragmentation that makes the material harder to use.

Code quality asks agents to keep responsibilities cohesive in small modules, components, and functions, with explicit interfaces and dependency boundaries. Separate domain logic from UI and I/O where useful, use clear names and control flow, handle errors clearly, and reuse existing code. Split code for understanding, testing, and maintenance; avoid duplication, dead code, speculative abstractions, trivial wrappers, and unrelated rewrites. Follow the project's existing conventions and explicit user requests.

Each preset owns only its matching `mew:agent-setting:<key>` section. Existing MD, TXT, and empty account sources receive missing defaults in memory when context is read, without rewriting files or changing revisions. Preserve explicit project selections, custom wording, damaged markers, and unrelated settings. Deferring either preset to project instructions adds no separate Mew requirement for that item. Changing either choice does not change test-writing guidance, documentation metadata or validation settings, or build verification.

These defaults provide guidance rather than an execution or quality gate. They do not distribute Mew's own documentation layout, build command, or server restrictions to other projects and do not authorize a broad restructuring outside the requested work.

## Alternatives and rationale

Adding structure advice to the existing writing-style preset would couple organization and prose preferences. Adding clean-code advice to testing would conflate code design with verification. Independent presets let users defer one concern to project rules while retaining the other defaults.

Fixed line counts or mandatory file splits would be easy to apply mechanically but would not reflect cohesion, reader needs, or maintenance boundaries. A judgment-based rule makes splitting serve a concrete purpose and discourages overfragmentation and trivial abstractions. Rewriting existing account files would risk custom guidance and revisions, so the new presets use the established read-time default behavior.

## Consequences

New and existing accounts receive both defaults when automatic guidance is enabled, with an explicit option to follow project rules for either concern. Saving a choice changes guidance for subsequent requests; it does not reorganize files, refactor code, or prove quality. Existing project ownership, documentation policies, test obligations, and execution restrictions continue to apply.

The [session contract](../development/agent-sessions.md#passing-project-context) owns API, default, and preservation rules. [Project setup](../../../docs/guides/project-setup.md#edit-the-shared-guidance-file) owns the controls and [documentation guidance](../../../docs/guides/project-setup.md#documentation-guidance) explains the per-item document options. Implementation checks and operational application belong in work records, not this decision.
