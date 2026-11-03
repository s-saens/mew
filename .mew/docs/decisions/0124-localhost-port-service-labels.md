---
title: "Name-first localhost port labels and process fallbacks"
description: "Extends port-list labels with actual owning process names when HTML titles are unavailable, and presents names before numeric port tags. Defines optional OS metadata, privacy boundaries, and honest fallback behavior."
created: "2026-11-03"
updated: "2026-11-03"
---

## Status

Accepted. Extends the optional page-title labels from [0123](0123-localhost-port-page-titles.md), retaining its HTTP lookup and navigation boundaries.

## Context

The user requested `{app title} [port]`, with the number styled as a tag. They also wanted non-web listeners to show why the port is open when that information can be established. HTML title lookup cannot identify database servers, SSH, or other non-HTTP services.

## Decision

Show each name before a compact numeric port tag. Prefer an HTML page title, then the actual listener-owning process name. Keep Mew's known label and disabled state. If no metadata is available, show the localized unnamed label and preserve selection behavior.

Read process names from OS listener ownership, in parallel with title lookup and under a bounded, cancellable deadline. Use Linux socket inodes and `comm`, macOS `lsof` command fields, and Windows listener owners joined to `ProcessName`. Return names only; read no command arguments or environment variables. Treat all names as untrusted plain text. Failures and hidden process metadata leave the list usable.

## Alternatives and rationale

- A port-to-service dictionary can misidentify arbitrary listeners, including apps using familiar service ports. It cannot establish why a port was opened.
- Command lines can identify scripts more precisely, but may contain secrets and paths. Actual process names supply a narrower, factual fallback.
- Replacing HTML titles with process names would turn descriptive app labels into generic names such as `node`. Titles retain priority.

## Consequences

Non-web listeners can show names such as `postgres` or `sshd`, but generic runtimes, process visibility restrictions, races, and scan bounds can still prevent a precise label. The process name identifies the owner and does not certify the service's purpose or HTTP support. Blocked services remain disabled. The [current contract](../development/port-preview.md#host-port-discovery) owns API fields and resource limits; the [work record](../work/localhost-port-page-titles.md#follow-up-name-first-port-tags-and-process-fallbacks) records checks and application limits.
