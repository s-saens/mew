---
title: "Search index query order and batch evaluation of file listings"
description: "Decision to intersect project and body candidates within SQLite FTS, narrow candidates using required wildcard strings, and share preparation of file-list paths and hidden settings within each synchronous processing batch. Records index v2 rebuilding, source verification, per-file boundary checks, and the reasons for deferring a database replacement and Redis adoption."
created: "2026-10-24"
updated: "2026-10-24"
---

## Status

Accepted. Improves query execution order and candidate selection while retaining the existing incremental catalog and FTS search structure.

## Background

A database replacement and Redis caching were considered to improve loading and search performance. An isolated file fixture confirmed that the existing SQLite JOIN plan first traversed the project's files and reran FTS MATCH for each file. Conversely, running the FTS query first made searches for common words in small projects depend on the number of matches in other projects. Wildcard searches did not use the index even when they contained a fixed string. The in-memory file catalog also repeatedly prepared the project root, server data base path, and hidden list for each entry.

## Decision

- Add body `body` and project hash `scope` columns to FTS and intersect the two conditions within MATCH. `scope` is a fixed-length SHA-256 of the project name, and body searches apply only to the `body` column. Place the FTS table on the left side of `CROSS JOIN` to obtain these candidates first, then look up file metadata by rowid. Retain the metadata project-match condition, permission-scope filters, and candidate cap.
- Upgrade the derived search index schema to v2. Automatically rebuild existing v1 indexes from the source, and use the scanner for searches during construction. Source documents, conversation databases, and PostgreSQL data are outside the scope of this rebuild.
- Select strings that must be present in ordinary and wildcard searches and use them for candidate queries. The threshold is at least 3 Unicode characters, rather than UTF-16 length. Regular expressions and searches for which no safe string can be selected use the source scanner. Treat characters that could cause missing results due to differences between SQLite and RE2 case conversion as candidate-string boundaries.
- Prepare the project root, server data base path, and hidden settings once while synchronously evaluating a file listing. Continue checking each target file's real path and the server data boundary. Do not pass the prepared function to the next request or an asynchronous task.
- Extend the existing `MEW_PERF_LOG=1` instrumentation with stages such as file reading and search-scope preparation. Do not add search terms, body text, accounts, or file paths to instrumentation fields.

Retain the current SQLite and PostgreSQL storage methods and source files. Do not introduce a new database or Redis. Consider them in a separate decision if repeated-query hit rates and production bottlenecks are confirmed. [Search functionality](../features/projects-files-search/filename-content-search-and-replacement.md) and [file browsing functionality](../features/projects-files-search/file-folder-exploration-and-operations.md) own the current contract.

## Rationale and Impact

SQLite [does not reorder CROSS JOINs](https://www.sqlite.org/optoverview.html#manual_control_of_query_plans_using_cross_join). [FTS5 trigram](https://www.sqlite.org/fts5.html#the_trigram_tokenizer) does not return MATCH results for substrings shorter than 3 Unicode characters. Account for both properties in queries and candidate selection.

Retain source comparison, dirty-file supplementation, and the scanner path during index construction and failures. The catalog does not store per-account permissions, and hidden settings and actual file boundaries are prepared and checked again on the next listing query. The change aims to reduce repeated work in existing paths; improvements in browser rendering, remote transfer, or total production loading time require separate measurements.
