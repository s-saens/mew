---
title: "Document backlink loading"
description: "Records the November 25 SQLite backlink cache and scan optimizations, synthetic timings, focused test results, and deployment status."
updated: "2026-11-25"
---

# Document backlink loading

The November 25 change reduces the time spent opening the backlink list. The server reuses Markdown analyses from SQLite across restarts, discovers directories in parallel batches, and avoids repeated copies of incoming edge sets. The [document graph contract](../development/document-graph.md#backlinks) defines cache invalidation and access checks.

## Local verification

A synthetic fixture used 2,500 source documents across 100 directories, all linking to one target. Over three runs, the previous backlink implementation took a median 1,111 ms with an empty in-memory cache and 257 ms on repeat requests. The new implementation took 1,242 ms to populate an empty SQLite cache, 163 ms after reopening the populated database with a fresh index, and 140 ms on repeat requests. The measurement used the index directly with an allow-all callback. It excludes HTTP, live permissions, network, and browser rendering.

The build, lint for the changed server files, and 12 focused tests passed. Tests covered access, edits, deletions, SQLite reuse and fallback, graph behavior, and the backlink popup on desktop and mobile viewports. Wiki description checks passed. The repository link check reported 39 errors in other files, including missing documentation maps.

The change was verified locally. Deployment, running-server behavior, and physical-device latency remain unverified.
