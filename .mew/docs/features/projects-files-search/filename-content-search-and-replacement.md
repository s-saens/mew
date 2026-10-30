---
id: "mew-projects-search"
parent: "mew-projects"
title: "Filename and Content Search and Replacement"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-30"
status_hash: "79a1e8766564a2bf356422b60d751638dcc7b3a1ae78f96ce4deb3c240d57085"
files: ["src/components/FileTree.tsx", "src/components/explorer-search-preview.tsx", "src/utils/explorer-search.ts", "src/components/SearchPanel.tsx", "server/fileNameSearch.ts", "server/search.ts", "server/search-pattern.ts", "server/searchCatalog.ts"]
commits: []
description: "Feature contract covering the explorer's single search field, literal filename and path matching, explicit wildcards and RE2 regular expressions, Documents/Files scope, hierarchical results, context tooltips, replacement, and limits. Explains FTS v2 project-scoped queries, candidate extraction, Unicode supplementation, source verification, instrumentation, and removed RAG functionality."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

## Requirements

- Find project files by name or content and replace content as needed.

### Scope

- Provides a single search field above the file/document tree and a content-search toggle. Supports hierarchical results in the current view, @ subproject scopes in Files view, case sensitivity, default wildcards, and optional regular expressions.
- Navigates to the corresponding line in content results and provides per-file and replace-all operations.

### Boundaries and limitations

- Filename search has a cap on the number of candidates.
- Server search and replacement patterns are limited to 2,000 characters and run through an RE2-compatible engine. Lookahead, lookbehind, and pattern backreferences are not supported.
- The content index narrows candidates using required strings from plain-text and wildcard patterns; source-text verification and the scanner fallback on failure remain.
- RAG semantic search was removed. Document navigation uses README, MOC, and regular file search.

### Related documents

- [Search settings and contract](../../../../docs/configuration/search.md)

## Detailed behavior

The file explorer has no Browse, Filename, or Content Search tabs. In the top search field, turning off the content-search icon beside `Aa` and `.*` searches filenames; turning it on searches content. Ctrl+P and Ctrl+Shift+F select the respective modes and focus the same input. Input is retained when changing modes or Documents/Files scope. Automatic input focus follows the shared desktop conditions. A shared X button outside the right side of the search field closes the file explorer regardless of whether a query is present. The Documents/Files scope row does not duplicate the close button.

The existing two-button Documents/Files toggle below the search field remains. Select directly by click or touch, or switch with Left/Right arrow keys and Home/End. Removing separate search tabs does not change this scope toggle's appearance or direct switching. Documents view searches only Documents; Files view searches the entire `.workspace` filesystem. The actual Documents path in Files view is also searched as a regular file path and is not mixed with separate Documents-scope results. Selecting one or more direct subprojects with `@` in Files view narrows the scope using OR. The HTTP API's existing unscoped unified search and docs/subproject OR remain for compatibility; the new `root` scope selects all of `.workspace` before applying the result limit.

Search results reuse existing `FileTree` rows, icons, indentation, and representative document pages. Only matching files and their ancestor paths appear, with ancestors expanded automatically. Both filename and content searches highlight matching item names with a background color and bold text. For example, searching for `c*.md` among `a1/b1/c1.md`, `a1/b2/c3.md`, and `a1/b3.md` expands `b1` and `b2` under `a1` to show the two matching files and hides `b3.md`. If a representative document file matches, its page row is highlighted without duplicating the representative file among its children. Expansion and scrolling during search do not overwrite the normal saved state; clearing or canceling the query restores the previous state. Creation and explicit file-reveal actions also clear the search.

