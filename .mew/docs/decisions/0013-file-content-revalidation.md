---
title: "0013 — File Content Version Checks and Asynchronous Caching"
description: "Decision to store file content in scoped IndexedDB and a per-root in-memory LRU, display cached content read-only first, and then check permissions and versions. Defines P2P-compatible JSON unchanged responses, draft and collaboration protection, and the scope of replacement for the existing localStorage content cache."
created: 2026-10-17
updated: 2026-10-17
---

# 0013 — File Content Version Checks and Asynchronous Caching

Status: Accepted.

## Background

Returning to a project cleared content from memory and repeatedly triggered synchronous content parsing and storage in localStorage. Even with a cache, the full content was fetched again, and the editor stayed hidden until the server responded, losing the benefit of displaying cached content immediately.

## Decision

Move the persistent content cache to IndexedDB scoped by account and instance, and retain memory caches for recent roots in a bounded LRU. Display cached content read-only before the response arrives, and start editing and collaboration after confirming the latest content and permissions. Do not seed collaboration rooms with stale content or autosave it to display the cache first.

Store the server file version together with cached content. For the same version, return a JSON unchanged response without reading or transmitting the content. Use the same path for HTTP and P2P without relying on HTTP 304. Recheck permissions on every request. Revalidate existing unversioned caches and local save results with a full fetch.

Replaces the **file content storage in localStorage** portion of the existing [ADR 0133](../history/decisions/0133-mew-browser-cache-budget-and-retention.md). Preserve the original lifetimes and budgets of other localStorage caches, drafts, and settings. Content IndexedDB has separate limits; the [File Retrieval Contract](../development/file-loading.md) owns detailed limits, migration, and verification.

## Rationale and Impact

This reduces synchronous content serialization and repeated transfers while checking current permissions and disk changes. Content can be viewed before verification, but editing waits for server confirmation. If the asynchronous cache fails, proceed with a server fetch; cache loss does not cause loss of source files or drafts.

Keep the Markdown document model and Yjs collaboration room lifetimes unchanged. Resident editor or socket pools and partial-document editing are outside this decision. Distinguish reduced transfer volume in isolated tests from total switching latency in actual installations.
