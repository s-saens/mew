---
title: "Linear-time execution of server search regular expressions"
description: "Records the decision and syntax compatibility scope for processing search, SSE, replacement, and filename regular expressions with RE2JS and prohibiting fallback to native RegExp to prevent excessive backtracking on the server event loop."
created: 2026-10-21
updated: 2026-10-21
---

## Status

Accepted. Code and isolated regression validation are complete. The user builds the app and applies it to the server.

## Background

Server search synchronously executed user regular expressions with Node.js native RegExp. Limiting only query length and result count cannot prevent excessive backtracking within a single pattern match. Searches by guests with read access through sharing can also delay responses across the entire server.

## Decision

Use `re2js`, a pure JavaScript RE2 port, for content search, SSE search, replacement, and filename regular expressions. Process the default wildcards for body search with the same engine. Reject unsupported lookahead, lookbehind, and pattern backreferences with errors, and do not fall back to native RegExp. Limit patterns to 2,000 characters and compiled instructions to 10,000.

[Search settings](../../../docs/configuration/search.md) and [Search features](../features/projects-files-search/filename-content-search-and-replacement.md) own the current syntax and replacement contracts.

## Rationale and Impact

Remove nonlinear backtracking from the existing search flow without building native modules or switching to asynchronous APIs. Retain capture replacement and Unicode result positions, but do not support every JavaScript regular expression syntax. File read volume and result count limits continue to apply, and linear-time execution does not guarantee immediate responses for documents of every size.

Isolated regression checks verify completion of nested repetition patterns, rejection of unsupported syntax, capture replacement, and HTTP error responses. Do not reproduce attacks against actual production requests or external systems.