Filename search queries the server's incremental file
catalog after a 250 ms debounce and receives only the top 50 results. It does not send the entire candidate tree
to the browser, and normal folder-level lazy loading in the file explorer is retained ([ADR 0105](../../history/decisions/0105-mew-incremental-file-catalog-and-exact-search-index.md)). Both searches provide a case sensitivity option. Filename search automatically applies wildcards when `*`
or `?` is present. `*` means 0 or more characters, including path separators, and `?` means one Unicode character.
It matches the filename or full relative path through to the end; `*.exe` finds only files ending in `.exe`, including those in subfolders. `file?.txt`
matches `file1.txt` and excludes `file12.txt`. Without wildcards, filename search requires a contiguous literal substring in the filename or relative path; it does not skip characters or combine separated path segments. For example, `Agents.md` matches `AGENTS.md` and `nested/Agents.md` with case sensitivity off, but excludes `agent-sessions.md`, `0031-agent-display-events.md`, and `agents-sdk/SKILLS.md`. Exact basename matches rank first, followed by basename prefixes, other basename substrings, and relative-path matches. Partial names and paths remain searchable; use regex anchors for a full match. This replaces the earlier fuzzy default; see [ADR 0090](../../decisions/0090-literal-filename-search.md). The filename regex option was restored
at the user's request. In both searches, enabling the `.*` option applies regex instead of wildcard or literal interpretation. Filename regex matches substrings of filenames or relative paths; `^` and `$` can specify a full match. Invalid regex is displayed as an error. Content search interprets `*` and `?` as wildcards without requiring an option. `*` means 0
or more characters on the same line, matching the longest possible span, and `?` means one Unicode character; all other symbols are literal. Without wildcards, it is a plain string search. Search, SSE, and replacement use the same pattern and exclude empty matches. The default replacement string is inserted literally, while regex replacement supports capture groups such as `$1`. Semantic search and extended History / raw search are not included on this screen.

Content results are displayed as file or document rows, with match context shown in a tooltip on hover or keyboard focus. Clicking a file navigates to the first match; for multiple matches, users can select one with the tooltip's previous and next buttons before opening it. Context includes the search line and up to 3 lines above and below it, with the search line centered. Each line is narrowed to roughly 10 words on either side of the match's original column, and even long lines without spaces are limited to 400 UTF-16 code units plus 2 characters for omission indicators. Unicode surrogate pairs are not split. At the start or end of a file, only available lines are shown. The tooltip uses a body portal and shared fixed coordinate calculations to respect panel and viewport boundaries, and hides on scrolling, clicking, Esc, or leaving. Touch hover does not show it. Users with write access who have expanded the replacement input
can replace all matches in that file from the tooltip. For source lines longer than 400 characters, a preview of up to 400 characters is sent, starting up to 24 characters before each match, with `…` added at omitted beginnings and endings. `matchStart` and `matchEnd` are UTF-16 offsets within this preview, while `column` retains the UTF-16 offset starting at 0 in the original line. An additional `context` array contains `line` and `text` for each context line, with `matchStart` and `matchEnd` relative to that line's `text` only on matching rows. JSON and SSE generate the same preview and context from source text already read, and clicking navigates to the original source position. Older responses without context use the existing single-line preview.

Server filename regular expressions and content search, SSE, and replacement use the RE2-compatible engine in `re2js`. Lookahead and lookbehind (`(?=...)`, `(?!...)`, `(?<=...)`, `(?<!...)`) and pattern backreferences (such as `\1`) are rejected, with no retry using JavaScript's native regular-expression engine. Default content wildcards use the same engine. All patterns match Unicode characters, while source locations retain existing UTF-16 offsets. Input is limited to 2,000 characters and compiled instructions to 10,000. Replacement support for `$1`, `$<name>`, and `$$` remains, and empty matches are skipped. Find and replace within an open document is a separate editor feature.

Show `검색 중…` while a search request is in progress. File content search selects a contiguous string that must occur in the
plain string or wildcard pattern, narrows candidates using a local SQLite trigram index, and then verifies the source text with the original
search pattern. For example, `unique*workspace phrase` uses `workspace phrase` for the candidate query. Candidate strings must contain at least 3 Unicode characters, so `a😀` and
`😀😀` are treated as short searches. For case-insensitive searches, non-ASCII characters with case are treated as boundaries
that split strings to avoid differences between SQLite and RE2 case conversion. Use the existing source scanner if no safe string
remains, for regex searches, or while the index is being built or has failed. Wildcards containing only `*` or `?`, or with short
fixed strings, also use the scanner. Add dirty files not yet reflected in the index to FTS candidates and verify them against the source
text. SSE sends matching files as `result` events, and `done` also sends truncation status, index status, and the number of dirty files added.

