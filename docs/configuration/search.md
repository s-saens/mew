---
title: "Project search"
description: "Explains the explorer's search controls, contiguous literal filename and path matching, explicit wildcards, RE2 regular expressions, scopes, hierarchical results, context tooltips, replacement, and limits. Covers description-based document discovery and the boundaries of removed RAG and Graphify integrations."
updated: "2026-10-30"
상위파일:
  - "../../.mew/docs/MOC.md"
  - "MOC.md"
---
[Installation and execution](../guides/getting-started-ko.md)

## Filename and Content Search and Replacement

1. Type in the search field at the top of the file explorer. Turn the content search icon off to search file names or on to search body text. `Ctrl+P` focuses the same field in file name mode, and `Ctrl+Shift+F` focuses it in content mode. There is no separate search tab.
2. Enter a search term. `Aa` controls case sensitivity. Without wildcards, file name search finds the literal text as a contiguous substring in the file name or relative path. With case sensitivity off, `Agents.md` finds `AGENTS.md` and `nested/Agents.md`, but excludes `agent-sessions.md` and `agents-sdk/SKILLS.md`. Entering `*` or `?`, as in `*.exe`, explicitly applies wildcards (`*`: 0 or more characters; `?`: one character). The entire file name or relative path is then matched, and other characters are treated literally. Content search also interprets `*` and `?` as wildcards without an option and finds substrings on the same line. In both searches, enabling `.*` interprets the input as a regular expression; use `^Agents\.md$` for an exact file name match. Content search without wildcards is a plain string search.
3. Choose the scope using the existing two-button **Documents / Files** toggle below the search field. Documents searches only Documents; Files searches the current root's filesystem and subprojects. In Files view, use `@` in the input line to narrow the search to one or more immediate subprojects. Changing the scope or content mode preserves the search term.
4. Results show only matches and their parent paths in the current explorer tree, expanding their ancestors. Documents retain their document hierarchy and representative pages, while files retain actual folders and file names, with matches highlighted. Clearing the search restores the previous expansion and scroll state.
5. Hover over or keyboard-focus a content search result to see a tooltip containing the matching line and up to 3 lines above and below, with about 10 words of context on either side. Long lines are truncated to prioritize the highlighted portion. Clicking a file jumps to the first match; you can also select another match in the tooltip to open it. Expanding the replacement input enables per-file replacement or Replace all in the tooltip. Bulk replacement changes file contents and Git commits, so check the scope and search term.

File name results are limited to the top 50, and content search may also display only some results when there are many. Searches of the original text supplement the index while it is being prepared or experiencing failures. For detailed scope and display behavior, follow the [file search specification](../../.mew/docs/features/projects-files-search/filename-content-search-and-replacement.md).

Server-side file name and body regular expressions and replacements use RE2-compatible syntax. Lookahead and lookbehind (`(?=...)`, `(?<=...)`, etc.) and backreferences within patterns (`\1`, etc.) are rejected as errors. Capture references `$1` and `$<name>` are supported in replacement strings. Regular expressions match Unicode characters, and search and replacement patterns cannot exceed 2,000 characters or 10,000 compiled instructions. These limits apply to server-side search and replacement. For the engine selection rationale, see the [linear-time search decision](../../.mew/docs/decisions/0036-linear-search-regex.md).

## Document discovery

After checking README files and instructions, the agent uses each document's YAML `description` and path to determine the required scope and reads only relevant body text. `node server/document-descriptions.ts` creates a listing without printing body text, and MOC registration is not required. Follow the [documentation rules](../../.mew/docs/README.md). The RAG panel, API, local CLI, models, index, and automatic guidance were removed under [ADR 0176](../../.mew/docs/history/decisions/0176-mew-remove-local-rag.md). RAG entries remaining in older browsers' dock ordering are ignored, preserving the order of other items.

Existing installations' `MEW_DATA_DIR/rag/` and `rag-settings.json` are no longer read or updated. Data in running installations is not automatically deleted; after applying the removal version, you can clean up only those residual files if needed. Do not reintroduce RAG or retry indexing or model downloads without a user request. [Past operations records](../../.mew/docs/history/rag-operations.md) and [measurement results](../../.mew/docs/research/document-discovery-benchmark.md) are preserved as history.

## Local code relationship discovery

Graphify's Mew source search integration, automatic agent guidance, local installation, and active
index were removed on 2026-10-27. No installation or execution commands
are currently provided; use regular code navigation and description document navigation. Preserve the [comparison results](../../.mew/docs/research/graphify-search-benchmark.md),
which did not confirm a search speed improvement, the [withdrawal decision](../../.mew/docs/decisions/0080-retire-graphify-search.md), and the [historical source](../../.mew/docs/history/graphify/README.md). Other uses, such as identifying potential change impacts,
are unverified ideas and are not current features.

## Removal validation

2026-09-28: Passed 31 regression checks covering the dock, panels, context, regular search, and collaboration. Type checking, linting (with existing warnings), and document placement and link checks also passed. This does not include building or restarting the running service or applying changes to production.
