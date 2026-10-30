---
title: "0090 — Literal filename search by default"
description: "Replaces implicit subsequence matching in ordinary filename queries with contiguous literal filename or relative-path matching, preserving explicit wildcard and regex modes, scopes, permissions, and limits."
created: "2026-10-30"
updated: "2026-10-30"
status: "accepted"
---

## Background

Searching for `Agents.md` returned `agent-sessions.md`, agent-related decision records, and `agents-sdk/SKILLS.md`. The default scorer accepted query characters appearing anywhere in order across the relative path. The demo independently expanded each query character with `.*`. This made a literal filename behave like an implicit pattern and let parent directories supply characters absent from the filename.

## Decision

Require contiguous literal text in ordinary filename queries in both the host and demo. Preserve useful partial filename and relative-path searches. Rank exact basenames before basename prefixes, other basename substrings, and path-only matches on the host. Apply the existing case option, permissions, scopes, and result limit.

Keep wildcard matching only for input containing `*` or `?`, with regex taking precedence when enabled. This replaces the fuzzy default in the earlier search implementation without changing the explorer design in [ADR 0085](0085-explorer-inline-search.md). The [feature contract](../features/projects-files-search/filename-content-search-and-replacement.md) owns the complete behavior.

## Alternatives and rationale

- Retaining fuzzy matching only for extensionless queries would preserve an implicit mode switch and still produce surprising results for ordinary names.
- Requiring exact whole filenames for every query would break partial-name and path searches used by the explorer and debugger source suggestions.
- Adding another search toggle would add a control for behavior that explicit wildcard and regex input already provides.

Contiguous literal matching makes ordinary input predictable while retaining partial names and explicit patterns.

## Consequences

Abbreviations that depend on skipped characters no longer match; users enter contiguous text, wildcards, or a regex. Literal queries remain substring searches, so filename prefixes and suffixes can still match. Whole-filename matching is available with regex anchors. Editor mention and link completion use separate matching helpers and are outside this change. No API fields or catalog migration are required.

Verification and application scope are recorded in the [explorer search work record](../work/explorer-inline-search.md#literal-filename-matching).