FTS v2 indexes the content `body` and the `scope` column containing the SHA-256 of the project name. It intersects content and project conditions
within MATCH, then retrieves file metadata by rowid. It avoids execution plans that repeat MATCH for each file
in a project or retrieve all matches from other projects through metadata lookup. Content conditions are restricted
to the `body` column so project hashes do not produce search results. The existing v1 derived index is automatically rebuilt
from source text, with the scanner used during rebuilding. Apply the existing limit of 4,001
candidates after applying permissions and search scope. Reorder selected candidates into catalog
order, retaining the scanner's file and match limits and source verification. Follow [decision 0058](../../decisions/0058-search-query-and-catalog-batches.md) for the rationale.

### Performance instrumentation

When `MEW_PERF_LOG=1`, `search.scope` records catalog lookup and scope and permission filtering time for the current account, `search-index.query`
records FTS candidate query time, and `search.scan` records source reading and matching time. In `search.scan`, `files` means the number
of selected paths, `allowedFiles` means the total number of paths that passed scope and permission checks, and `indexed` indicates whether
FTS candidates were used. `files` may contain the path count before applying the scanner's 4,000 file limit. Do not include
search terms, file paths, accounts, or content in log fields. Browser transfer and rendering time are not included.

When the search box is empty, retain the existing explorer and per-folder lazy loading. During search, create and display only the necessary ancestors of returned paths, without additional queries for the full tree or the body text of matching files. Do not provide a separate sorting toolbar.

When expanding Documents or regular folders, restore remembered expansion states for internal folders if available; otherwise, start with all internal folders collapsed. Expand subprojects the same way to browse their files; only the separate arrow switches the active project. On initial
display, do not automatically expand the active document's path and overwrite this state. Retain subsequent path expansion when document tabs are selected.

New files in the explorer retain the entered extension, and `.md` is not automatically appended when no extension is supplied. The previous
automatic correction was removed because it prevented creating code files and extensionless files with the desired names, and must not
be reintroduced. Apply the existing initial document content and Documents MOC registration only to Markdown files; create all other files empty.

Display results in the file view under their actual parent folders, and results in the Documents view in the document page hierarchy. Reuse metadata already read for direct and nested subprojects for icons and navigation buttons ([Using Projects](../../../../docs/guides/projects.md)). Follow [ADR 0085](../../decisions/0085-explorer-inline-search.md) and the [implementation record](../../work/explorer-inline-search.md) for decisions and verification records.

<!-- mew:implementation:start -->
## Implementation details

- Provides a single search field above the file/document tree and a content-search toggle. Supports hierarchical results in the current view, @ subproject scopes in Files view, case sensitivity, default wildcards, and optional regular expressions.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- 2026-10-24: Passed 58 integrated regression tests covering search, catalog, file reading, access control, and platform behavior; skipped 2 Windows-only tests on Linux. Verified wildcard JSON/SSE result parity, dirty-file supplementation, index disabling, short Unicode searches, case-conversion differences, actual v1→v2 rebuilding, project intersection, and exclusion of scope metadata from body searches. Passed TypeScript and full lint checks (existing warnings). Recorded reproduction commands, measurement intervals, and production areas not measured in [isolated performance measurements](../../research/search-catalog-performance.md). No app build or server restart was performed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check exact search results, scope tags, wildcards, and regular expressions for the same query, along with the source text before and after replacement.

- 2026-09-28: Passed checks for the standard search API, FTS candidates, and scanner fallback after removing RAG dependencies. Keep test data separate from production data.

- 2026-10-07: Passed 17 regression tests for filename wildcards, scope APIs, body search/replacement, and indexing, plus 1 performance check with 10,000 files. Passed type, lint (existing warnings), description, and document placement checks. No build, restart, or application to the running service was performed.

- 2026-10-07: Passed 20 search regression tests covering default body wildcards, regex-first mode, Unicode, empty matches, line boundaries, replacement, SSE parity, filename regex, and error APIs. Passed type, lint (existing warnings), description, and document placement checks. No build, restart, or application to the running service was performed.

- 2026-10-21: Passed 24 search, replacement, filename, index, and API regression tests with isolated data. Tested ambiguous nested-repetition regex in a separate process with a termination limit, and verified HTTP errors, SSE errors, and unchanged files for unsupported syntax, along with Unicode, empty matches, and capture replacement. API tests used a fixture that prohibited PTY execution; actual terminal execution was not tested. No build or restart was performed.

<!-- mew:validation:end -->
