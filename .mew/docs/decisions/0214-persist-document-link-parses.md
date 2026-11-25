---
title: "0214: Persist document link analysis in SQLite"
description: "Chooses a bounded SQLite cache of Markdown link analysis for backlinks, with fresh discovery and permission checks and in-memory reverse edges."
status: accepted
date: "2026-11-25"
---

# Persist document link analysis in SQLite

## Context

Backlink requests traverse the workspace and its connected document roots. The shared Markdown analysis cache previously lived in memory, so a server restart forced the first backlink request to read and parse the documents again.

## Decision

Persist Markdown titles, body link destinations, and parent references in a private SQLite cache. Match cached analyses by canonical file path and file metadata. Keep per-scope reverse edges in memory and continue to check the current file inventory and access rules before returning results. See the [backlink processing contract](../development/document-graph.md#backlinks).

## Alternatives and consequences

The in-memory cache alone keeps repeat requests cheap within one process. Persisting its analysis also avoids repeating Markdown parsing across restarts. Persisting resolved reverse edges would require invalidation when discovery roots, permissions, or wiki filename ambiguity change. Storing the analysis keeps those decisions request-scoped.

The first scan of uncached documents still reads their bodies. Later scans check the filesystem so external edits, additions, and deletions can take effect on the next request. The SQLite cache is disposable and handles no authoritative document data.
